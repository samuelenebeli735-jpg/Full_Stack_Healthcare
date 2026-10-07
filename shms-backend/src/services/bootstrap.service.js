/**
 * First-run bootstrap: create the first organization and its administrator
 * in a freshly migrated, empty SHMS database.
 *
 * The bootstrap is deliberately NOT a migration tool and NOT a seeder:
 *  - it refuses databases without the migrated SHMS schema and RLS setup;
 *  - it refuses any database that already contains an organization;
 *  - it never runs against shms_db or shms_scale_db.
 *
 * It runs as the application role (no superuser, no BYPASSRLS) inside ONE
 * transaction: Organization (the tenant registry, no RLS by design) is
 * inserted first, then the transaction is pinned to the new organization so
 * the User and AuditLog inserts pass the normal RLS WITH CHECK policies.
 * Any failure rolls everything back.
 *
 * Nothing here logs. Callers print the returned result, which never contains
 * the password or its hash.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { createOrganizationSchema } from "../validations/organization.validation.js";
import { hashPassword } from "../utils/password.js";
import { TX_OPTIONS, setLocalGuc } from "../utils/tenantContext.js";
import { createOrganization } from "../repositories/organization.repository.js";
import { createUser } from "../repositories/user.repository.js";
import { createAuditLog } from "../repositories/audit.repository.js";

export const EXIT = Object.freeze({
  OK: 0,
  UNEXPECTED: 1,
  INVALID_INPUT: 2,
  UNSAFE_ENVIRONMENT: 3,
  ALREADY_INITIALIZED: 4,
});

export class BootstrapError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.name = "BootstrapError";
    this.exitCode = exitCode;
  }
}

const invalid = (message) => new BootstrapError(EXIT.INVALID_INPUT, message);
const unsafe = (message) => new BootstrapError(EXIT.UNSAFE_ENVIRONMENT, message);

// Never bootstrapped, whatever --confirm-database says.
export const PROTECTED_DATABASES = Object.freeze(["shms_db", "shms_scale_db"]);

// Tables that must have RLS enabled AND forced, with at least one policy.
export const TENANT_TABLES = Object.freeze([
  "Appointment",
  "AuditLog",
  "Consultation",
  "Department",
  "MedicalRecord",
  "MedicalRecordCounter",
  "Notification",
  "NotificationPreference",
  "Position",
  "Prescription",
  "PrescriptionItem",
  "Profile",
  "Queue",
  "Schedule",
  "Service",
  "Staff",
  "User",
]);

export const PASSWORD_MIN_CHARS = 12;
// bcrypt only uses the first 72 bytes; anything longer would be silently ignored.
export const PASSWORD_MAX_BYTES = 72;
const PASSWORD_FILE_MAX_BYTES = 1024;

// "SHMSBOOT" as a 64-bit integer: one fixed key, so concurrent runs queue up
// and the second one sees the first one's organization.
const BOOTSTRAP_LOCK_KEY = 6001131523461304148n;

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));

/*
|--------------------------------------------------------------------------
| Pre-connection checks (no database access)
|--------------------------------------------------------------------------
*/

export function isProtectedDatabase(name) {
  return PROTECTED_DATABASES.includes(String(name ?? "").trim().toLowerCase());
}

/**
 * The database name a connection URL points at.
 */
export function databaseNameFromUrl(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw unsafe("DATABASE_URL is not a valid connection URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw unsafe("DATABASE_URL must be a postgresql:// URL.");
  }
  let name;
  try {
    name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw unsafe("DATABASE_URL has an unreadable database name.");
  }
  if (!name || name.includes("/")) {
    throw unsafe("DATABASE_URL does not name a database.");
  }
  return name;
}

/**
 * Everything that can be refused before a connection is opened: the explicit
 * bootstrap flag, the protected databases and the operator's confirmation.
 * Returns the target database name.
 */
export function checkTarget({ bootstrapFlag, databaseUrl, confirmDatabase }) {
  if (bootstrapFlag !== "1") {
    throw unsafe("SHMS_BOOTSTRAP=1 is required; the bootstrap refuses to run without this explicit flag.");
  }
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") {
    throw unsafe("DATABASE_URL is not set.");
  }

  const name = databaseNameFromUrl(databaseUrl);
  if (isProtectedDatabase(name)) {
    throw unsafe(`Database "${name}" is protected; the bootstrap never runs against it.`);
  }

  if (typeof confirmDatabase !== "string" || confirmDatabase.trim() === "") {
    throw invalid("--confirm-database <name> is required and must name the target database.");
  }
  if (isProtectedDatabase(confirmDatabase)) {
    throw unsafe(`Database "${confirmDatabase}" is protected; the bootstrap never runs against it.`);
  }
  if (confirmDatabase !== name) {
    throw unsafe(
      `--confirm-database "${confirmDatabase}" does not match the database in DATABASE_URL ("${name}").`
    );
  }
  return name;
}

const ORGANIZATION_FLAGS = {
  name: "--org-name",
  slug: "--org-slug",
  email: "--org-email",
  phone: "--org-phone",
  address: "--org-address",
};

const adminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Administrator email is too long.")
  .email("Invalid administrator email address.");

/**
 * Validate the organization (with the API's own schema) and the
 * administrator email (trimmed, lowercased). Returns normalized values.
 */
export function validateBootstrapInput({ organization = {}, adminEmail } = {}) {
  const problems = [];

  const fields = {};
  for (const key of Object.keys(ORGANIZATION_FLAGS)) {
    if (organization[key] !== undefined) fields[key] = organization[key];
  }
  if (fields.name === undefined) problems.push("--org-name is required.");
  if (fields.slug === undefined) problems.push("--org-slug is required.");

  let org = null;
  if (problems.length === 0) {
    const parsed = createOrganizationSchema.safeParse(fields);
    if (parsed.success) {
      org = parsed.data;
    } else {
      for (const issue of parsed.error.issues) {
        const flag = ORGANIZATION_FLAGS[issue.path[0]] || "organization";
        problems.push(`${flag}: ${issue.message}`);
      }
    }
  }

  let email = null;
  if (adminEmail === undefined) {
    problems.push("--admin-email is required.");
  } else {
    const parsed = adminEmailSchema.safeParse(adminEmail);
    if (parsed.success) {
      email = parsed.data;
    } else {
      problems.push(`--admin-email: ${parsed.error.issues[0].message}`);
    }
  }

  if (problems.length > 0) {
    throw invalid(problems.join(" "));
  }

  return { organization: org, adminEmail: email };
}

/**
 * The password rules approved for the bootstrap administrator. Messages
 * never include the password.
 */
export function validatePassword(password, normalizedEmail) {
  if (typeof password !== "string" || password.length === 0) {
    throw invalid("A password is required.");
  }
  // bcrypt stops at a NUL byte, and line breaks only appear by accident.
  if (/[\0\r\n]/.test(password)) {
    throw invalid("The password must not contain line breaks or NUL characters.");
  }
  if ([...password].length < PASSWORD_MIN_CHARS) {
    throw invalid(`The password must be at least ${PASSWORD_MIN_CHARS} characters.`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw invalid(
      `The password must be at most ${PASSWORD_MAX_BYTES} bytes (bcrypt ignores anything longer).`
    );
  }
  if (normalizedEmail && password.trim().toLowerCase() === normalizedEmail) {
    throw invalid("The password must not be the administrator email address.");
  }
}

/**
 * Read a password from a file: one line, an optional trailing newline and
 * byte-order mark are stripped. On POSIX systems the file must not be
 * readable by group or others. Returns { password, warnings }.
 */
export function readPasswordFile(filePath, { platform = process.platform } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw invalid("The password file does not exist or cannot be read.");
  }
  if (!stat.isFile()) {
    throw invalid("The password file is not a regular file.");
  }
  if (stat.size > PASSWORD_FILE_MAX_BYTES) {
    throw invalid("The password file is too large to hold a single password.");
  }

  const warnings = [];
  if (platform === "win32") {
    warnings.push(
      "File permissions cannot be checked on Windows: make sure only you can read the password file."
    );
  } else if (stat.mode & 0o077) {
    throw unsafe("The password file is accessible to group/others; restrict it first (chmod 600).");
  }

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    throw invalid("The password file cannot be read.");
  }
  const password = content.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  return { password, warnings };
}

/*
|--------------------------------------------------------------------------
| Database checks (read-only)
|--------------------------------------------------------------------------
*/

function expectedMigrations() {
  try {
    return fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    throw unsafe("The prisma/migrations directory of this release cannot be read.");
  }
}

async function verifySchema(db) {
  const [present] = await db.$queryRawUnsafe(`
    SELECT pg_catalog.to_regclass('public."Organization"') IS NOT NULL AS organization,
           pg_catalog.to_regclass('public._prisma_migrations') IS NOT NULL AS migrations
  `);
  if (!present.organization || !present.migrations) {
    throw unsafe(
      "This database has no SHMS schema. The bootstrap is not a migration tool: " +
        "apply the migrations with the database owner role first."
    );
  }

  // Migrations: exactly this release's migrations, all finished.
  const rows = await db.$queryRawUnsafe(`
    SELECT migration_name,
           (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
           (finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished
      FROM public._prisma_migrations
  `);
  const unfinished = rows.filter((r) => r.unfinished).map((r) => r.migration_name);
  if (unfinished.length > 0) {
    throw unsafe(`A migration failed or is still running: ${unfinished.join(", ")}.`);
  }
  const applied = new Set(rows.filter((r) => r.applied).map((r) => r.migration_name));
  const expected = expectedMigrations();
  const missing = expected.filter((name) => !applied.has(name));
  if (missing.length > 0) {
    throw unsafe(`The database is missing migrations of this release: ${missing.join(", ")}.`);
  }
  const unknown = [...applied].filter((name) => !expected.includes(name));
  if (unknown.length > 0) {
    throw unsafe(
      `The database has migrations this release does not know (newer schema?): ${unknown.join(", ")}.`
    );
  }

  // Row-level security: enabled, forced and with a policy on every tenant table.
  const tables = await db.$queryRawUnsafe(`
    SELECT c.relname AS name,
           c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_catalog.pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const byName = new Map(tables.map((t) => [t.name, t]));
  const rlsProblems = [];
  for (const name of TENANT_TABLES) {
    const t = byName.get(name);
    if (!t) rlsProblems.push(`${name} (missing)`);
    else if (!t.enabled) rlsProblems.push(`${name} (RLS disabled)`);
    else if (!t.forced) rlsProblems.push(`${name} (RLS not forced)`);
    else if (t.policies < 1) rlsProblems.push(`${name} (no policy)`);
  }
  if (rlsProblems.length > 0) {
    throw unsafe(`Row-level security is not fully configured: ${rlsProblems.join(", ")}.`);
  }

  // The tenant-visibility and login lookup functions the application relies on.
  const functions = await db.$queryRawUnsafe(`
    SELECT p.proname AS name, p.prosecdef AS security_definer
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('shms_row_visible', 'shms_auth_user')
  `);
  const fn = new Map(functions.map((f) => [f.name, f]));
  if (!fn.has("shms_row_visible") || !fn.get("shms_auth_user")?.security_definer) {
    throw unsafe("The RLS helper functions (shms_row_visible, shms_auth_user) are missing.");
  }

  const [privileges] = await db.$queryRawUnsafe(`
    SELECT pg_catalog.has_table_privilege('public."Organization"', 'INSERT') AS organization,
           pg_catalog.has_table_privilege('public."User"', 'INSERT') AS "user",
           pg_catalog.has_table_privilege('public."AuditLog"', 'INSERT') AS audit
  `);
  if (!privileges.organization || !privileges.user || !privileges.audit) {
    throw unsafe("The database role cannot insert organizations, users and audit records.");
  }
}

/**
 * Connected-database checks: the confirmed database, a role that is subject
 * to RLS, and the migrated schema with its RLS configuration.
 */
export async function verifyTarget(db, expectedDatabase) {
  const [info] = await db.$queryRawUnsafe(`
    SELECT pg_catalog.current_database() AS database,
           current_user AS role,
           r.rolsuper AS superuser,
           r.rolbypassrls AS bypass_rls
      FROM pg_catalog.pg_roles r
     WHERE r.rolname = current_user
  `);
  if (!info) {
    throw unsafe("The database role could not be identified.");
  }
  if (isProtectedDatabase(info.database)) {
    throw unsafe(`Database "${info.database}" is protected; the bootstrap never runs against it.`);
  }
  if (info.database !== expectedDatabase) {
    throw unsafe(
      `Connected to database "${info.database}", but --confirm-database is "${expectedDatabase}".`
    );
  }
  if (info.superuser || info.bypass_rls) {
    throw unsafe(
      `Database role "${info.role}" is a superuser or bypasses row-level security; ` +
        "connect as the application role (shms_app)."
    );
  }

  await verifySchema(db);
  return { database: info.database, role: info.role };
}

/**
 * Refuse unless the database holds no organization. Every tenant row
 * (users included) references an organization, so zero organizations means
 * an uninitialized database. Organization has no RLS, so the count is global.
 */
export async function assertNoOrganizations(db) {
  const rows = await db.$queryRawUnsafe(
    'SELECT slug FROM public."Organization" ORDER BY "createdAt" LIMIT 2'
  );
  if (rows.length > 0) {
    const [{ n }] = await db.$queryRawUnsafe(
      'SELECT count(*)::int AS n FROM public."Organization"'
    );
    const which = n === 1 ? ` ("${rows[0].slug}")` : "";
    throw new BootstrapError(
      EXIT.ALREADY_INITIALIZED,
      `The database is already initialized: it contains ${n} organization(s)${which}. Nothing was changed.`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Bootstrap
|--------------------------------------------------------------------------
*/

class DryRunRollback extends Error {
  constructor(result) {
    super("dry run");
    this.result = result;
  }
}

/**
 * Create the first organization and its active administrator, plus a
 * BOOTSTRAP audit record, in one transaction.
 *
 * @param {object} input        { organization, adminEmail, password }
 * @param {object} options
 * @param {object} options.db               Prisma client
 * @param {string} options.expectedDatabase confirmed database name
 * @param {boolean} [options.dryRun]        run everything, then roll back
 * @param {object} [options.testHooks]      test-only failure injection
 *        ({ afterOrganization, afterUser, afterAudit }); never exposed by the CLI
 * @returns {Promise<object>} ids and public fields only (no password or hash)
 */
export async function bootstrapOrganization(
  input,
  { db, expectedDatabase, dryRun = false, testHooks = {} } = {}
) {
  if (!db) throw new Error("bootstrapOrganization requires a database client.");

  const { organization, adminEmail } = validateBootstrapInput(input);
  validatePassword(input?.password, adminEmail);

  const target = await verifyTarget(db, expectedDatabase);

  // Hash before the transaction opens, so the transaction stays short.
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_catalog.pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;
      await assertNoOrganizations(tx);

      const org = await createOrganization(organization, tx);
      await testHooks.afterOrganization?.(tx);

      // From here on the transaction is the new tenant: RLS WITH CHECK
      // applies to every insert, and no bypass is in effect.
      await setLocalGuc(tx, "app.bypass_rls", "");
      await setLocalGuc(tx, "app.organization_id", org.id);

      const admin = await createUser(
        {
          organizationId: org.id,
          email: adminEmail,
          password: passwordHash,
          role: "admin",
          isActive: true,
        },
        tx
      );
      await testHooks.afterUser?.(tx);

      const audit = await createAuditLog(
        {
          organizationId: org.id,
          userId: admin.id,
          action: "BOOTSTRAP",
          entity: "Organization",
          entityId: org.id,
          description: `Initial organization "${org.name}" and administrator ${admin.email} created by the bootstrap command.`,
          userAgent: "shms-bootstrap-cli",
        },
        tx
      );
      await testHooks.afterAudit?.(tx);

      const result = {
        database: target.database,
        role: target.role,
        dryRun,
        organization: { id: org.id, name: org.name, slug: org.slug },
        admin: { id: admin.id, email: admin.email, role: admin.role },
        auditLogId: audit.id,
      };

      if (dryRun) throw new DryRunRollback(result);
      return result;
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  }
}

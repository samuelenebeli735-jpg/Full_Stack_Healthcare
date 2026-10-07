/**
 * Bootstrap integration tests against DISPOSABLE databases.
 *
 *   BOOTSTRAP_TEST_DATABASE_URL=postgresql://shms_app:...@host:5432/shms_bootstrap_test_db \
 *   [BOOTSTRAP_TEST_RACE_DATABASE_URL=.../shms_bootstrap_race_test_db] \
 *   [BOOTSTRAP_TEST_RACE_CLI_DATABASE_URL=.../shms_bootstrap_race_cli_test_db] \
 *   [BOOTSTRAP_TEST_NOSCHEMA_DATABASE_URL=.../shms_bootstrap_noschema_test_db] \
 *   [BOOTSTRAP_TEST_POPULATED_DATABASE_URL=.../<any populated SHMS database>] \
 *   node --test --test-concurrency=1 test/bootstrap.integration.test.mjs
 *
 * Every writable database must be named shms_bootstrap_* and, except the
 * no-schema one, be a migrated SHMS schema with no rows (schema-only copy
 * plus _prisma_migrations). The populated database is only ever opened in a
 * read-only session. Tests whose variable is unset are skipped. The suite
 * starts the API on BOOTSTRAP_TEST_API_PORT (default 5111).
 *
 * Passwords and the JWT secret are generated per run and never printed.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "src", "cli", "bootstrap.js");
const API_PORT = Number(process.env.BOOTSTRAP_TEST_API_PORT || 5111);

const MAIN_URL = process.env.BOOTSTRAP_TEST_DATABASE_URL;
const RACE_URL = process.env.BOOTSTRAP_TEST_RACE_DATABASE_URL;
const RACE_CLI_URL = process.env.BOOTSTRAP_TEST_RACE_CLI_DATABASE_URL;
const NOSCHEMA_URL = process.env.BOOTSTRAP_TEST_NOSCHEMA_DATABASE_URL;
const POPULATED_URL = process.env.BOOTSTRAP_TEST_POPULATED_DATABASE_URL;

const dbName = (url) => decodeURIComponent(new URL(url).pathname.slice(1));
const dbPassword = (url) => decodeURIComponent(new URL(url).password || "");

function requireDisposable(url, label) {
  if (!url) return;
  const name = dbName(url);
  if (!/^shms_bootstrap_[a-z0-9_]+$/.test(name)) {
    throw new Error(`${label} must name a disposable shms_bootstrap_* database (got "${name}").`);
  }
}
requireDisposable(MAIN_URL, "BOOTSTRAP_TEST_DATABASE_URL");
requireDisposable(RACE_URL, "BOOTSTRAP_TEST_RACE_DATABASE_URL");
requireDisposable(RACE_CLI_URL, "BOOTSTRAP_TEST_RACE_CLI_DATABASE_URL");
requireDisposable(NOSCHEMA_URL, "BOOTSTRAP_TEST_NOSCHEMA_DATABASE_URL");

// The populated database is opened read-only, whatever the bootstrap tries.
const readOnly = (url) => {
  const u = new URL(url);
  u.searchParams.set("options", "-c default_transaction_read_only=on");
  return u.toString();
};
if (POPULATED_URL && /^shms_(scale_)?db$/i.test(dbName(POPULATED_URL))) {
  throw new Error("BOOTSTRAP_TEST_POPULATED_DATABASE_URL must not be shms_db or shms_scale_db.");
}

// The app's own db module (used through withTenant) must land on the main test database.
process.env.DATABASE_URL = MAIN_URL || "postgresql://none@127.0.0.1:1/shms_bootstrap_none";

const { PrismaClient } = await import("@prisma/client");
const { withTenant } = await import("../src/utils/tenantContext.js");
const service = await import("../src/services/bootstrap.service.js");
const { comparePassword } = await import("../src/utils/password.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "shms-boot-it-"));
const JWT_SECRET = crypto.randomBytes(48).toString("hex");
const ADMIN_PASSWORD = `Bt-${crypto.randomBytes(18).toString("base64url")}`;
const SECRETS = new Set([ADMIN_PASSWORD, JWT_SECRET]);
for (const url of [MAIN_URL, RACE_URL, RACE_CLI_URL, NOSCHEMA_URL, POPULATED_URL].filter(Boolean)) {
  SECRETS.add(url);
  SECRETS.add(readOnly(url));
  if (dbPassword(url).length >= 4) SECRETS.add(dbPassword(url));
}
const transcript = []; // every CLI and API output, checked for secrets at the end
const clients = [];

after(async () => {
  for (const c of clients) await c.$disconnect().catch(() => {});
  fs.rmSync(TMP, { recursive: true, force: true });
});

function client(url) {
  const c = new PrismaClient({ datasourceUrl: url });
  clients.push(c);
  return c;
}

function passwordFile(content, name = crypto.randomUUID()) {
  const f = path.join(TMP, name);
  fs.writeFileSync(f, content, { mode: 0o600 });
  return f;
}

function runCli(args, { url, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: TMP, // no .env here
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        SHMS_BOOTSTRAP: "1",
        DATABASE_URL: url,
        JWT_SECRET, // present in the environment, must never be printed
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.stdin.end();
    child.on("close", (code) => {
      transcript.push(out, err);
      resolve({ code, out, err });
    });
  });
}

const orgArgs = (slug, email) => ["--org-name", `Bootstrap ${slug}`, "--org-slug", slug, "--admin-email", email];

// Global row counts through the application's own read-only super-admin
// view (transaction-local GUCs, as in withSuperAdmin).
async function counts(db) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_catalog.set_config('app.organization_id', '', true)");
    await tx.$executeRawUnsafe("SELECT pg_catalog.set_config('app.bypass_rls', 'true', true)");
    const [row] = await tx.$queryRawUnsafe(`
      SELECT (SELECT count(*)::int FROM public."Organization") AS orgs,
             (SELECT count(*)::int FROM public."User") AS users,
             (SELECT count(*)::int FROM public."AuditLog") AS audits,
             (SELECT count(*)::int FROM public."Department") AS departments`);
    return row;
  });
}

const ZERO = { orgs: 0, users: 0, audits: 0, departments: 0 };

/* ======================= main disposable database ======================= */

const main = MAIN_URL ? client(MAIN_URL) : null;
const ADMIN_EMAIL_INPUT = "  First.Admin@Bootstrap.Test ";
const ADMIN_EMAIL = "first.admin@bootstrap.test";
const SLUG = "first-clinic";
const mainArgs = (extra = []) => ["--confirm-database", dbName(MAIN_URL), ...orgArgs(SLUG, ADMIN_EMAIL_INPUT), ...extra];
const state = {};

test("main: the test database is a migrated, empty SHMS schema", { skip: !MAIN_URL }, async () => {
  assert.deepEqual(await counts(main), ZERO);
  await service.verifyTarget(main, dbName(MAIN_URL));
});

test("main: no terminal and no --password-file is refused (exit 2), nothing written", { skip: !MAIN_URL }, async () => {
  const r = await runCli(mainArgs(), { url: MAIN_URL });
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /No terminal for the hidden password prompt/);
  assert.deepEqual(await counts(main), ZERO);
});

test("main: weak, too long, email-equal and multi-line passwords are refused (exit 2)", { skip: !MAIN_URL }, async () => {
  const cases = [
    ["Short-pw-11", /at least 12/],
    ["x".repeat(73), /at most 72 bytes/],
    ["ü".repeat(37), /at most 72 bytes/],
    [ADMIN_EMAIL.toUpperCase(), /must not be the administrator email/],
    ["line-one-pass\nline-two", /line breaks/],
    ["", /required/],
  ];
  for (const [pw, pattern] of cases) {
    const r = await runCli(mainArgs(["--password-file", passwordFile(pw)]), { url: MAIN_URL });
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, pattern);
    if (pw) assert.ok(!r.out.includes(pw) && !r.err.includes(pw));
  }
  const missing = await runCli(mainArgs(["--password-file", path.join(TMP, "does-not-exist")]), { url: MAIN_URL });
  assert.equal(missing.code, 2);
  assert.deepEqual(await counts(main), ZERO);
});

test("main: --dry-run runs every step and rolls back (exit 0, nothing written)", { skip: !MAIN_URL }, async () => {
  const r = await runCli(mainArgs(["--password-file", passwordFile(`${ADMIN_PASSWORD}\n`), "--dry-run"]), { url: MAIN_URL });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /DRY RUN/);
  assert.match(r.out, new RegExp(`Administrator:\\s+${ADMIN_EMAIL.replace(/\./g, "\\.")}`));
  assert.deepEqual(await counts(main), ZERO);
});

for (const hook of ["afterOrganization", "afterUser", "afterAudit"]) {
  test(`main: a failure ${hook.replace("after", "after ").toLowerCase()} creation rolls everything back`, { skip: !MAIN_URL }, async () => {
    let reached = false;
    await assert.rejects(
      service.bootstrapOrganization(
        { organization: { name: "Hook Clinic", slug: "hook-clinic" }, adminEmail: "hook@bootstrap.test", password: ADMIN_PASSWORD },
        {
          db: main,
          expectedDatabase: dbName(MAIN_URL),
          testHooks: {
            [hook]: async (tx) => {
              // The rows exist inside the transaction at this point.
              const [{ n }] = await tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM public."Organization"');
              assert.equal(n, 1);
              reached = true;
              throw new Error(`injected failure ${hook}`);
            },
          },
        }
      ),
      new RegExp(`injected failure ${hook}`)
    );
    assert.ok(reached);
    assert.deepEqual(await counts(main), ZERO);
  });
}

test("main: SIGKILL in the middle of the transaction leaves nothing behind", { skip: !MAIN_URL }, async () => {
  const code = `
    const fs = await import("node:fs");
    const service = await import(${JSON.stringify(new URL("../src/services/bootstrap.service.js", import.meta.url).href)});
    const { default: prisma } = await import(${JSON.stringify(new URL("../src/config/db.js", import.meta.url).href)});
    await service.bootstrapOrganization(
      { organization: { name: "Killed Clinic", slug: "killed-clinic" }, adminEmail: "killed@bootstrap.test", password: fs.readFileSync(process.argv[1], "utf8") },
      { db: prisma, expectedDatabase: ${JSON.stringify(dbName(MAIN_URL || "x:/x"))},
        testHooks: { afterUser: async () => {
          setInterval(() => {}, 60000); // keep the process (and its open transaction) alive
          console.log("PAUSED");
          await new Promise(() => {});
        } } });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code, passwordFile(ADMIN_PASSWORD)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: MAIN_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`child never paused: ${err}`)), 20000);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("PAUSED")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  // Mid-transaction: the lock is held and nothing is visible outside.
  const [{ held }] = await main.$queryRawUnsafe(
    "SELECT count(*)::int AS held FROM pg_catalog.pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()) AND granted"
  );
  assert.equal(held, 1, "advisory lock held by the paused bootstrap");
  assert.deepEqual(await counts(main), ZERO);

  assert.equal(child.exitCode, null, "the child is still inside the transaction");
  const exited = new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
  assert.ok(child.kill("SIGKILL"));
  const how = await exited;
  assert.ok(how.signal === "SIGKILL" || how.code !== 0, `child was killed: ${JSON.stringify(how)}`);
  transcript.push(out, err);

  // The server notices the dropped connection and rolls back.
  let locks = 1;
  for (let i = 0; i < 50 && locks > 0; i += 1) {
    [{ held: locks }] = await main.$queryRawUnsafe(
      "SELECT count(*)::int AS held FROM pg_catalog.pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())"
    );
    if (locks > 0) await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(locks, 0, "advisory lock released after the kill");
  assert.deepEqual(await counts(main), ZERO);
});

test("main: successful bootstrap creates exactly one organization, admin and audit record", { skip: !MAIN_URL }, async () => {
  const r = await runCli(mainArgs(["--password-file", passwordFile(`${ADMIN_PASSWORD}\r\n`)]), { url: MAIN_URL });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /SHMS bootstrap complete\./);

  assert.deepEqual(await counts(main), { orgs: 1, users: 1, audits: 1, departments: 0 });

  const [org] = await main.$queryRawUnsafe('SELECT id, name, slug, "isActive" FROM public."Organization"');
  assert.equal(org.slug, SLUG);
  assert.equal(org.name, `Bootstrap ${SLUG}`);
  assert.equal(org.isActive, true);
  assert.ok(r.out.includes(org.id), "organization id printed");

  const admin = await withTenant(org.id, (tx) => tx.user.findFirst());
  assert.equal(admin.email, ADMIN_EMAIL, "email trimmed and lowercased");
  assert.equal(admin.role, "admin");
  assert.equal(admin.isActive, true);
  assert.equal(admin.organizationId, org.id);
  assert.equal(admin.resetToken, null);
  assert.match(admin.password, /^\$2[aby]\$10\$/, "bcrypt with the application's cost");
  assert.equal(await comparePassword(ADMIN_PASSWORD, admin.password), true);
  SECRETS.add(admin.password);

  const audit = await withTenant(org.id, (tx) => tx.auditLog.findFirst());
  assert.equal(audit.action, "BOOTSTRAP");
  assert.equal(audit.entity, "Organization");
  assert.equal(audit.entityId, org.id);
  assert.equal(audit.userId, admin.id);
  assert.equal(audit.organizationId, org.id);
  assert.ok(!audit.description.includes(ADMIN_PASSWORD));

  const staff = await withTenant(org.id, (tx) => tx.staff.count());
  const profiles = await withTenant(org.id, (tx) => tx.profile.count());
  assert.equal(staff + profiles, 0, "no Staff or Profile record is created");

  state.org = org;
  state.admin = { id: admin.id, updatedAt: admin.updatedAt.toISOString() };
  state.audit = audit.id;
});

test("main: a duplicate bootstrap exits 4 and changes nothing", { skip: !MAIN_URL }, async () => {
  assert.ok(state.org, "requires the successful bootstrap");
  const before = await counts(main);
  for (const extra of [[], ["--dry-run"]]) {
    const r = await runCli(
      ["--confirm-database", dbName(MAIN_URL), ...orgArgs("second-clinic", "second@bootstrap.test"),
        "--password-file", passwordFile(ADMIN_PASSWORD), ...extra],
      { url: MAIN_URL }
    );
    assert.equal(r.code, 4, r.err);
    assert.match(r.err, /already initialized: it contains 1 organization\(s\) \("first-clinic"\)/);
  }
  // The service refuses too, under its own lock.
  await assert.rejects(
    service.bootstrapOrganization(
      { organization: { name: "Second", slug: "second-clinic" }, adminEmail: "second@bootstrap.test", password: ADMIN_PASSWORD },
      { db: main, expectedDatabase: dbName(MAIN_URL) }
    ),
    (e) => e.exitCode === 4
  );
  assert.deepEqual(await counts(main), before);
  const admin = await withTenant(state.org.id, (tx) => tx.user.findUnique({ where: { id: state.admin.id } }));
  assert.equal(admin.updatedAt.toISOString(), state.admin.updatedAt, "admin row untouched");
});

/* ---------------- API: login and admin endpoints ---------------- */

let api = null;
const BASE = `http://127.0.0.1:${API_PORT}/api/v1`;

async function startApi() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "production",
      PORT: String(API_PORT),
      HOST: "127.0.0.1",
      TZ: "Africa/Lagos",
      DATABASE_URL: MAIN_URL,
      JWT_SECRET,
      FRONTEND_URL: "https://clinic.example.org",
      CORS_ORIGINS: "https://clinic.example.org",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = { text: "" };
  child.stdout.on("data", (d) => (log.text += d));
  child.stderr.on("data", (d) => (log.text += d));
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return { child, log };
    } catch {
      // not up yet
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`API did not start on ${API_PORT}`);
}

async function call(method, route, token, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  transcript.push(text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

test("api: the bootstrap admin can sign in with the chosen password", { skip: !MAIN_URL }, async () => {
  assert.ok(state.org, "requires the successful bootstrap");
  api = await startApi();

  const wrong = await call("POST", "/auth/login", null, { identifier: ADMIN_EMAIL, password: `${ADMIN_PASSWORD}x` });
  assert.equal(wrong.status, 401);

  const login = await call("POST", "/auth/login", null, { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const { user, token } = login.json.data;
  assert.equal(user.role, "admin");
  assert.equal(user.organizationId, state.org.id);
  assert.equal(user.id, state.admin.id);
  assert.equal(user.password, undefined);
  assert.ok(token);
  state.token = token;
});

test("api: admin endpoints work for the bootstrap admin's organization", { skip: !MAIN_URL }, async () => {
  assert.ok(state.token, "requires the login");
  const own = state.org.id;
  const checks = [
    ["/auth/verify", 200],
    ["/dashboard", 200],
    ["/audit", 200],
    [`/audit/organization/${own}`, 200],
    [`/departments/organization/${own}`, 200],
    [`/positions/organization/${own}`, 200],
    [`/staff/organization/${own}`, 200],
    ["/organizations", 403], // organization management stays super_admin-only
  ];
  for (const [route, expected] of checks) {
    const r = await call("GET", route, state.token);
    assert.equal(r.status, expected, `${route} -> ${r.status}`);
  }
  const audit = await call("GET", "/audit", state.token);
  const actions = JSON.stringify(audit.json);
  assert.match(actions, /BOOTSTRAP/);
  assert.match(actions, /LOGIN/);
});

/* ---------------- tenant isolation ---------------- */

test("isolation: RLS verification (verify.mjs checks) with the bootstrap admin and a second tenant", { skip: !MAIN_URL }, async (t) => {
  assert.ok(state.token, "requires the login");
  const { withSuperAdmin } = await import("../src/utils/tenantContext.js");
  const { default: appDb } = await import("../src/config/db.js");
  const results = [];
  const ok = (label, cond, extra = "") => results.push({ label, pass: Boolean(cond), extra });

  // A second tenant, created through the normal RLS path (test data in the disposable database).
  const other = await main.organization.create({ data: { name: "Other Clinic", slug: "other-clinic" } });
  const otherUser = await withTenant(other.id, async (tx) => {
    await tx.department.create({ data: { organizationId: other.id, name: "Other Dept", code: "OTH" } });
    await tx.position.create({ data: { organizationId: other.id, name: "Other Position", code: "OTP" } });
    await tx.auditLog.create({ data: { organizationId: other.id, action: "TEST", entity: "Organization", entityId: other.id } });
    return tx.user.create({
      data: { organizationId: other.id, email: "other.user@bootstrap.test", password: "x", role: "staff" },
    });
  });
  const tenants = [
    { ...state.org, probe: state.admin.id },
    { id: other.id, slug: other.slug, probe: otherUser.id },
  ];

  // 1. no-context read fails closed (a fresh connection and the app's own pool).
  const bare = client(MAIN_URL);
  ok("no-context read returns 0 rows (fresh connection)", (await bare.user.count()) === 0);
  ok("no-context read returns 0 rows (application pool)", (await appDb.user.count()) === 0);

  // 2. the tenant GUC does not leak after transactions.
  const [{ v }] = await appDb.$queryRawUnsafe("SELECT current_setting('app.organization_id', true) AS v");
  ok("GUC does not leak after transactions", v === "" || v === null, JSON.stringify(v));

  // 3. per-tenant counts partition the global count.
  const models = [
    "user", "profile", "staff", "department", "position", "service", "schedule",
    "appointment", "queue", "consultation", "prescription", "prescriptionItem",
    "medicalRecord", "auditLog", "notification", "notificationPreference",
  ];
  for (const m of models) {
    let sum = 0;
    for (const o of tenants) sum += await withTenant(o.id, (tx) => tx[m].count());
    const global = await withSuperAdmin((tx) => tx[m].count());
    ok(`partition ${m}: sum(${sum}) == global(${global})`, sum === global);
  }

  // 4. cross-tenant invisibility and blocked writes, both directions.
  for (const o of tenants) {
    const target = tenants.find((x) => x.id !== o.id);
    const hidden = await withTenant(target.id, (tx) => tx.user.findFirst({ where: { id: o.probe }, select: { id: true } }));
    ok(`user(${o.slug}) invisible in ${target.slug} ctx`, hidden === null);
    let upd;
    try {
      upd = await withTenant(target.id, (tx) => tx.user.updateMany({ where: { id: o.probe }, data: { isActive: false } }));
    } catch {
      upd = -1;
    }
    ok(`cross-tenant update of ${o.slug} user from ${target.slug} affects 0 rows`, upd?.count === 0);
    const intact = await withTenant(o.id, (tx) => tx.user.findFirst({ where: { id: o.probe }, select: { isActive: true } }));
    ok(`${o.slug} probe user intact after cross-tenant attempt`, intact !== null && intact.isActive !== false);
    let del;
    try {
      del = await withTenant(target.id, (tx) => tx.user.deleteMany({ where: { id: o.probe } }));
    } catch {
      del = -1;
    }
    ok(`cross-tenant delete of ${o.slug} user from ${target.slug} affects 0 rows`, del?.count === 0);
    const still = await withTenant(o.id, (tx) => tx.user.findFirst({ where: { id: o.probe }, select: { id: true } }));
    ok(`${o.slug} probe user still present after delete attempt`, still !== null);
  }
  let smuggled;
  try {
    await withTenant(other.id, (tx) =>
      tx.user.create({ data: { organizationId: state.org.id, email: "smuggled@bootstrap.test", password: "x", role: "admin" } })
    );
    smuggled = true;
  } catch {
    smuggled = false;
  }
  ok("insert into another tenant is blocked by WITH CHECK", !smuggled);
  let superWrite;
  try {
    await withSuperAdmin((tx) => tx.department.create({ data: { organizationId: state.org.id, name: "X", code: "X1" } }));
    superWrite = true;
  } catch {
    superWrite = false;
  }
  ok("super-admin view cannot write", !superWrite);

  // 5. API: the bootstrap admin is confined to its own organization.
  ok("admin token from bootstrap login", Boolean(state.token));
  for (const route of ["departments", "staff", "audit"]) {
    const r = await call("GET", `/${route}/organization/${other.id}`, state.token);
    ok(`admin request other-org ${route} -> 403`, r.status === 403, `got ${r.status}`);
    const mine = await call("GET", `/${route}/organization/${state.org.id}`, state.token);
    ok(`admin request own-org ${route} -> 200`, mine.status === 200, `got ${mine.status}`);
  }
  // Positions answer with the caller's own organization whatever id is asked
  // for (existing behavior): refused or own data only are both isolation-safe.
  const pos = await call("GET", `/positions/organization/${other.id}`, state.token);
  ok(
    "admin request other-org positions -> 403 or own data only",
    pos.status === 403 || (pos.status === 200 && !JSON.stringify(pos.json).includes(other.id)),
    `got ${pos.status}`
  );
  const auditList = await call("GET", "/audit", state.token);
  ok("admin audit list holds only its organization", auditList.status === 200 && !JSON.stringify(auditList.json).includes(other.id));

  const failed = results.filter((r) => !r.pass);
  t.diagnostic(`RLS verification: ${results.length - failed.length}/${results.length} checks passed`);
  for (const r of results) t.diagnostic(`${r.pass ? "PASS" : "FAIL"}  ${r.label}${r.extra ? " " + r.extra : ""}`);
  assert.deepEqual(failed, [], "every RLS verification check passes");
  const admin = await withTenant(state.org.id, (tx) => tx.user.findUnique({ where: { id: state.admin.id } }));
  assert.equal(admin.isActive, true);
});

test("rls: FORCE RLS is still enabled on every tenant table, policies intact", { skip: !MAIN_URL }, async () => {
  const rows = await main.$queryRawUnsafe(`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`);
  const byName = new Map(rows.map((r) => [r.name, r]));
  for (const t of service.TENANT_TABLES) {
    const r = byName.get(t);
    assert.ok(r && r.enabled && r.forced && r.policies >= 1, `${t}: ${JSON.stringify(r)}`);
  }
  assert.equal(byName.get("Organization").enabled, false, "Organization remains the tenant registry without RLS");
  const [role] = await main.$queryRawUnsafe(
    "SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user"
  );
  assert.equal(role.rolsuper || role.rolbypassrls, false);
});

test("api: stop the test API", { skip: !MAIN_URL }, async () => {
  if (!api) return;
  const exited = new Promise((resolve) => api.child.on("close", resolve));
  api.child.kill();
  await exited;
  transcript.push(api.log.text);
  assert.doesNotMatch(api.log.text, /FATAL/);
  assert.ok(!api.log.text.includes(state.token), "the session token is not logged");
});

/* ======================= concurrency ======================= */

test("race: two concurrent bootstraps in one process cannot both succeed (lock)", { skip: !RACE_URL }, async () => {
  const db = client(RACE_URL);
  assert.deepEqual(await counts(db), ZERO);
  const opts = { db, expectedDatabase: dbName(RACE_URL) };
  const started = Date.now();
  const first = service.bootstrapOrganization(
    { organization: { name: "Race One", slug: "race-one" }, adminEmail: "one@bootstrap.test", password: ADMIN_PASSWORD },
    { ...opts, testHooks: { afterOrganization: () => new Promise((r) => setTimeout(r, 2000)) } }
  );
  await new Promise((r) => setTimeout(r, 400));
  const second = service.bootstrapOrganization(
    { organization: { name: "Race Two", slug: "race-two" }, adminEmail: "two@bootstrap.test", password: ADMIN_PASSWORD },
    opts
  );
  const [a, b] = await Promise.allSettled([first, second]);
  assert.equal(a.status, "fulfilled", String(a.reason));
  assert.equal(b.status, "rejected");
  assert.equal(b.reason.exitCode, 4, String(b.reason?.message));
  assert.ok(Date.now() - started >= 1900, "the second run waited for the lock");
  assert.deepEqual(await counts(db), { orgs: 1, users: 1, audits: 1, departments: 0 });
});

test("race: two simultaneous CLI runs, exactly one succeeds", { skip: !RACE_CLI_URL }, async () => {
  const db = client(RACE_CLI_URL);
  assert.deepEqual(await counts(db), ZERO);
  const pw = passwordFile(ADMIN_PASSWORD);
  const results = await Promise.all(
    ["alpha", "beta", "gamma"].map((n) =>
      runCli(["--confirm-database", dbName(RACE_CLI_URL), ...orgArgs(`race-${n}`, `${n}@bootstrap.test`), "--password-file", pw], {
        url: RACE_CLI_URL,
      })
    )
  );
  const codes = results.map((r) => r.code).sort();
  assert.deepEqual(codes, [0, 4, 4], results.map((r) => r.err).join(" | "));
  assert.deepEqual(await counts(db), { orgs: 1, users: 1, audits: 1, departments: 0 });
});

/* ======================= unsafe targets ======================= */

test("no-schema: a database without the SHMS schema is refused (exit 3), nothing created", { skip: !NOSCHEMA_URL }, async () => {
  const r = await runCli(
    ["--confirm-database", dbName(NOSCHEMA_URL), ...orgArgs("noschema-clinic", "x@bootstrap.test"), "--password-file", passwordFile(ADMIN_PASSWORD)],
    { url: NOSCHEMA_URL }
  );
  assert.equal(r.code, 3, r.err);
  assert.match(r.err, /no SHMS schema.*not a migration tool/);
  const db = client(NOSCHEMA_URL);
  const [{ n }] = await db.$queryRawUnsafe(
    "SELECT count(*)::int AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public'"
  );
  assert.equal(n, 0, "no relation was created");
});

test("populated: an initialized database is refused (exit 4) in a read-only session", { skip: !POPULATED_URL }, async () => {
  const url = readOnly(POPULATED_URL);
  const r = await runCli(
    ["--confirm-database", dbName(POPULATED_URL), ...orgArgs("populated-clinic", "x@bootstrap.test"), "--password-file", passwordFile(ADMIN_PASSWORD)],
    { url }
  );
  assert.equal(r.code, 4, r.err);
  assert.match(r.err, /already initialized: it contains \d+ organization\(s\)/);
  assert.equal(r.out, "");
});

/* ======================= secrets ======================= */

test("secrets: no password, hash, token, DATABASE_URL or JWT secret in any output", async () => {
  const all = transcript.join("\n");
  assert.ok(all.length > 0 || !MAIN_URL);
  for (const secret of SECRETS) {
    assert.ok(!all.includes(secret), "a secret appeared in CLI/API output");
  }
  assert.doesNotMatch(all, /\$2[aby]\$\d\d\$/, "no bcrypt hash in output");
  assert.doesNotMatch(all, /postgres(ql)?:\/\//, "no connection URL in output");
});

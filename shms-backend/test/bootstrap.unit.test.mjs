/**
 * Bootstrap tests that need no database.
 *
 *   node --test test/bootstrap.unit.test.mjs
 *
 * CLI runs point DATABASE_URL at 127.0.0.1:1 (nothing listens there): every
 * refusal below must happen before a connection is attempted, otherwise the
 * run would end with a connection error (exit 1) instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "src", "cli", "bootstrap.js");

// Placeholder only: the port is closed, so these values never reach a server.
const FAKE_DB_PASSWORD = "NotARealDbPassw0rd";
const fakeUrl = (db) => `postgresql://shms_app:${FAKE_DB_PASSWORD}@127.0.0.1:1/${db}`;

// The service module loads the Prisma client; give it a harmless URL.
process.env.DATABASE_URL = fakeUrl("shms_bootstrap_unit");
const service = await import("../src/services/bootstrap.service.js");
const cli = await import("../src/cli/bootstrap.js");

const ORG_ARGS = ["--org-name", "Unit Test Clinic", "--org-slug", "unit-test-clinic", "--admin-email", "Admin@Unit.Test"];

function runCli(args, { env = {}, input } = {}) {
  // An empty working directory: no .env file is picked up.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "shms-boot-unit-"));
  const started = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  return { code: r.status, out: r.stdout, err: r.stderr, ms: Date.now() - started };
}

function assertNoSecret(res, ...secrets) {
  for (const s of secrets) {
    assert.ok(!res.out.includes(s), "secret found in stdout");
    assert.ok(!res.err.includes(s), "secret found in stderr");
  }
}

/* ---------------- pre-connection target checks ---------------- */

test("SHMS_BOOTSTRAP missing or not exactly 1 is refused (exit 3)", () => {
  for (const flag of [undefined, "", "0", "true", "yes", " 1"]) {
    const env = { DATABASE_URL: fakeUrl("shms_bootstrap_x") };
    if (flag !== undefined) env.SHMS_BOOTSTRAP = flag;
    const r = runCli(["--confirm-database", "shms_bootstrap_x", ...ORG_ARGS], { env });
    assert.equal(r.code, 3, `flag ${JSON.stringify(flag)}: ${r.err}`);
    assert.match(r.err, /SHMS_BOOTSTRAP=1 is required/);
    assertNoSecret(r, FAKE_DB_PASSWORD, fakeUrl("shms_bootstrap_x"));
  }
});

test("protected databases are refused before any connection, whatever --confirm-database says", () => {
  const cases = [
    ["shms_db", "shms_db"],
    ["shms_db", "anything_else"],
    ["shms_scale_db", "shms_scale_db"],
    ["SHMS_DB", "SHMS_DB"],
    ["shms%5Fdb", "shms_db"],
    ["Shms_Scale_Db", "Shms_Scale_Db"],
  ];
  for (const [urlDb, confirm] of cases) {
    const r = runCli(["--confirm-database", confirm, ...ORG_ARGS], {
      env: { SHMS_BOOTSTRAP: "1", DATABASE_URL: fakeUrl(urlDb) },
    });
    assert.equal(r.code, 3, `${urlDb}: ${r.err}`);
    assert.match(r.err, /is protected/);
    assert.doesNotMatch(r.err, /cannot be reached|P1001/);
    assertNoSecret(r, FAKE_DB_PASSWORD, fakeUrl(urlDb));
  }
  // Confirming a protected name while the URL names another database.
  const r = runCli(["--confirm-database", "shms_scale_db", ...ORG_ARGS], {
    env: { SHMS_BOOTSTRAP: "1", DATABASE_URL: fakeUrl("shms_bootstrap_x") },
  });
  assert.equal(r.code, 3);
  assert.match(r.err, /is protected/);
});

test("--confirm-database missing (exit 2) or not matching DATABASE_URL (exit 3)", () => {
  const env = { SHMS_BOOTSTRAP: "1", DATABASE_URL: fakeUrl("shms_bootstrap_x") };
  const missing = runCli(ORG_ARGS, { env });
  assert.equal(missing.code, 2, missing.err);
  assert.match(missing.err, /--confirm-database <name> is required/);

  for (const confirm of ["shms_bootstrap_y", "SHMS_BOOTSTRAP_X", "shms_bootstrap_x "]) {
    const r = runCli(["--confirm-database", confirm, ...ORG_ARGS], { env });
    assert.equal(r.code, 3, `${confirm}: ${r.err}`);
    assert.match(r.err, /does not match the database in DATABASE_URL/);
    assertNoSecret(r, FAKE_DB_PASSWORD);
  }
});

test("missing or malformed DATABASE_URL is refused (exit 3)", () => {
  for (const url of [undefined, "", "not a url", "mysql://u:p@h/shms_bootstrap_x", "postgresql://u@127.0.0.1:1/"]) {
    const env = { SHMS_BOOTSTRAP: "1" };
    if (url !== undefined) env.DATABASE_URL = url;
    const r = runCli(["--confirm-database", "shms_bootstrap_x", ...ORG_ARGS], { env });
    assert.equal(r.code, 3, `${url}: ${r.err}`);
  }
});

/* ---------------- input validation (still no connection) ---------------- */

const okEnv = { SHMS_BOOTSTRAP: "1", DATABASE_URL: fakeUrl("shms_bootstrap_x") };
const base = ["--confirm-database", "shms_bootstrap_x"];

test("invalid organization data is refused (exit 2)", () => {
  const cases = [
    [["--org-slug", "ok-slug", "--admin-email", "a@b.co"], /--org-name is required/],
    [["--org-name", "Okay Clinic", "--admin-email", "a@b.co"], /--org-slug is required/],
    [["--org-name", "AB", "--org-slug", "ok-slug", "--admin-email", "a@b.co"], /--org-name: Organization name must be at least 3/],
    [["--org-name", "x".repeat(101), "--org-slug", "ok-slug", "--admin-email", "a@b.co"], /--org-name: Organization name is too long/],
    [["--org-name", "Okay Clinic", "--org-slug", "Bad Slug", "--admin-email", "a@b.co"], /--org-slug: Slug can only contain/],
    [["--org-name", "Okay Clinic", "--org-slug", "ok", "--admin-email", "a@b.co"], /--org-slug: Slug must be at least 3/],
    [["--org-name", "Okay Clinic", "--org-slug", "ok-slug", "--org-email", "nope", "--admin-email", "a@b.co"], /--org-email: Invalid email/],
    [["--org-name", "Okay Clinic", "--org-slug", "ok-slug", "--org-phone", "1".repeat(21), "--admin-email", "a@b.co"], /--org-phone: Phone number is too long/],
    [["--org-name", "Okay Clinic", "--org-slug", "ok-slug", "--org-address", "a".repeat(256), "--admin-email", "a@b.co"], /--org-address: Address is too long/],
  ];
  for (const [args, pattern] of cases) {
    const r = runCli([...base, ...args], { env: okEnv });
    assert.equal(r.code, 2, `${pattern}: ${r.err}`);
    assert.match(r.err, pattern);
  }
});

test("invalid administrator email is refused (exit 2)", () => {
  for (const email of ["", "not-an-email", "a@", "@b.co", "a b@c.co", `${"a".repeat(250)}@b.co`]) {
    const r = runCli([...base, "--org-name", "Okay Clinic", "--org-slug", "ok-slug", "--admin-email", email], { env: okEnv });
    assert.equal(r.code, 2, `${email}: ${r.err}`);
    assert.match(r.err, /--admin-email/);
  }
  const missing = runCli([...base, "--org-name", "Okay Clinic", "--org-slug", "ok-slug"], { env: okEnv });
  assert.equal(missing.code, 2);
  assert.match(missing.err, /--admin-email is required/);
});

test("a password on the command line is refused and never echoed (exit 2)", () => {
  const secret = "Cmdline-Secret-Value-123";
  for (const args of [
    [`--password=${secret}`],
    ["--password", secret],
    [`--pass=${secret}`],
    [secret],
    ["--admin-password", secret],
  ]) {
    const r = runCli([...base, ...ORG_ARGS, ...args], { env: okEnv });
    assert.equal(r.code, 2, r.err);
    assertNoSecret(r, secret);
  }
});

test("unknown options are refused without echoing values (exit 2)", () => {
  const r = runCli([...base, ...ORG_ARGS, "--org-logo=https://secret.example/x"], { env: okEnv });
  assert.equal(r.code, 2);
  assert.match(r.err, /Unknown option --org-logo\./);
  assert.ok(!r.err.includes("secret.example"));
});

test("--help prints usage and exits 0 without needing the environment", () => {
  const r = runCli(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /SHMS_BOOTSTRAP=1 npm run bootstrap/);
});

/* ---------------- service-level validation ---------------- */

test("organization input is normalized with the API schema", () => {
  const v = service.validateBootstrapInput({
    organization: { name: "  Clinic Name  ", slug: " clinic-name ", email: " info@clinic.test " },
    adminEmail: "  Admin.User@Clinic.TEST ",
  });
  assert.deepEqual(v.organization, { name: "Clinic Name", slug: "clinic-name", email: "info@clinic.test" });
  assert.equal(v.adminEmail, "admin.user@clinic.test");
});

test("password rules: 12 characters minimum, 72 bytes maximum, not the email", () => {
  const email = "admin@clinic.test";
  const bad = (pw, pattern) => {
    assert.throws(() => service.validatePassword(pw, email), (e) => {
      assert.equal(e.exitCode, 2);
      assert.match(e.message, pattern);
      assert.ok(!pw || !e.message.includes(pw), "message contains the password");
      return true;
    });
  };
  bad(undefined, /required/);
  bad("", /required/);
  bad("short-pw-11", /at least 12/);
  bad("a".repeat(73), /at most 72 bytes/);
  bad("é".repeat(37), /at most 72 bytes/); // 37 characters, 74 bytes
  bad("Admin@Clinic.test", /must not be the administrator email/);
  bad(" admin@clinic.test ", /must not be the administrator email/);
  bad("twelve-chars\nok", /line breaks/);
  bad("twelve-chars\0ok", /NUL/);

  service.validatePassword("a".repeat(12), email);
  service.validatePassword("a".repeat(72), email);
  service.validatePassword("é".repeat(36), email); // 72 bytes
  service.validatePassword("пароль-надёжный", email); // non-ASCII, 15 characters
});

test("password file: trailing newline and BOM stripped, size limited", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shms-boot-pwfile-"));
  try {
    const f = path.join(dir, "pw");
    fs.writeFileSync(f, "﻿file-password-123\r\n", { mode: 0o600 });
    assert.equal(service.readPasswordFile(f).password, "file-password-123");
    fs.writeFileSync(f, "file-password-123\n\n", { mode: 0o600 });
    assert.equal(service.readPasswordFile(f).password, "file-password-123\n"); // then rejected by validatePassword
    fs.writeFileSync(f, "x".repeat(2000), { mode: 0o600 });
    assert.throws(() => service.readPasswordFile(f), /too large/);
    assert.throws(() => service.readPasswordFile(path.join(dir, "missing")), /does not exist/);
    assert.throws(() => service.readPasswordFile(dir), /not a regular file/);

    if (process.platform === "win32") {
      fs.writeFileSync(f, "file-password-123", { mode: 0o600 });
      assert.match(service.readPasswordFile(f).warnings[0], /cannot be checked on Windows/);
    } else {
      fs.writeFileSync(f, "file-password-123");
      fs.chmodSync(f, 0o644);
      assert.throws(() => service.readPasswordFile(f), (e) => e.exitCode === 3);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------------- hidden prompt ---------------- */

function fakeTty() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (on) => {
    input.isRaw = on;
    return input;
  };
  return input;
}

// Answers each prompt with the next line once the prompt has been written.
function scriptedOutput(input, answers) {
  let written = "";
  const out = {
    write(text) {
      written += text;
      if (/: $/.test(text) && answers.length > 0) {
        const next = answers.shift();
        setImmediate(() => input.write(next));
      }
      return true;
    },
  };
  return { out, text: () => written };
}

test("hidden prompt: matching entries return the password and nothing is echoed", async () => {
  const input = fakeTty();
  const pw = "Prompted-Password-42";
  const { out, text } = scriptedOutput(input, [`${pw}\r`, `${pw}\r`]);
  const got = await cli.promptNewPassword({ input, output: out });
  assert.equal(got, pw);
  assert.ok(!text().includes(pw));
  assert.equal(input.isRaw, false, "raw mode restored");
});

test("hidden prompt: backspace edits, escape sequences are ignored", async () => {
  const input = fakeTty();
  const { out } = scriptedOutput(input, ["abcX\u007f-defghijkl\r", "\u001b[Aabc-defghijkl\r"]);
  assert.equal(await cli.promptNewPassword({ input, output: out }), "abc-defghijkl");
});

test("hidden prompt: mismatched entries are refused (exit 2)", async () => {
  const input = fakeTty();
  const { out, text } = scriptedOutput(input, ["First-Password-1\r", "Other-Password-2\r"]);
  await assert.rejects(cli.promptNewPassword({ input, output: out }), (e) => {
    assert.equal(e.exitCode, 2);
    assert.match(e.message, /do not match/);
    return true;
  });
  assert.ok(!text().includes("First-Password-1") && !text().includes("Other-Password-2"));
});

test("hidden prompt: Ctrl+C cancels (exit 2); no TTY is refused (exit 2)", async () => {
  const input = fakeTty();
  const { out } = scriptedOutput(input, ["abc\u0003"]);
  await assert.rejects(cli.promptNewPassword({ input, output: out }), (e) => e.exitCode === 2);

  const notTty = new PassThrough();
  await assert.rejects(cli.promptNewPassword({ input: notTty, output: out }), /No terminal/);
});

/* ---------------- error reporting ---------------- */

test("database errors are reported by code only", () => {
  const leaky = Object.assign(new Error(`connect failed for ${fakeUrl("x")} value='hunter2'`), {
    code: "P2010",
    meta: { code: "42501", message: "permission denied value='hunter2'" },
  });
  const d = cli.describeError(leaky);
  assert.equal(d.exitCode, 1);
  assert.match(d.message, /P2010, SQLSTATE 42501/);
  assert.ok(!d.message.includes("hunter2") && !d.message.includes(FAKE_DB_PASSWORD));

  const init = Object.assign(new Error(`Can't reach ${fakeUrl("x")}`), { errorCode: "P1001", name: "PrismaClientInitializationError" });
  assert.match(cli.describeError(init).message, /cannot be reached \(P1001\)/);
  assert.ok(!cli.describeError(init).message.includes(FAKE_DB_PASSWORD));

  const plain = cli.describeError(new TypeError("boom with secret-ish text"));
  assert.match(plain.message, /Unexpected error \(TypeError\)\. Any open transaction was rolled back\./);
  assert.ok(!plain.message.includes("secret-ish"));
});

/* ---------------- connected-database checks (fake client) ---------------- */

const MIGRATIONS = fs
  .readdirSync(path.join(ROOT, "prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Answers verifyTarget's catalog queries; `patch` breaks one aspect.
function fakeDb(patch = {}) {
  const state = {
    role: { database: "shms_bootstrap_x", role: "shms_app", superuser: false, bypass_rls: false },
    present: { organization: true, migrations: true },
    migrations: MIGRATIONS.map((m) => ({ migration_name: m, applied: true, unfinished: false })),
    tables: service.TENANT_TABLES.map((name) => ({ name, enabled: true, forced: true, policies: 1 })),
    functions: [
      { name: "shms_row_visible", security_definer: false },
      { name: "shms_auth_user", security_definer: true },
    ],
    privileges: { organization: true, user: true, audit: true },
  };
  patch.apply?.(state);
  return {
    async $queryRawUnsafe(sql) {
      if (sql.includes("current_database")) return state.role ? [state.role] : [];
      if (sql.includes("to_regclass")) return [state.present];
      if (sql.includes("_prisma_migrations")) return state.migrations;
      if (sql.includes("pg_class")) return state.tables;
      if (sql.includes("pg_proc")) return state.functions;
      if (sql.includes("has_table_privilege")) return [state.privileges];
      throw new Error("unexpected query");
    },
  };
}

test("verifyTarget accepts a migrated database with full RLS", async () => {
  assert.deepEqual(await service.verifyTarget(fakeDb(), "shms_bootstrap_x"), {
    database: "shms_bootstrap_x",
    role: "shms_app",
  });
});

test("verifyTarget refuses every unsafe target (exit 3)", async () => {
  const cases = [
    ["connected database differs", (s) => { s.role.database = "shms_other"; }, /Connected to database "shms_other"/],
    ["connected to a protected database", (s) => { s.role.database = "shms_db"; }, /is protected/],
    ["superuser role", (s) => { s.role.superuser = true; }, /superuser or bypasses row-level security/],
    ["BYPASSRLS role", (s) => { s.role.bypass_rls = true; }, /superuser or bypasses row-level security/],
    ["role not found", (s) => { s.role = null; }, /could not be identified/],
    ["no SHMS schema", (s) => { s.present = { organization: false, migrations: false }; }, /no SHMS schema.*not a migration tool/],
    ["no migrations table", (s) => { s.present.migrations = false; }, /no SHMS schema/],
    ["missing migration", (s) => { s.migrations.pop(); }, /missing migrations/],
    ["failed migration", (s) => { s.migrations.push({ migration_name: "x_failed", applied: false, unfinished: true }); }, /failed or is still running/],
    ["unknown migration", (s) => { s.migrations.push({ migration_name: "29990101000000_future", applied: true, unfinished: false }); }, /does not know/],
    ["RLS disabled", (s) => { s.tables[0].enabled = false; }, /RLS disabled/],
    ["RLS not forced", (s) => { s.tables.find((t) => t.name === "User").forced = false; }, /User \(RLS not forced\)/],
    ["no policy", (s) => { s.tables[1].policies = 0; }, /no policy/],
    ["tenant table missing", (s) => { s.tables = s.tables.filter((t) => t.name !== "AuditLog"); }, /AuditLog \(missing\)/],
    ["visibility function missing", (s) => { s.functions = s.functions.slice(1); }, /helper functions/],
    ["login lookup not SECURITY DEFINER", (s) => { s.functions[1].security_definer = false; }, /helper functions/],
    ["no INSERT privilege", (s) => { s.privileges.audit = false; }, /cannot insert/],
  ];
  for (const [label, apply, pattern] of cases) {
    await assert.rejects(service.verifyTarget(fakeDb({ apply }), "shms_bootstrap_x"), (e) => {
      assert.equal(e.exitCode, 3, label);
      assert.match(e.message, pattern, label);
      return true;
    });
  }
});

test("a rolled-back (resolved) migration attempt does not block a re-applied one", async () => {
  const apply = (s) => s.migrations.push({ migration_name: MIGRATIONS[0], applied: false, unfinished: false });
  await service.verifyTarget(fakeDb({ apply }), "shms_bootstrap_x");
});

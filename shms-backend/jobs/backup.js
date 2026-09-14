#!/usr/bin/env node
/**
 * Backup job: dump the database with pg_dump (custom format) and prune
 * old backups. Uses the BACKUP_DATABASE_URL from .env when set, otherwise
 * DATABASE_URL. NEVER prints connection strings.
 *
 * IMPORTANT: the role in the URL must be able to dump the whole database.
 * The application role (shms_app) is RLS-restricted and pg_dump fails with
 * "query would be affected by row-level security policy" — use an
 * owner/bostgres connection, e.g. BACKUP_DATABASE_URL=postgresql://postgres:...@localhost:5432/shms_db
 *
 * Requirements:
 *   - pg_dump on PATH (PostgreSQL client tools), or set PGDUMP_BIN.
 *
 * Usage:
 *   node jobs/backup.js --dir ./backups --keep 7
 *   node jobs/backup.js --dir ./backups --keep 7 --dry-run
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import env from "../src/config/env.js";

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const dir = dirIdx !== -1 ? args[dirIdx + 1] : "./backups";
const keepIdx = args.indexOf("--keep");
const keep = keepIdx !== -1 ? Number.parseInt(args[keepIdx + 1], 10) : 7;
const dryRun = args.includes("--dry-run");
const pgDumpBin = process.env.PGDUMP_BIN || "pg_dump";

const databaseUrl = env.BACKUP_DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const url = new URL(databaseUrl);
const cfg = {
  user: decodeURIComponent(url.username || "postgres"),
  password: decodeURIComponent(url.password || ""),
  host: url.hostname || "localhost",
  port: url.port || "5432",
  db: url.pathname.replace(/^\//, ""),
};

mkdirSync(dir, { recursive: true });
const fileName = `shms_${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const filePath = join(dir, fileName);

if (dryRun) {
  console.log(`[dry-run] would run: ${pgDumpBin} -Fc -> ${filePath}`);
} else {
  console.log(`backing up ${cfg.db}@${cfg.host}:${cfg.port} -> ${filePath}`);
  const child = spawn(
    pgDumpBin,
    ["--format=custom", "--file", filePath, cfg.db],
    {
      env: {
        ...process.env,
        PGHOST: cfg.host,
        PGPORT: cfg.port,
        PGUSER: cfg.user,
        PGPASSWORD: cfg.password,
      },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  await new Promise((resolve, reject) => {
    child.on("error", (err) => {
      console.error(
        `failed to start ${pgDumpBin} — ensure the PostgreSQL client tools are installed and on PATH (or set PGDUMP_BIN).`
      );
      reject(err);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
  });
}

const backups = readdirSync(dir)
  .filter((f) => f.endsWith(".dump"))
  .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

for (const old of backups.slice(keep)) {
  if (dryRun) {
    console.log(`[dry-run] would prune ${old.f}`);
    continue;
  }
  rmSync(join(dir, old.f), { force: true });
  console.log(`pruned ${old.f}`);
}
console.log(`backups kept: ${Math.min(backups.length, keep)} of ${backups.length}`);
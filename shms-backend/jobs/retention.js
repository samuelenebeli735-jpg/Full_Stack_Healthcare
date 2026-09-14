#!/usr/bin/env node
/**
 * Retention job: purge AuditLog and Notification rows older than the
 * retention window (default 365 days). Runs in the super-admin global
 * scope, which is the only context that may DELETE across tenants (and
 * only via bypass — the rows are genuinely removed, not soft-deleted).
 *
 * Usage:
 *   node jobs/retention.js --days 365 --dry-run
 *   node jobs/retention.js --days 90
 */
import prisma from "../src/config/db.js";
import { withTenant } from "../src/utils/tenantContext.js";

const args = process.argv.slice(2);
const daysIdx = args.indexOf("--days");
const days = daysIdx !== -1 ? Number.parseInt(args[daysIdx + 1], 10) : 365;
const dryRun = args.includes("--dry-run");
const batchSize = 500;

if (!Number.isFinite(days) || days < 1) {
  console.error("usage: node jobs/retention.js [--days N] [--dry-run]");
  process.exit(1);
}

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const tables = [
  { label: "AuditLog", model: "auditLog", where: { createdAt: { lt: cutoff } } },
  { label: "Notification", model: "notification", where: { createdAt: { lt: cutoff } } },
];

await withTenant(null, { isSuperAdmin: true }, async (tx) => {
  for (const { label, model, where } of tables) {
    const deleted = {
      before: 0,
      after: 0,
    };
    deleted.before = await tx[model].count({ where });
    if (!dryRun) {
      let total = 0;
      for (;;) {
        const ids = await tx[model].findMany({
          where,
          select: { id: true },
          take: batchSize,
          orderBy: { createdAt: "asc" },
        });
        if (ids.length === 0) break;
        await tx[model].deleteMany({
          where: { id: { in: ids.map((r) => r.id) } },
        });
        total += ids.length;
        if (ids.length < batchSize) break;
      }
      deleted.after = await tx[model].count({ where });
      console.log(
        `${label}: cutoff=${cutoff.toISOString()} deleted=${total} remaining=${deleted.after}`
      );
    } else {
      console.log(
        `${label}: cutoff=${cutoff.toISOString()} wouldDelete=${deleted.before} (dry-run)`
      );
    }
  }
});

await prisma.$disconnect();
#!/usr/bin/env node
/**
 * SHMS first-run bootstrap: create the first organization and its
 * administrator in a freshly migrated, empty database.
 *
 *   SHMS_BOOTSTRAP=1 npm run bootstrap -- --confirm-database <name> \
 *     --org-name "<name>" --org-slug <slug> --admin-email <email> \
 *     [--org-email ..] [--org-phone ..] [--org-address ..] \
 *     [--password-file <path>] [--dry-run]
 *
 * The password is typed twice at a hidden prompt, or read from
 * --password-file. It is never accepted as an argument or an environment
 * variable, and nothing printed here contains it, its hash, DATABASE_URL or
 * any other secret.
 *
 * Exit codes: 0 success, 1 unexpected error, 2 invalid input,
 *             3 unsafe environment, 4 database already initialized.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const EXIT_OK = 0;
const EXIT_UNEXPECTED = 1;
const EXIT_INVALID_INPUT = 2;

const OPTIONS = {
  "confirm-database": { type: "string" },
  "org-name": { type: "string" },
  "org-slug": { type: "string" },
  "org-email": { type: "string" },
  "org-phone": { type: "string" },
  "org-address": { type: "string" },
  "admin-email": { type: "string" },
  "password-file": { type: "string" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean" },
};

const USAGE = `Usage:
  SHMS_BOOTSTRAP=1 npm run bootstrap -- --confirm-database <name> \\
    --org-name "<organization name>" --org-slug <slug> \\
    --admin-email <email> [--org-email <email>] [--org-phone <phone>] \\
    [--org-address <address>] [--password-file <path>] [--dry-run]

Creates the first organization and its administrator in an empty, migrated
SHMS database. The database is taken from DATABASE_URL (application role).
Without --password-file the password is asked twice at a hidden prompt.

Exit codes: 0 success, 1 unexpected error, 2 invalid input,
            3 unsafe environment, 4 database already initialized.`;

class CliError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

/**
 * Parse arguments without ever echoing a value: a password typed by mistake
 * as an argument (positional or --password=...) must not reach the output.
 */
export function parseCliArgs(argv) {
  for (const token of argv) {
    if (/^--?pass(word)?(=|$)/i.test(token)) {
      throw new CliError(
        EXIT_INVALID_INPUT,
        "Passwords are never accepted on the command line. Use the prompt or --password-file."
      );
    }
  }
  try {
    const { values } = parseArgs({
      args: argv,
      options: OPTIONS,
      strict: true,
      allowPositionals: false,
    });
    return values;
  } catch (error) {
    let detail = "Invalid arguments.";
    if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const option = argv.find((t) => t.startsWith("-") && !(t.replace(/^-+/, "").split("=")[0] in OPTIONS));
      detail = `Unknown option ${option ? option.split("=")[0] : ""}.`.replace(" .", ".");
    } else if (error.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
      detail = "Unexpected argument (values are not echoed). Every value needs its --option.";
    } else if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
      detail = "An option is missing its value.";
    }
    throw new CliError(EXIT_INVALID_INPUT, `${detail} Run with --help for usage.`);
  }
}

/**
 * Read one line from a TTY without echoing it.
 */
export function readHidden(prompt, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    output.write(prompt);
    let value = "";
    const wasRaw = Boolean(input.isRaw);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();

    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    function onData(chunk) {
      // Drop arrow keys and other terminal escape sequences.
      // eslint-disable-next-line no-control-regex
      const text = chunk.replace(/\u001b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])?/g, "");
      for (const ch of text) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003" || (ch === "\u0004" && value === "")) {
          return finish(new CliError(EXIT_INVALID_INPUT, "Password entry cancelled."));
        }
        if (ch === "\u007f" || ch === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (ch < " ") continue;
        value += ch;
      }
    }

    input.on("data", onData);
  });
}

/**
 * Ask for the new administrator password twice at a hidden prompt.
 */
export async function promptNewPassword({ input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new CliError(
      EXIT_INVALID_INPUT,
      "No terminal for the hidden password prompt. Run interactively (e.g. docker compose run -it) or use --password-file."
    );
  }
  const first = await readHidden("Administrator password: ", { input, output });
  const second = await readHidden("Repeat the password: ", { input, output });
  if (first !== second) {
    throw new CliError(EXIT_INVALID_INPUT, "The passwords do not match.");
  }
  return first;
}

/**
 * A safe, one-line description of a failure: Prisma and driver messages can
 * carry query values, so only error codes are reported for them.
 */
export function describeError(error) {
  if (error && Number.isInteger(error.exitCode)) {
    return { exitCode: error.exitCode, message: error.message };
  }
  const code = error?.code || error?.errorCode;
  const sqlState = error?.meta?.code;
  const known = {
    P1000: "The database rejected the credentials in DATABASE_URL",
    P1001: "The database server cannot be reached",
    P1003: "The database in DATABASE_URL does not exist",
    P2002: "A unique value already exists in the database",
    P2028: "The database transaction timed out (another bootstrap may hold the lock)",
  };
  const what = known[code] || "Unexpected error";
  const tag = [code, sqlState && `SQLSTATE ${sqlState}`, !code && error?.name].filter(Boolean).join(", ");
  return {
    exitCode: EXIT_UNEXPECTED,
    message: `${what}${tag ? ` (${tag})` : ""}. Any open transaction was rolled back.`,
  };
}

function printResult(result, { out = process.stdout } = {}) {
  const lines = result.dryRun
    ? [
        "SHMS bootstrap DRY RUN: every check passed and the inserts succeeded,",
        "then the transaction was rolled back. Nothing was written.",
        `  Database:       ${result.database} (role ${result.role})`,
        `  Organization:   "${result.organization.name}" (slug: ${result.organization.slug})`,
        `  Administrator:  ${result.admin.email} (role: ${result.admin.role})`,
      ]
    : [
        "SHMS bootstrap complete.",
        `  Database:       ${result.database} (role ${result.role})`,
        `  Organization:   ${result.organization.id} "${result.organization.name}" (slug: ${result.organization.slug})`,
        `  Administrator:  ${result.admin.id} ${result.admin.email} (role: ${result.admin.role})`,
        `  Audit record:   ${result.auditLogId}`,
        "Next: sign in as the administrator. If a password file was used, delete it now.",
      ];
  out.write(lines.join("\n") + "\n");
}

export async function main(argv = process.argv.slice(2)) {
  let prisma = null;
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      process.stdout.write(USAGE + "\n");
      return EXIT_OK;
    }

    // Same environment loading as the API (an existing variable wins over .env).
    dotenv.config({ quiet: true });

    // Loaded only now, so the database client sees the final environment.
    const service = await import("../services/bootstrap.service.js");

    // 1. Refusals that need no connection (flag, protected names, confirmation).
    const databaseName = service.checkTarget({
      bootstrapFlag: process.env.SHMS_BOOTSTRAP,
      databaseUrl: process.env.DATABASE_URL,
      confirmDatabase: args["confirm-database"],
    });

    // 2. Input validation, still without a connection.
    const input = service.validateBootstrapInput({
      organization: {
        name: args["org-name"],
        slug: args["org-slug"],
        email: args["org-email"],
        phone: args["org-phone"],
        address: args["org-address"],
      },
      adminEmail: args["admin-email"],
    });

    // 3. Read-only checks on the connected database, before asking for a password.
    ({ default: prisma } = await import("../config/db.js"));
    await service.verifyTarget(prisma, databaseName);
    await service.assertNoOrganizations(prisma);

    // 4. The password: a file or the hidden prompt, never argv or env.
    let password;
    if (args["password-file"] !== undefined) {
      const read = service.readPasswordFile(args["password-file"]);
      for (const warning of read.warnings) process.stderr.write(`Warning: ${warning}\n`);
      password = read.password;
    } else {
      password = await promptNewPassword();
    }
    service.validatePassword(password, input.adminEmail);

    // 5. One transaction; the service re-checks everything under the lock.
    const result = await service.bootstrapOrganization(
      { organization: input.organization, adminEmail: input.adminEmail, password },
      { db: prisma, expectedDatabase: databaseName, dryRun: Boolean(args["dry-run"]) }
    );
    password = null;

    printResult(result);
    return EXIT_OK;
  } catch (error) {
    const { exitCode, message } = describeError(error);
    const verb = exitCode === EXIT_UNEXPECTED ? "failed" : "refused";
    process.stderr.write(`Bootstrap ${verb}: ${message}\n`);
    return exitCode;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = await main();
}

import { spawn } from "node:child_process";

const DEFAULT_DATABASE_URL =
  "postgresql://app:app@localhost:55432/suchewohnung_smoke?schema=public";
const DEFAULT_REDIS_URL = "redis://localhost:56379";
const EXPECTED_DB_NAME = "suchewohnung_smoke";

const withCompose = process.argv.includes("--compose");
const resetConfirmation = process.argv
  .find((arg) => arg.startsWith("--confirm-smoke-db-reset="))
  ?.slice("--confirm-smoke-db-reset=".length);
const smokeDatabaseUrl = withCompose
  ? DEFAULT_DATABASE_URL
  : (process.env.SMOKE_DATABASE_URL ?? DEFAULT_DATABASE_URL);
const smokeRedisUrl = withCompose
  ? DEFAULT_REDIS_URL
  : (process.env.SMOKE_REDIS_URL ?? DEFAULT_REDIS_URL);

const env = {
  ...process.env,
  DATABASE_URL: smokeDatabaseUrl,
  REDIS_URL: smokeRedisUrl,
  SMOKE_DATABASE_URL: smokeDatabaseUrl,
  SMOKE_REDIS_URL: smokeRedisUrl,
  RUN_DB_REDIS_SMOKE: "1",
};

if (process.env.CONFIRM_SMOKE_DB_RESET || resetConfirmation) {
  env.CONFIRM_SMOKE_DB_RESET =
    resetConfirmation ?? process.env.CONFIRM_SMOKE_DB_RESET;
}

function sanitizedTarget(urlValue) {
  const url = new URL(urlValue);
  return `${url.protocol}//${url.hostname}:${url.port || (url.protocol.startsWith("redis") ? "6379" : "5432")}${url.pathname}`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "null"}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function main() {
  if (withCompose && resetConfirmation !== EXPECTED_DB_NAME) {
    throw new Error(
      `--confirm-smoke-db-reset=${EXPECTED_DB_NAME} is required with --compose.`,
    );
  }

  console.log(`Smoke DB target: ${sanitizedTarget(smokeDatabaseUrl)}`);
  console.log(`Smoke Redis target: ${sanitizedTarget(smokeRedisUrl)}`);

  if (withCompose) {
    await run("docker", [
      "compose",
      "--profile",
      "smoke",
      "up",
      "--wait",
      "-d",
      "postgres-smoke",
      "redis-smoke",
    ]);
  }

  await run("npm", ["run", "db:generate"]);
  await run("npm", ["run", "build", "-w", "@suchewohnung/shared"]);
  await run("node", ["scripts/reset-smoke-db.mjs"]);
  await run("npm", ["run", "db:migrate"]);
  await run("npm", ["run", "db:seed"]);
  await run("npm", ["run", "db:seed"]);
  await run("npm", ["run", "test:integration"]);
}

function redact(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+(@)/giu, "$1<redacted>$2")
    .replace(/(redis:\/\/(?:[^:\s/@]+:)?)[^@\s]+(@)/giu, "$1<redacted>$2")
    .replace(/([?&](?:password|token|secret)=)[^&\s]+/giu, "$1<redacted>");
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

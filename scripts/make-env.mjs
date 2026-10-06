// Creates .env from .env.example with freshly generated secrets. Never overwrites an existing .env.
// Usage: node scripts/make-env.mjs
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists; leaving it untouched.");
  process.exit(0);
}

const example = readFileSync(".env.example", "utf8");
const result = example
  .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${randomBytes(48).toString("base64url")}`)
  .replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${randomBytes(24).toString("base64url")}`);

writeFileSync(".env", result, { mode: 0o600 });
console.log("Created .env with generated AUTH_SECRET and CRON_SECRET.");

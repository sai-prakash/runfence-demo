/**
 * One-shot local approval: writes .approvals/token so NEEDS_APPROVAL passes once.
 * Usage: npm run approve
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokenPath = join(root, ".approvals", "token");

mkdirSync(dirname(tokenPath), { recursive: true });
writeFileSync(
  tokenPath,
  JSON.stringify({ approved_at: new Date().toISOString(), once: true }, null, 2),
  "utf8"
);
console.log(`APPROVED once → ${tokenPath}`);

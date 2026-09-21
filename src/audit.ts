import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AuditRecord } from "./types.js";

export function appendAudit(auditDir: string, record: AuditRecord): string {
  mkdirSync(auditDir, { recursive: true });
  const path = join(auditDir, `${record.run_id}.jsonl`);
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
  return path;
}

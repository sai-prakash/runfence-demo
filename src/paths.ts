import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const AUDIT_DIR = join(ROOT, "audit");
export const APPROVAL_FILE = join(ROOT, ".approvals", "token");
export const ARTIFACTS_DIR = join(ROOT, "artifacts");

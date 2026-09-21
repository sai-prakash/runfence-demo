/**
 * demo:approval — refund without token → NEEDS_APPROVAL; after approve → PASS
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { fixtures } from "../fixtures.js";
import { wrapWithRunFence, defaultConfig } from "../middleware.js";
import { executeTool } from "../tools.js";
import { AUDIT_DIR, APPROVAL_FILE, ARTIFACTS_DIR, ROOT } from "../paths.js";
import type { ToolName } from "../types.js";

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  fixtures.seed();
  // Ensure no leftover approval
  if (existsSync(APPROVAL_FILE)) unlinkSync(APPROVAL_FILE);

  const runId = "demo-approval";
  const auditPath = join(AUDIT_DIR, `${runId}.jsonl`);
  if (existsSync(auditPath)) unlinkSync(auditPath);

  const cfg = defaultConfig({
    runId,
    auditDir: AUDIT_DIR,
    approvalFile: APPROVAL_FILE,
    freshnessTtlMs: 60_000,
    requireApproval: new Set<ToolName>(["refund_customer", "book_slot"]),
    budget: { maxSteps: 10, maxTokens: 10_000, stepsUsed: 0, tokensUsed: 0 },
  });

  const guarded = wrapWithRunFence(cfg, executeTool);
  const orderId = "ORD-1001";
  const snap = new Date(fixtures.getBalance(orderId)!.lastMutatedAt).toISOString();

  log("=== RunFence demo:approval ===");
  log("1. Attempt refund_customer WITHOUT approval token …");

  let blockedOk = false;
  try {
    await guarded({
      name: "refund_customer",
      arguments: { amount: 10, order_id: orderId, balance_snapshot_at: snap },
    });
    log("UNEXPECTED: allowed without approval");
  } catch (e) {
    const err = e as Error & { reason?: string; detail?: string };
    log(`BLOCKED reason=${err.reason ?? "?"} detail=${err.detail ?? err.message}`);
    if (err.reason === "NEEDS_APPROVAL") {
      log("PASS phase1: NEEDS_APPROVAL");
      blockedOk = true;
    }
  }

  if (!blockedOk) {
    writeTranscript(lines, auditPath);
    process.exit(1);
  }

  // Human approves once
  mkdirSync(join(ROOT, ".approvals"), { recursive: true });
  writeFileSync(
    APPROVAL_FILE,
    JSON.stringify({ approved_at: new Date().toISOString(), once: true }, null, 2)
  );
  log(`2. Human ran approve → wrote ${APPROVAL_FILE}`);

  // Re-snapshot after any time drift (balance unchanged)
  const snap2 = new Date(fixtures.getBalance(orderId)!.lastMutatedAt).toISOString();
  log("3. Retry refund_customer WITH approval …");

  let exitCode = 1;
  try {
    const result = await guarded({
      name: "refund_customer",
      arguments: { amount: 10, order_id: orderId, balance_snapshot_at: snap2 },
    });
    log(`ALLOWED reason=PASS result=${JSON.stringify(result)}`);
    if (!existsSync(APPROVAL_FILE)) {
      log("PASS phase2: approval token consumed (one-shot)");
    } else {
      log("WARN: approval token still present");
    }
    log("PASS: NEEDS_APPROVAL then PASS after approve");
    exitCode = 0;
  } catch (e) {
    const err = e as Error & { reason?: string; detail?: string };
    log(`FAIL: expected PASS, got ${err.reason} ${err.detail ?? err.message}`);
    exitCode = 1;
  }

  writeTranscript(lines, auditPath);
  process.exit(exitCode);
}

function writeTranscript(lines: string[], auditPath: string) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(join(ARTIFACTS_DIR, "demo-approval.txt"), lines.join("\n") + "\n");
  if (existsSync(auditPath)) {
    writeFileSync(
      join(ARTIFACTS_DIR, "demo-approval.audit.jsonl"),
      readFileSync(auditPath, "utf8")
    );
    console.log(`audit → ${auditPath}`);
  }
}

main();

/**
 * demo:budget — Loop tool calls past maxSteps → BUDGET_EXCEEDED hard kill
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
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
  mkdirSync(join(ROOT, ".approvals"), { recursive: true });
  writeFileSync(APPROVAL_FILE, JSON.stringify({ approved_at: new Date().toISOString() }));

  const runId = "demo-budget";
  const auditPath = join(AUDIT_DIR, `${runId}.jsonl`);
  if (existsSync(auditPath)) unlinkSync(auditPath);

  const maxSteps = 3;
  const cfg = defaultConfig({
    runId,
    auditDir: AUDIT_DIR,
    approvalFile: APPROVAL_FILE,
    freshnessTtlMs: 60_000,
    // Disable approval gate for this demo by not requiring it — we re-write token each allow.
    // Actually refund consumes approval; re-approve each step OR disable requireApproval.
    requireApproval: new Set<ToolName>(), // isolate BUDGET
    budget: { maxSteps, maxTokens: 10_000, stepsUsed: 0, tokensUsed: 0 },
  });

  const guarded = wrapWithRunFence(cfg, executeTool);

  log("=== RunFence demo:budget ===");
  log(`Per-run maxSteps=${maxSteps}. Agent retry loop will exceed ceiling.`);

  const orderId = "ORD-1001";
  const snap = new Date(fixtures.getBalance(orderId)!.lastMutatedAt).toISOString();

  let exitCode = 1;
  let hitBudget = false;

  for (let i = 1; i <= maxSteps + 2; i++) {
    // Re-seed balance so execute can succeed if gate allows
    fixtures.seed();
    const freshSnap = new Date(fixtures.getBalance(orderId)!.lastMutatedAt).toISOString();
    log(`attempt ${i}: refund_customer …`);
    try {
      const result = await guarded({
        name: "refund_customer",
        arguments: {
          amount: 1,
          order_id: orderId,
          balance_snapshot_at: freshSnap,
        },
      });
      log(`  allow step=${cfg.budget.stepsUsed} result=${JSON.stringify(result)}`);
    } catch (e) {
      const err = e as Error & { reason?: string; detail?: string };
      log(`  BLOCKED reason=${err.reason ?? "?"} detail=${err.detail ?? err.message}`);
      if (err.reason === "BUDGET_EXCEEDED") {
        hitBudget = true;
        log("PASS: BUDGET_EXCEEDED hard kill");
        exitCode = 0;
        break;
      }
      log(`FAIL: unexpected reason ${err.reason}`);
      exitCode = 1;
      break;
    }
  }

  if (!hitBudget) {
    log("FAIL: never hit BUDGET_EXCEEDED");
    exitCode = 1;
  }

  // silence unused
  void snap;

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(join(ARTIFACTS_DIR, "demo-budget.txt"), lines.join("\n") + "\n");
  if (existsSync(auditPath)) {
    writeFileSync(
      join(ARTIFACTS_DIR, "demo-budget.audit.jsonl"),
      readFileSync(auditPath, "utf8")
    );
    log(`audit → ${auditPath}`);
  }

  process.exit(exitCode);
}

main();

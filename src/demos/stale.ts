/**
 * demo:stale — Agent snapshots balance, fixture mutates, refund blocked with STALE_EVIDENCE
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fixtures } from "../fixtures.js";
import { wrapWithRunFence, defaultConfig } from "../middleware.js";
import { executeTool } from "../tools.js";
import { AUDIT_DIR, APPROVAL_FILE, ARTIFACTS_DIR, ROOT } from "../paths.js";
import type { ToolName } from "../types.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  fixtures.seed();
  // Pre-approve so this demo isolates STALE (not approval)
  mkdirSync(join(ROOT, ".approvals"), { recursive: true });
  writeFileSync(APPROVAL_FILE, JSON.stringify({ approved_at: new Date().toISOString() }));

  const runId = "demo-stale";
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
  const row = fixtures.getBalance(orderId)!;
  const snapshotAt = new Date(row.lastMutatedAt).toISOString();

  log("=== RunFence demo:stale ===");
  log(`1. Agent reads balance for ${orderId}: $${row.balance} @ ${snapshotAt}`);
  log("2. Agent decides to refund $25 based on that snapshot.");

  await sleep(5); // ensure mutation timestamp is strictly after snapshot
  const mutated = fixtures.mutateBalance(orderId, 5);
  log(
    `3. World moves: balance mutated to $${mutated.balance} at ${new Date(mutated.lastMutatedAt).toISOString()}`
  );
  log("4. Agent calls refund_customer with stale balance_snapshot_at …");

  let exitCode = 1;
  try {
    await guarded({
      name: "refund_customer",
      arguments: {
        amount: 25,
        order_id: orderId,
        balance_snapshot_at: snapshotAt,
      },
    });
    log("UNEXPECTED: refund was allowed");
    exitCode = 2;
  } catch (e) {
    const err = e as Error & { reason?: string; detail?: string };
    log(`BLOCKED reason=${err.reason ?? "?"} detail=${err.detail ?? err.message}`);
    if (err.reason === "STALE_EVIDENCE") {
      log("PASS: STALE_EVIDENCE hard kill");
      exitCode = 0;
    } else {
      log(`FAIL: expected STALE_EVIDENCE, got ${err.reason}`);
      exitCode = 1;
    }
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(join(ARTIFACTS_DIR, "demo-stale.txt"), lines.join("\n") + "\n");
  if (existsSync(auditPath)) {
    writeFileSync(
      join(ARTIFACTS_DIR, "demo-stale.audit.jsonl"),
      readFileSync(auditPath, "utf8")
    );
    log(`audit → ${auditPath}`);
  }

  process.exit(exitCode);
}

main();

/**
 * RunFence middleware — wraps write tools BEFORE execute with hard kills:
 * BUDGET_EXCEEDED | STALE_EVIDENCE | NEEDS_APPROVAL
 */
import { existsSync, unlinkSync } from "node:fs";
import { argHash } from "./hash.js";
import { appendAudit } from "./audit.js";
import { fixtures } from "./fixtures.js";
import { AUDIT_DIR, APPROVAL_FILE } from "./paths.js";
import type {
  BookSlotArgs,
  GateResult,
  RefundArgs,
  RunFenceConfig,
  ToolCall,
  ToolName,
} from "./types.js";

function checkBudget(cfg: RunFenceConfig): GateResult | null {
  cfg.budget.stepsUsed += 1;
  cfg.budget.tokensUsed += 100;

  if (cfg.budget.stepsUsed > cfg.budget.maxSteps) {
    return {
      decision: "block",
      reason: "BUDGET_EXCEEDED",
      detail: `steps ${cfg.budget.stepsUsed} > max ${cfg.budget.maxSteps}`,
    };
  }
  if (
    cfg.budget.maxTokens !== undefined &&
    cfg.budget.tokensUsed > cfg.budget.maxTokens
  ) {
    return {
      decision: "block",
      reason: "BUDGET_EXCEEDED",
      detail: `tokens ${cfg.budget.tokensUsed} > max ${cfg.budget.maxTokens}`,
    };
  }
  return null;
}

function checkFreshness(call: ToolCall, ttlMs: number): GateResult | null {
  if (call.name === "refund_customer") {
    const args = call.arguments as RefundArgs;
    if (!args.balance_snapshot_at) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: "missing balance_snapshot_at dependency",
      };
    }
    const row = fixtures.getBalance(args.order_id);
    if (!row) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `unknown order_id ${args.order_id}`,
      };
    }
    const snap = Date.parse(args.balance_snapshot_at);
    if (row.lastMutatedAt > snap) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `balance mutated at ${new Date(row.lastMutatedAt).toISOString()} after snapshot ${args.balance_snapshot_at}`,
      };
    }
    if (Date.now() - snap > ttlMs) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `snapshot age exceeds TTL ${ttlMs}ms`,
      };
    }
  }

  if (call.name === "book_slot") {
    const args = call.arguments as BookSlotArgs;
    if (!args.slot_checked_at) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: "missing slot_checked_at dependency",
      };
    }
    const row = fixtures.getSlot(args.calendar_id, args.start);
    if (!row) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `unknown slot ${args.calendar_id}@${args.start}`,
      };
    }
    const snap = Date.parse(args.slot_checked_at);
    if (row.lastMutatedAt > snap) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `slot mutated at ${new Date(row.lastMutatedAt).toISOString()} after check ${args.slot_checked_at}`,
      };
    }
    if (Date.now() - snap > ttlMs) {
      return {
        decision: "block",
        reason: "STALE_EVIDENCE",
        detail: `slot check age exceeds TTL ${ttlMs}ms`,
      };
    }
  }

  return null;
}

function checkApproval(cfg: RunFenceConfig, name: ToolName): GateResult | null {
  if (!cfg.requireApproval.has(name)) return null;
  if (!existsSync(cfg.approvalFile)) {
    return {
      decision: "block",
      reason: "NEEDS_APPROVAL",
      detail: `write tool ${name} requires approval file at ${cfg.approvalFile}`,
    };
  }
  return null;
}

function consumeApproval(cfg: RunFenceConfig, name: ToolName): void {
  if (!cfg.requireApproval.has(name)) return;
  if (existsSync(cfg.approvalFile)) {
    unlinkSync(cfg.approvalFile);
  }
}

export type ToolExecutor = (call: ToolCall) => Promise<unknown>;

export function wrapWithRunFence(
  cfg: RunFenceConfig,
  execute: ToolExecutor
): ToolExecutor {
  return async (call: ToolCall) => {
    const hash = argHash(call.arguments);

    const budgetHit = checkBudget(cfg);
    if (budgetHit) {
      appendAudit(cfg.auditDir, {
        ts: new Date().toISOString(),
        run_id: cfg.runId,
        tool: call.name,
        decision: budgetHit.decision,
        reason: budgetHit.reason,
        arg_hash: hash,
        step: cfg.budget.stepsUsed,
        tokens_used: cfg.budget.tokensUsed,
        detail: budgetHit.detail,
      });
      throw Object.assign(new Error(`RunFence HARD KILL: ${budgetHit.reason}`), {
        reason: budgetHit.reason,
        detail: budgetHit.detail,
      });
    }

    const staleHit = checkFreshness(call, cfg.freshnessTtlMs);
    if (staleHit) {
      appendAudit(cfg.auditDir, {
        ts: new Date().toISOString(),
        run_id: cfg.runId,
        tool: call.name,
        decision: staleHit.decision,
        reason: staleHit.reason,
        arg_hash: hash,
        step: cfg.budget.stepsUsed,
        tokens_used: cfg.budget.tokensUsed,
        detail: staleHit.detail,
      });
      throw Object.assign(new Error(`RunFence HARD KILL: ${staleHit.reason}`), {
        reason: staleHit.reason,
        detail: staleHit.detail,
      });
    }

    const approvalHit = checkApproval(cfg, call.name);
    if (approvalHit) {
      appendAudit(cfg.auditDir, {
        ts: new Date().toISOString(),
        run_id: cfg.runId,
        tool: call.name,
        decision: approvalHit.decision,
        reason: approvalHit.reason,
        arg_hash: hash,
        step: cfg.budget.stepsUsed,
        tokens_used: cfg.budget.tokensUsed,
        detail: approvalHit.detail,
      });
      throw Object.assign(
        new Error(`RunFence HARD KILL: ${approvalHit.reason}`),
        { reason: approvalHit.reason, detail: approvalHit.detail }
      );
    }

    appendAudit(cfg.auditDir, {
      ts: new Date().toISOString(),
      run_id: cfg.runId,
      tool: call.name,
      decision: "allow",
      reason: "PASS",
      arg_hash: hash,
      step: cfg.budget.stepsUsed,
      tokens_used: cfg.budget.tokensUsed,
    });

    const result = await execute(call);
    consumeApproval(cfg, call.name);
    return result;
  };
}

export function defaultConfig(
  overrides: Partial<RunFenceConfig> & { runId: string }
): RunFenceConfig {
  const budget = {
    maxSteps: 10,
    maxTokens: 10_000,
    stepsUsed: 0,
    tokensUsed: 0,
    ...(overrides.budget ?? {}),
  };
  return {
    runId: overrides.runId,
    freshnessTtlMs: overrides.freshnessTtlMs ?? 60_000,
    budget,
    requireApproval:
      overrides.requireApproval ??
      new Set<ToolName>(["refund_customer", "book_slot"]),
    auditDir: overrides.auditDir ?? AUDIT_DIR,
    approvalFile: overrides.approvalFile ?? APPROVAL_FILE,
  };
}

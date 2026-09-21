/** RunFence demo types — fake MCP tool shim + hard-kill reason codes */

export type ReasonCode =
  | "STALE_EVIDENCE"
  | "BUDGET_EXCEEDED"
  | "NEEDS_APPROVAL"
  | "PASS";

export type Decision = "allow" | "block";

export interface RefundArgs {
  amount: number;
  order_id: string;
  /** ISO timestamp of the balance snapshot the agent reasoned over */
  balance_snapshot_at?: string;
}

export interface BookSlotArgs {
  calendar_id: string;
  start: string;
  /** ISO timestamp when the agent last checked slot availability */
  slot_checked_at?: string;
}

export type ToolName = "refund_customer" | "book_slot";

export interface ToolCall {
  name: ToolName;
  arguments: RefundArgs | BookSlotArgs;
}

export interface GateResult {
  decision: Decision;
  reason: ReasonCode;
  detail?: string;
}

export interface RunBudget {
  maxSteps: number;
  maxTokens?: number;
  stepsUsed: number;
  tokensUsed: number;
}

export interface AuditRecord {
  ts: string;
  run_id: string;
  tool: ToolName;
  decision: Decision;
  reason: ReasonCode;
  arg_hash: string;
  step: number;
  tokens_used: number;
  detail?: string;
}

export interface RunFenceConfig {
  runId: string;
  /** Freshness TTL in ms — evidence older than this vs fixture mutation is stale */
  freshnessTtlMs: number;
  budget: RunBudget;
  /** Tools that require human approval before execute */
  requireApproval: Set<ToolName>;
  /** Directory for JSONL audit */
  auditDir: string;
  /** Path to approval token file (presence = approved once) */
  approvalFile: string;
}

/**
 * Fake MCP-shaped write tools — in-memory only, no real money/booking APIs.
 */
import { fixtures } from "./fixtures.js";
import type { BookSlotArgs, RefundArgs, ToolCall } from "./types.js";

export async function executeTool(call: ToolCall): Promise<unknown> {
  switch (call.name) {
    case "refund_customer":
      return refundCustomer(call.arguments as RefundArgs);
    case "book_slot":
      return bookSlot(call.arguments as BookSlotArgs);
    default:
      throw new Error(`unknown tool: ${(call as ToolCall).name}`);
  }
}

function refundCustomer(args: RefundArgs) {
  const row = fixtures.getBalance(args.order_id);
  if (!row) throw new Error(`order not found: ${args.order_id}`);
  if (args.amount > row.balance) {
    throw new Error(
      `insufficient balance: want ${args.amount}, have ${row.balance}`
    );
  }
  row.balance -= args.amount;
  row.lastMutatedAt = Date.now();
  return {
    ok: true,
    tool: "refund_customer",
    order_id: args.order_id,
    refunded: args.amount,
    remaining_balance: row.balance,
    note: "FAKE — no real money moved",
  };
}

function bookSlot(args: BookSlotArgs) {
  const row = fixtures.getSlot(args.calendar_id, args.start);
  if (!row) throw new Error(`slot not found: ${args.calendar_id}@${args.start}`);
  if (!row.available) throw new Error("slot unavailable");
  row.available = false;
  row.lastMutatedAt = Date.now();
  return {
    ok: true,
    tool: "book_slot",
    calendar_id: args.calendar_id,
    start: args.start,
    booked: true,
    note: "FAKE — no real calendar API",
  };
}

/** MCP-ish tool descriptors for docs / discovery */
export const TOOL_DESCRIPTORS = [
  {
    name: "refund_customer",
    description: "Refund a customer order (FAKE fixture). Requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        order_id: { type: "string" },
        balance_snapshot_at: {
          type: "string",
          description: "ISO time of the balance evidence used",
        },
      },
      required: ["amount", "order_id"],
    },
  },
  {
    name: "book_slot",
    description: "Book a calendar slot (FAKE fixture). Requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        calendar_id: { type: "string" },
        start: { type: "string" },
        slot_checked_at: {
          type: "string",
          description: "ISO time when availability was checked",
        },
      },
      required: ["calendar_id", "start"],
    },
  },
] as const;

/**
 * In-memory fixtures for fake refund + booking tools.
 * Mutating after an agent snapshot proves STALE_EVIDENCE.
 */

export interface BalanceRow {
  order_id: string;
  balance: number;
  lastMutatedAt: number; // epoch ms
}

export interface SlotRow {
  calendar_id: string;
  start: string;
  available: boolean;
  lastMutatedAt: number;
}

export class Fixtures {
  balances = new Map<string, BalanceRow>();
  slots = new Map<string, SlotRow>();

  seed(): void {
    const now = Date.now();
    this.balances.set("ORD-1001", {
      order_id: "ORD-1001",
      balance: 50.0,
      lastMutatedAt: now,
    });
    this.slots.set("cal-main|2026-09-22T10:00:00Z", {
      calendar_id: "cal-main",
      start: "2026-09-22T10:00:00Z",
      available: true,
      lastMutatedAt: now,
    });
  }

  getBalance(orderId: string): BalanceRow | undefined {
    return this.balances.get(orderId);
  }

  /** Mutate balance — used by STALE demo after agent snapshot */
  mutateBalance(orderId: string, newBalance: number): BalanceRow {
    const row = this.balances.get(orderId);
    if (!row) throw new Error(`unknown order_id: ${orderId}`);
    row.balance = newBalance;
    row.lastMutatedAt = Date.now();
    this.balances.set(orderId, row);
    return row;
  }

  getSlot(calendarId: string, start: string): SlotRow | undefined {
    return this.slots.get(`${calendarId}|${start}`);
  }

  mutateSlot(
    calendarId: string,
    start: string,
    available: boolean
  ): SlotRow {
    const key = `${calendarId}|${start}`;
    const row = this.slots.get(key);
    if (!row) throw new Error(`unknown slot: ${key}`);
    row.available = available;
    row.lastMutatedAt = Date.now();
    this.slots.set(key, row);
    return row;
  }
}

export const fixtures = new Fixtures();

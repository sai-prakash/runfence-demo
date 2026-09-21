**Public repo:** https://github.com/sai-prakash/runfence-demo

# RunFence Demo

**RunFence** — a thin runtime control layer that hard-kills tool-using agents on blown budgets, stale evidence, or missing human approval before irreversible writes.

This repo is the **Design-Partner Kit technical core**: a fake MCP-shaped tool shim + middleware that deterministically reproduces three reason codes.

> **Demo-only.** In-memory fixtures. No real money APIs, no live booking, no Stripe. Not a hosted SaaS. Confirmed customers: **0**. MIT licensed.

**Company:** RunFence · **Ship target:** 2026-10-05 IST · **GitHub org/repo:** planned (not created yet) — see `COMPANY.md`.


## Reason codes

| Code | Gate | Behavior |
|------|------|----------|
| `BUDGET_EXCEEDED` | Per-run max steps (+ optional token counter) | Hard kill — not a warning |
| `STALE_EVIDENCE` | Freshness TTL on declared deps (`balance_snapshot_at`, `slot_checked_at`) | Block if fixture mutated after snapshot |
| `NEEDS_APPROVAL` | Write tools require local approval token | Block until `npm run approve`; one-shot then consume |

## Quick start

```bash
cd runfence-demo
npm install
npm run demo:stale      # → STALE_EVIDENCE
npm run demo:budget     # → BUDGET_EXCEEDED
npm run demo:approval   # → NEEDS_APPROVAL then PASS
```

Approve a write once (used by `demo:approval` internally; also available solo):

```bash
npm run approve
```

## Fake tools

- `refund_customer({ amount, order_id, balance_snapshot_at? })`
- `book_slot({ calendar_id, start, slot_checked_at? })`

## Audit

JSONL under `audit/<run_id>.jsonl` — fields: `ts`, `run_id`, `tool`, `decision` (`allow`|`block`), `reason`, `arg_hash`, `step`, `tokens_used`, `detail`.

Demo transcripts + copied audit samples land in `artifacts/` after each run.

## Transcripts (paths)

After a clean run:

- `artifacts/demo-stale.txt` + `artifacts/demo-stale.audit.jsonl`
- `artifacts/demo-budget.txt` + `artifacts/demo-budget.audit.jsonl`
- `artifacts/demo-approval.txt` + `artifacts/demo-approval.audit.jsonl`

## Layout

```
src/
  types.ts fixtures.ts tools.ts middleware.ts audit.ts hash.ts paths.ts approve.ts
  demos/stale.ts demos/budget.ts demos/approval.ts
audit/          # runtime JSONL
artifacts/      # captured transcripts
```

## Honesty

Built for Sai Prakash / Company OS research (`03` thesis, `04` who-pays test, `10` MVP). Payment rails and Lemon Squeezy are **out of scope** for this folder. Do not treat this as production liability coverage.

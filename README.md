# harness-0.1

A governed AI-assisted test automation harness for Playwright.

## Current milestone

The harness can safely **discover** an approved application, persist a compact app map in SQLite, generate a reviewable test plan, and pause for explicit approval. It does not execute state-changing browser actions yet.

```text
Discover (read-only) → Plan → Human approval → Ready for constrained execution
```

### Safety boundaries

- Discovery never clicks, fills, submits, uploads, or uses credentials.
- HTTPS is required by default; use `--allow-insecure-http` only for local/isolated test environments.
- Only configured origins may load; cross-origin requests are blocked.
- Known destructive URL paths are not crawled.
- Secrets are referenced by name only and must never enter model context.
- Raw screenshots and future traces stay in artifacts; the app map contains bounded, redacted metadata.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm harness discover \
  --url https://staging.example.test \
  --goal "Verify a standard user can sign in and create a draft order"
```

The command prints a `runId` and a pending plan. Inspect it before choosing either outcome:

```bash
pnpm harness status <run-id>
pnpm harness approve <run-id> --approver "Tharaka" --note "Scope reviewed"
pnpm harness reject <run-id> --approver "Tharaka" --note "Adjust the proposed flow"
```

All run state and LangGraph checkpoints live in `data/harness.sqlite`; screenshots are stored under `artifacts/<run-id>/`.

## Commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

## Architecture

- **LangGraph.js** — durable Discover → Plan → Approval workflow
- **SQLite** — run records, app snapshots, plans, audit events, and LangGraph checkpoints
- **Playwright** — read-only app discovery and evidence capture
- **Zod** — validated run, policy, snapshot, plan, and approval schemas

## Next milestone

Implement the constrained execution adapter: permit only approved action types, inject named test-account secrets outside model context, require deterministic assertions, and clean up any created test data.

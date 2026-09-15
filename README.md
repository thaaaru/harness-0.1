# harness-0.1

A governed AI-assisted test automation harness for Playwright.

## Current milestone

The harness discovers an approved application, persists a compact app map in SQLite, generates a reviewable test plan, and pauses for explicit approval. An approved run can then execute only direct, same-origin `GET` navigations with title and primary-heading assertions; state-changing browser actions remain unavailable.

```text
Discover (read-only) → Plan → Human approval → Constrained read-only execution
```

### Safety boundaries

- Discovery never clicks, fills, submits, uploads, or uses credentials.
- Execution exposes no click, fill, submit, upload, authentication, or credential capability; it can only navigate with `GET` and assert the approved discovery snapshot.
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
  --goal "Verify a standard user can sign in and create a draft order" \
  --headless false
```

The command prints a `runId` and a pending plan. Inspect it before choosing either outcome:

```bash
pnpm harness status <run-id>
pnpm harness approve <run-id> --approver "Tharaka" --note "Scope reviewed"
pnpm harness execute <run-id>
pnpm harness reject <run-id> --approver "Tharaka" --note "Adjust the proposed flow"
```

`--headless` defaults to `true` during discovery and is persisted with the run. Pass `--headless false` to discovery to watch both discovery and its later execution; execution may override it with the same flag.

All run state, execution results, and LangGraph checkpoints live in `data/harness.sqlite`; screenshots are stored under `artifacts/<run-id>/`.

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
- **SQLite** — run records, app snapshots, plans, execution results, audit events, and LangGraph checkpoints
- **Playwright** — read-only app discovery, constrained `GET` navigation assertions, and evidence capture
- **Zod** — validated run, policy, snapshot, plan, and approval schemas

## Next milestone

Add separately proposed-and-approved interaction adapters (such as mobile-navigation and form-validation checks), named test-account secrets outside model context, deterministic assertions, and cleanup for any future test data.

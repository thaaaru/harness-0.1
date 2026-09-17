# TekAssure

TekLab’s governed AI-assisted Playwright test automation CLI.

## Current milestone

The harness discovers an approved application, persists a compact app map in SQLite, generates a reviewable test plan, and pauses for explicit approval. An approved run can then execute only direct, same-origin `GET` navigations with title and primary-heading assertions; state-changing browser actions remain unavailable.

```text
Discover (read-only) → Plan → Human approval → Constrained read-only execution
```

### Safety boundaries

- Discovery never clicks, fills, submits, uploads, or handles credentials; an authenticated run only reuses a session an operator captured separately (see [Authenticated scans](#authenticated-scans)).
- Execution exposes no click, fill, submit, upload, authentication, or credential capability; it can only navigate with `GET` and assert the approved discovery snapshot.
- HTTPS is required by default; use `--allow-insecure-http` only for local/isolated test environments.
- Only configured origins may load; cross-origin requests are blocked.
- Known destructive URL paths are not crawled.
- Secrets are referenced by name only and must never enter model context.
- Raw screenshots and future traces stay in artifacts; the app map contains bounded, redacted metadata.

## Install

Requires Node.js 22+, pnpm, and GitHub SSH access to this private repository.

Clone the repository and run the installer:

```bash
git clone git@github.com:thaaaru/harness-0.1.git && cd harness-0.1 && ./install.sh
```

If pnpm's global bin directory is not already on your shell `PATH`, the installer prints the exact export commands to run once or you can open a new terminal.

To update later, pull the repository and rerun the script:

```bash
git pull --ff-only && ./install.sh
```

### Alternative: GitHub Packages

Authenticate once with a GitHub classic personal access token that has `read:packages` permission:

```bash
npm login --scope=@thaaaru --auth-type=legacy --registry=https://npm.pkg.github.com
```

Then install the private package:

```bash
npm install --global @thaaaru/tekassure && tekassure install-browser
```

Use the global command:

```bash
tekassure --help
```

````

## Local development

```bash
pnpm install
pnpm tekassure discover \
  --url https://staging.example.test \
  --headless false
````

### Default `web-app-baseline` goal

When `--goal` is omitted, TekAssure uses `web-app-baseline`: a broad, governed starting point covering safe public-route reachability, titles, primary headings, and discovery-based navigation/form/authentication boundary review. Pass `--goal "your custom objective"` to override it. Interactive journeys, authentication, submissions, accessibility, responsiveness, performance, and security remain **separate approval scopes**; the default does not execute those actions or claim those checks have run.

The command prints a `runId` and a pending plan. Inspect it before choosing either outcome:

```bash
tekassure status <run-id>
tekassure approve <run-id> --approver "Tharaka" --note "Scope reviewed"
tekassure execute <run-id>
tekassure reject <run-id> --approver "Tharaka" --note "Adjust the proposed flow"
```

`--headless` defaults to `true` during discovery and is persisted with the run. Pass `--headless false` to watch discovery and its later execution; execution may override it with the same flag.

All run state, execution results, and LangGraph checkpoints live in `data/harness.sqlite`; screenshots are stored under `artifacts/<run-id>/`.

### Authenticated scans

Routes gated behind a login are invisible to an anonymous crawl. Capture a
session once, out of band, and reuse it — the harness never handles the
password, MFA, or SSO flow itself:

```bash
tekassure login --url https://staging.example.test/login --save-storage-state ./auth/staging.json
# a headed browser opens; log in however the app requires, then press Enter

tekassure discover --url https://staging.example.test --storage-state ./auth/staging.json
```

The saved file holds live session cookies — treat it like a credential
(`0600` permissions, not committed to version control). `discover` fails fast
if the path does not exist. Once a run is created with `--storage-state`, its
later `execute` reuses the same session automatically. Every other guarantee
in [Safety boundaries](#safety-boundaries) is unchanged: no click, fill,
submit, or upload is added by authenticating; the crawl can only reach
further pages, not perform further actions. See
`docs/superpowers/specs/2026-09-17-authenticated-scan-design.md` for the full
design.

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

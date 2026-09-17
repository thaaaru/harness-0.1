import type { BrandConfig } from "../brand.js";
import type { RunRecord, RunStatus, Project } from "../domain.js";
import {
  escapeHtml,
  renderDiscoverySection,
  renderExecutionSection,
  renderPlanSection,
} from "../reporting/report.js";
import type { WorkflowResult } from "../workflow/harness-workflow.js";

const PAGE_STYLE = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 2rem; max-width: 960px; }
  h1 { margin-bottom: 0.25rem; }
  h1 a { color: inherit; text-decoration: none; }
  .meta { color: #555; margin-bottom: 1.5rem; }
  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
  .badge.passed { background: #dcfce7; color: #166534; }
  .badge.failed { background: #fee2e2; color: #991b1b; }
  .badge.default { background: #e5e7eb; color: #374151; }
  .badge.read_only { background: #dbeafe; color: #1e3a8a; }
  .badge.session_change { background: #fef3c7; color: #92400e; }
  .badge.state_change { background: #fee2e2; color: #991b1b; }
  section { margin-bottom: 2.5rem; }
  h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.4rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .errors { color: #991b1b; font-size: 0.9rem; }
  img.screenshot { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; margin-top: 0.5rem; }
  code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
  th { color: #555; font-weight: 600; }
  tr:hover td { background: #fafafa; }
  a.run-link { color: #1e3a8a; text-decoration: none; font-weight: 600; }
  .actions { margin: 1.5rem 0; }
  button { font-size: 1rem; padding: 0.6rem 1.4rem; border-radius: 6px; border: none; cursor: pointer; margin-right: 0.75rem; }
  button.approve { background: #166534; color: white; }
  button.reject { background: #991b1b; color: white; }
  button.execute { background: #1e3a8a; color: white; }
  button:disabled { opacity: 0.5; cursor: default; }
  label { display: block; margin: 0.75rem 0 0.25rem; font-size: 0.9rem; color: #333; }
  input[type="text"], input[type="url"], input[type="number"], select {
    padding: 0.4rem; width: 100%; max-width: 420px; box-sizing: border-box;
  }
  input[type="checkbox"] { width: auto; margin-right: 0.4rem; }
  form.card { max-width: 480px; }
  .hint { color: #777; font-size: 0.8rem; }
  #status { margin-top: 1rem; font-weight: 600; }
  #log { list-style: none; margin: 1rem 0; padding: 0; font-family: ui-monospace, monospace; font-size: 0.9rem; }
  #log li { padding: 0.25rem 0; }
  #log li.pass { color: #166534; }
  #log li.fail { color: #991b1b; }
  .completion { border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-top: 1rem; }
  .completion a { display: inline-block; margin-right: 1rem; font-weight: 600; }
  nav.top { margin-bottom: 1.5rem; font-size: 0.9rem; }
  nav.top a { color: #1e3a8a; text-decoration: none; margin-right: 1rem; }
`;

function page(title: string, brand: BrandConfig, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(brand.productName)} — ${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<nav class="top"><a href="/">${escapeHtml(brand.productName)} dashboard</a> · <a href="/login">Capture a login session</a></nav>
${body}
</body>
</html>`;
}

function runStatusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    discovering: "default",
    planning: "default",
    awaiting_approval: "default",
    ready_to_execute: "default",
    executing: "default",
    passed: "passed",
    rejected: "default",
    failed: "failed",
  };
  return `<span class="badge ${labels[status]}">${escapeHtml(status)}</span>`;
}

export function renderHomePage(runs: RunRecord[], projects: Project[], brand: BrandConfig): string {
  const rows = runs
    .map(
      (run) => `<tr>
        <td><a class="run-link" href="/runs/${escapeHtml(run.id)}">${escapeHtml(run.targetUrl)}</a></td>
        <td>${runStatusLabel(run.status)}</td>
        <td>${escapeHtml(run.input.storageStatePath ? "authenticated" : "anonymous")}</td>
        <td>${escapeHtml(new Date(run.createdAt).toLocaleString())}</td>
      </tr>`,
    )
    .join("");

  const projectOptions = projects
    .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`)
    .join("");

  const body = `
  <h1>${escapeHtml(brand.productName)}</h1>
  <div class="meta">Discover, review, approve, and execute governed read-only scans.</div>

  <h2>Runs</h2>
  ${
    runs.length === 0
      ? `<p class="hint">No runs yet — start one below.</p>`
      : `<table>
          <thead><tr><th>Target</th><th>Status</th><th>Session</th><th>Started</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
  }

  <h2>Start a new scan</h2>
  <form class="card" method="post" action="/runs">
    <label for="targetUrl">Application URL</label>
    <input type="url" id="targetUrl" name="targetUrl" placeholder="https://example.test" required>

    <label for="goal">Goal (optional — defaults to the governed baseline)</label>
    <input type="text" id="goal" name="goal" placeholder="web-app-baseline">

    <label for="storageStatePath">Storage state file (optional — for an authenticated scan)</label>
    <input type="text" id="storageStatePath" name="storageStatePath" placeholder="auth/example.json">
    <div class="hint">Don't have one yet? <a href="/login">Capture a login session</a> first.</div>

    <label for="maxPages">Max pages to inspect</label>
    <input type="number" id="maxPages" name="maxPages" value="10" min="1" max="50">

    <label><input type="checkbox" name="allowInsecureHttp" value="true"> Allow plain HTTP (local/isolated targets only)</label>

    ${
      projects.length > 0
        ? `<label for="projectId">Project (optional)</label>
           <select id="projectId" name="projectId">
             <option value="">— none —</option>
             ${projectOptions}
           </select>`
        : ""
    }

    <div class="actions">
      <button class="execute" type="submit">Start discovery</button>
    </div>
  </form>`;

  return page("dashboard", brand, body);
}

export function renderRunPage(result: WorkflowResult, run: RunRecord, brand: BrandConfig): string {
  const sections = `
    ${result.plan ? renderPlanSection(result.plan) : ""}
    ${result.snapshot ? renderDiscoverySection(result.snapshot) : ""}
    ${result.execution ? renderExecutionSection(result.execution) : ""}`;

  const header = `
  <h1>${escapeHtml(run.targetUrl)}</h1>
  <div class="meta">
    Run <code>${escapeHtml(run.id)}</code> · ${runStatusLabel(run.status)}
    ${run.input.storageStatePath ? `· authenticated (<code>${escapeHtml(run.input.storageStatePath)}</code>)` : "· anonymous"}
  </div>`;

  const canRetryExecution = run.status === "failed" && run.approval?.decision === "approved";

  let actions = "";
  if (run.status === "awaiting_approval") {
    actions = `
    <div class="actions">
      <form method="post" action="/runs/${escapeHtml(run.id)}/approve" style="display:inline">
        <input type="text" name="approver" placeholder="Your name" required>
        <button class="approve" type="submit">Approve</button>
      </form>
      <form method="post" action="/runs/${escapeHtml(run.id)}/reject" style="display:inline">
        <input type="text" name="approver" placeholder="Your name" required>
        <button class="reject" type="submit">Reject</button>
      </form>
    </div>`;
  } else if (run.status === "ready_to_execute" || canRetryExecution) {
    actions = `
    <div class="actions">
      <button class="execute" id="execute-button" onclick="runExecute('${escapeHtml(run.id)}')">${
        canRetryExecution ? "Retry execution" : "Execute now"
      }</button>
    </div>
    <ul id="log"></ul>
    <div id="completion"></div>
    <script>
      function runExecute(runId) {
        document.getElementById('execute-button').disabled = true;
        const log = document.getElementById('log');
        const source = new EventSource('/runs/' + runId + '/execute-stream');

        source.addEventListener('check-start', (event) => {
          const data = JSON.parse(event.data);
          const item = document.createElement('li');
          item.textContent = 'Checking ' + data.url + ' …';
          log.appendChild(item);
        });

        source.addEventListener('check-complete', (event) => {
          const data = JSON.parse(event.data);
          const item = document.createElement('li');
          item.className = data.status === 'passed' ? 'pass' : 'fail';
          item.textContent = (data.status === 'passed' ? '\\u2713 ' : '\\u2717 ') + data.url + ' \\u2014 ' + data.status
            + (data.error ? ': ' + data.error : '');
          log.appendChild(item);
        });

        source.addEventListener('done', (event) => {
          const data = JSON.parse(event.data);
          source.close();
          const banner = data.status === 'passed' ? '\\u2705 Test completed' : '\\u26a0\\ufe0f Test completed with failures';
          document.getElementById('completion').innerHTML =
            '<div class="completion"><strong>' + banner + '</strong> \\u2014 ' + data.passed + ' of ' + data.total + ' check(s) passed.'
            + '<div style="margin-top: 1rem;">'
            + '<a href="/runs/' + runId + '/report.html" target="_blank">View full report</a>'
            + '<a href="/runs/' + runId + '/report.pdf" target="_blank">Download PDF</a>'
            + '</div></div>';
        });

      }
    </script>`;
  } else if (run.status === "passed" || (run.status === "failed" && result.execution)) {
    actions = `
    <div class="actions">
      <a class="run-link" href="/runs/${escapeHtml(run.id)}/report.html" target="_blank">View full report</a>
      &nbsp;·&nbsp;
      <a class="run-link" href="/runs/${escapeHtml(run.id)}/report.pdf" target="_blank">Download PDF</a>
    </div>`;
  } else if (run.status === "rejected") {
    actions = `<p class="hint">This plan was rejected before any checks ran.</p>`;
  } else {
    actions = `<p class="hint">This run is still ${escapeHtml(run.status)} — refresh in a moment.</p>`;
  }

  return page(run.targetUrl, brand, `${header}${actions}${sections}`);
}

export function renderLoginPage(brand: BrandConfig, error?: string): string {
  const body = `
  <h1>Capture a login session</h1>
  <div class="meta">
    A headed browser opens on the URL below. Log in however the app requires
    (password, MFA, SSO), then come back here and confirm. TekAssure never
    sees your credentials — only the resulting session is saved.
  </div>
  ${error ? `<p class="errors">${escapeHtml(error)}</p>` : ""}
  <form class="card" method="post" action="/login">
    <label for="url">Login URL</label>
    <input type="url" id="url" name="url" placeholder="https://example.test/login" required>

    <label for="outputPath">Save storage state to</label>
    <input type="text" id="outputPath" name="outputPath" placeholder="auth/example.json" required>

    <div class="actions">
      <button class="execute" type="submit">Open browser to log in</button>
    </div>
  </form>`;

  return page("capture a login session", brand, body);
}

export function renderLoginPendingPage(brand: BrandConfig, outputPath: string): string {
  const body = `
  <h1>Log in in the browser window</h1>
  <div class="meta">
    A browser window opened. Once you have logged in and can see the
    authenticated application, come back here and confirm.
  </div>
  <form class="card" method="post" action="/login/confirm">
    <input type="hidden" name="outputPath" value="${escapeHtml(outputPath)}">
    <div class="actions">
      <button class="approve" type="submit">I'm logged in — save the session</button>
    </div>
  </form>
  <form method="post" action="/login/cancel">
    <button class="reject" type="submit">Cancel</button>
  </form>`;

  return page("logging in", brand, body);
}

export function renderLoginSavedPage(brand: BrandConfig, outputPath: string): string {
  const body = `
  <h1>Session saved</h1>
  <div class="meta">Storage state written to <code>${escapeHtml(outputPath)}</code>.</div>
  <p>Use it on the <a href="/">dashboard</a> to start an authenticated scan.</p>`;

  return page("session saved", brand, body);
}

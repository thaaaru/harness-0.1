import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { getSafeDiscoveryUrl, normalizePolicy } from "../policy.js";
/**
 * Performs an inspect-only crawl. It never clicks, fills, submits, or follows
 * cross-origin requests. Crawled links are loaded with GET only and known
 * destructive paths are filtered by the policy layer.
 */
export class PlaywrightAppDiscoverer {
    async discover(request) {
        const policy = normalizePolicy(request.targetUrl, request.policy);
        const root = getSafeDiscoveryUrl(request.targetUrl, request.targetUrl, policy);
        if (!root) {
            throw new Error("The supplied target URL is not allowed by the discovery policy.");
        }
        const runDirectory = join(request.artifactsDirectory, request.runId);
        const screenshotDirectory = join(runDirectory, "screenshots");
        await mkdir(screenshotDirectory, { recursive: true });
        const browser = await chromium.launch({ headless: request.headless ?? true });
        const context = await browser.newContext({ serviceWorkers: "block" });
        const consoleMessages = [];
        const pageErrors = [];
        await context.route("**/*", async (route) => {
            const requestUrl = new URL(route.request().url());
            const isSafeProtocol = requestUrl.protocol === "data:" || requestUrl.protocol === "blob:";
            const isAllowedOrigin = policy.allowedOrigins.includes(requestUrl.origin);
            const isReadOnlyNavigation = !route.request().isNavigationRequest() || route.request().method() === "GET";
            if ((!isSafeProtocol && !isAllowedOrigin) || !isReadOnlyNavigation) {
                await route.abort();
                return;
            }
            await route.continue();
        });
        const page = await context.newPage();
        page.on("console", (message) => {
            if (message.type() === "error" || message.type() === "warning") {
                consoleMessages.push(redactAndTruncate(message.text()));
            }
        });
        page.on("pageerror", (error) => pageErrors.push(redactAndTruncate(error.message)));
        const pages = [];
        const warnings = [];
        const queued = [root.toString()];
        const visited = new Set();
        try {
            while (queued.length > 0 && pages.length < policy.maxPages) {
                const candidate = queued.shift();
                if (!candidate || visited.has(candidate)) {
                    continue;
                }
                visited.add(candidate);
                const consoleStart = consoleMessages.length;
                const pageErrorStart = pageErrors.length;
                try {
                    await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 20_000 });
                    const snapshot = await this.capturePage(page, candidate, screenshotDirectory, policy, consoleMessages.slice(consoleStart), pageErrors.slice(pageErrorStart));
                    pages.push(snapshot);
                    for (const link of snapshot.links) {
                        if (!visited.has(link) &&
                            !queued.includes(link) &&
                            queued.length + pages.length < policy.maxPages) {
                            queued.push(link);
                        }
                    }
                }
                catch (error) {
                    warnings.push(`Could not inspect ${candidate}: ${redactAndTruncate(toErrorMessage(error))}`);
                }
            }
        }
        finally {
            await context.close();
            await browser.close();
        }
        if (pages.length === 0) {
            throw new Error("Discovery did not capture any pages. Review the target URL and network policy.");
        }
        if (queued.length > 0) {
            warnings.push(`Discovery stopped after the configured limit of ${policy.maxPages} page(s).`);
        }
        return {
            id: randomUUID(),
            targetUrl: root.toString(),
            discoveredAt: new Date().toISOString(),
            pages,
            warnings: unique(warnings),
        };
    }
    async capturePage(page, requestedUrl, screenshotDirectory, policy, consoleErrors, pageErrors) {
        const currentUrl = getSafeDiscoveryUrl(page.url(), requestedUrl, policy);
        if (!currentUrl) {
            throw new Error("The page redirected outside the approved discovery scope.");
        }
        const [title, headings, rawControls, rawLinks] = await Promise.all([
            page.title(),
            page
                .locator("h1, h2, h3, [role='heading']")
                .evaluateAll((elements) => elements.slice(0, 30).map((element) => element.textContent ?? "")),
            page.locator("button, input, textarea, select, form, [role]").evaluateAll((elements) => elements.slice(0, 200).map((element) => {
                const htmlElement = element;
                const input = element;
                return {
                    tagName: element.tagName.toLowerCase(),
                    role: element.getAttribute("role"),
                    label: element.getAttribute("aria-label") ??
                        element.getAttribute("title") ??
                        input.labels?.[0]?.textContent ??
                        element.closest("label")?.textContent ??
                        htmlElement.innerText ??
                        null,
                    name: element.getAttribute("name"),
                    inputType: input.type || null,
                    disabled: "disabled" in htmlElement && Boolean(htmlElement.disabled),
                };
            })),
            page
                .locator("a[href]")
                .evaluateAll((elements) => elements.slice(0, 200).map((element) => ({ href: element.href }))),
        ]);
        const links = rawLinks
            .map((link) => getSafeDiscoveryUrl(link.href, currentUrl.toString(), policy)?.toString())
            .filter((link) => Boolean(link))
            .slice(0, policy.maxLinksPerPage);
        const controls = rawControls
            .map((control) => normalizeControl(control))
            .slice(0, policy.maxControlsPerPage);
        const sanitizedHeadings = headings.map(redactAndTruncate).filter(Boolean).slice(0, 30);
        const safeTitle = redactAndTruncate(title);
        const screenshotPath = join(screenshotDirectory, `${fingerprint(currentUrl.toString()).slice(0, 12)}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const snapshotWithoutFingerprint = {
            url: currentUrl.toString(),
            path: `${currentUrl.pathname}${currentUrl.search}`,
            title: safeTitle,
            headings: unique(sanitizedHeadings),
            controls,
            links: unique(links),
            consoleErrors: unique(consoleErrors),
            pageErrors: unique(pageErrors),
            screenshotPath,
        };
        return {
            ...snapshotWithoutFingerprint,
            fingerprint: fingerprint(JSON.stringify(snapshotWithoutFingerprint)),
        };
    }
}
function normalizeControl(raw) {
    const text = `${raw.role ?? ""} ${raw.inputType ?? ""}`.toLowerCase();
    let kind = "other";
    if (raw.tagName === "a")
        kind = "link";
    else if (raw.tagName === "button" || raw.role === "button")
        kind = "button";
    else if (raw.tagName === "textarea")
        kind = "textarea";
    else if (raw.tagName === "select" || raw.role === "combobox")
        kind = "select";
    else if (text.includes("checkbox"))
        kind = "checkbox";
    else if (text.includes("radio"))
        kind = "radio";
    else if (raw.tagName === "input" || raw.role === "textbox")
        kind = "textbox";
    else if (raw.tagName === "form" || raw.role === "form")
        kind = "form";
    else if (raw.role === "dialog")
        kind = "dialog";
    else if (raw.role === "heading")
        kind = "heading";
    return {
        kind,
        role: raw.role ?? undefined,
        label: raw.label ? redactAndTruncate(raw.label) : undefined,
        name: raw.name ? redactAndTruncate(raw.name) : undefined,
        inputType: raw.inputType ?? undefined,
        disabled: raw.disabled,
    };
}
function redactAndTruncate(value) {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
        .replace(/(?:bearer|token|api[_-]?key|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
}
function fingerprint(value) {
    return createHash("sha256").update(value).digest("hex");
}
function unique(values) {
    return [...new Set(values)];
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

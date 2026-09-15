import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { getSafeDiscoveryUrl, normalizePolicy } from "../policy.js";
function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
}
function screenshotName(page) {
    const path = page.path === "/" ? "home" : page.path.replaceAll(/^\/+|\/+$/g, "").replaceAll(/[^a-z0-9]+/gi, "-");
    return `${path || "page"}.png`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Executes only direct GET navigations and read-only title/heading assertions.
 * It deliberately exposes no click, fill, submit, upload, or credential capability.
 */
export class PlaywrightNavigationExecutor {
    async execute(input) {
        const startedAt = new Date().toISOString();
        const policy = normalizePolicy(input.snapshot.targetUrl, input.policy);
        const outputDirectory = join(input.artifactsDirectory, input.runId, "execution");
        await mkdir(outputDirectory, { recursive: true });
        const browser = await chromium.launch({ headless: input.headless ?? true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const checks = [];
        try {
            await context.route("**/*", async (route) => {
                const request = route.request();
                if (request.method() !== "GET" ||
                    !getSafeDiscoveryUrl(request.url(), input.snapshot.targetUrl, policy)) {
                    await route.abort();
                    return;
                }
                await route.continue();
            });
            for (const pageSnapshot of input.snapshot.pages) {
                checks.push(await this.checkPage(context.newPage(), pageSnapshot, input.snapshot.targetUrl, policy, outputDirectory));
            }
        }
        finally {
            await context.close();
            await browser.close();
        }
        const completedAt = new Date().toISOString();
        return {
            runId: input.runId,
            startedAt,
            completedAt,
            status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
            checks,
        };
    }
    async checkPage(pagePromise, snapshot, targetUrl, policy, outputDirectory) {
        const page = await pagePromise;
        const expectedHeading = snapshot.headings.at(0);
        const screenshotPath = join(outputDirectory, screenshotName(snapshot));
        try {
            const safeSnapshotUrl = getSafeDiscoveryUrl(snapshot.url, targetUrl, policy);
            if (!safeSnapshotUrl) {
                throw new Error(`Snapshot route violates the execution policy: ${snapshot.url}`);
            }
            await page.goto(safeSnapshotUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
            if (!getSafeDiscoveryUrl(page.url(), targetUrl, policy)) {
                throw new Error(`Navigation redirected outside the execution policy: ${page.url()}`);
            }
            const observedTitle = normalizeText(await page.title());
            const observedHeading = normalizeText((await page.locator("h1").first().textContent()) ?? "");
            await page.screenshot({ path: screenshotPath, fullPage: true });
            const titleMatches = observedTitle === normalizeText(snapshot.title);
            const headingMatches = expectedHeading === undefined || observedHeading === normalizeText(expectedHeading);
            if (!titleMatches || !headingMatches) {
                return {
                    url: snapshot.url,
                    expectedTitle: snapshot.title,
                    observedTitle,
                    expectedHeading,
                    observedHeading,
                    status: "failed",
                    screenshotPath,
                    error: [
                        !titleMatches ? "Page title differs from the approved discovery snapshot." : undefined,
                        !headingMatches ? "Primary heading differs from the approved discovery snapshot." : undefined,
                    ]
                        .filter(Boolean)
                        .join(" "),
                };
            }
            return {
                url: snapshot.url,
                expectedTitle: snapshot.title,
                observedTitle,
                expectedHeading,
                observedHeading,
                status: "passed",
                screenshotPath,
            };
        }
        catch (error) {
            return {
                url: snapshot.url,
                expectedTitle: snapshot.title,
                expectedHeading,
                status: "failed",
                error: errorMessage(error),
            };
        }
        finally {
            await page.close();
        }
    }
}

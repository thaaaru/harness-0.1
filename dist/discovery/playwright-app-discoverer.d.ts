import type { AppSnapshot } from "../domain.js";
import type { AppDiscoverer, DiscoveryRequest } from "./contracts.js";
/**
 * Performs an inspect-only crawl. It never clicks, fills, submits, or follows
 * cross-origin requests. Crawled links are loaded with GET only and known
 * destructive paths are filtered by the policy layer.
 */
export declare class PlaywrightAppDiscoverer implements AppDiscoverer {
    discover(request: DiscoveryRequest): Promise<AppSnapshot>;
    private capturePage;
}

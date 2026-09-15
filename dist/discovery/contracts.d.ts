import type { AppSnapshot, TargetPolicy } from "../domain.js";
export type DiscoveryRequest = {
    runId: string;
    targetUrl: string;
    policy: TargetPolicy;
    artifactsDirectory: string;
    headless?: boolean;
};
export interface AppDiscoverer {
    discover(request: DiscoveryRequest): Promise<AppSnapshot>;
}

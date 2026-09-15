import type { TargetPolicy } from "./domain.js";
export declare class PolicyViolationError extends Error {
    constructor(message: string);
}
export type NormalizedPolicy = TargetPolicy & {
    allowedOrigins: string[];
};
export declare function normalizePolicy(targetUrl: string, policy: TargetPolicy): NormalizedPolicy;
export declare function getSafeDiscoveryUrl(candidate: string, baseUrl: string, policy: NormalizedPolicy): URL | undefined;
export declare function assertSafeTarget(targetUrl: string, policy: TargetPolicy): NormalizedPolicy;

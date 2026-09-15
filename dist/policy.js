const DANGEROUS_PATH_PARTS = [
    "delete",
    "destroy",
    "logout",
    "signout",
    "unsubscribe",
    "remove",
    "revoke",
    "terminate",
];
export class PolicyViolationError extends Error {
    constructor(message) {
        super(message);
        this.name = "PolicyViolationError";
    }
}
export function normalizePolicy(targetUrl, policy) {
    const target = parseAbsoluteUrl(targetUrl);
    assertSupportedProtocol(target, policy.allowInsecureHttp);
    assertNoEmbeddedCredentials(target);
    const allowedOrigins = [...new Set([target.origin, ...policy.allowedOrigins.map(normalizeOrigin)])];
    return { ...policy, allowedOrigins };
}
export function getSafeDiscoveryUrl(candidate, baseUrl, policy) {
    let url;
    try {
        url = new URL(candidate, baseUrl);
    }
    catch {
        return undefined;
    }
    if (!isSupportedProtocol(url, policy.allowInsecureHttp) || !policy.allowedOrigins.includes(url.origin)) {
        return undefined;
    }
    if (url.username || url.password || isPotentiallyDestructivePath(url)) {
        return undefined;
    }
    url.hash = "";
    return url;
}
export function assertSafeTarget(targetUrl, policy) {
    return normalizePolicy(targetUrl, policy);
}
function normalizeOrigin(value) {
    const url = parseAbsoluteUrl(value);
    assertNoEmbeddedCredentials(url);
    return url.origin;
}
function parseAbsoluteUrl(value) {
    try {
        return new URL(value);
    }
    catch {
        throw new PolicyViolationError(`Invalid target URL: ${value}`);
    }
}
function assertNoEmbeddedCredentials(url) {
    if (url.username || url.password) {
        throw new PolicyViolationError("Target URLs must not contain credentials.");
    }
}
function assertSupportedProtocol(url, allowInsecureHttp) {
    if (!isSupportedProtocol(url, allowInsecureHttp)) {
        throw new PolicyViolationError("Only HTTPS targets are allowed unless allowInsecureHttp is explicitly enabled for a test environment.");
    }
}
function isSupportedProtocol(url, allowInsecureHttp) {
    return url.protocol === "https:" || (allowInsecureHttp && url.protocol === "http:");
}
function isPotentiallyDestructivePath(url) {
    const searchable = `${url.pathname}${url.search}`.toLowerCase();
    return DANGEROUS_PATH_PARTS.some((part) => searchable.includes(part));
}

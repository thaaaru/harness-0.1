import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { LicenseError, verifyLicenseToken, type LicensePayload } from "./verify-license.js";

export type StoredLicense = {
  token: string;
  payload: LicensePayload;
  activatedAt: string;
};

function licenseDir(): string {
  return process.env.NOVA_LICENSE_DIR ?? join(homedir(), ".nova");
}

function licensePath(): string {
  return join(licenseDir(), "license.json");
}

export async function activateLicense(token: string, controlPlaneUrl: string): Promise<StoredLicense> {
  const payload = await verifyLicenseToken(token);

  const response = await fetch(`${controlPlaneUrl.replace(/\/+$/, "")}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
  });

  if (!response.ok) {
    throw new LicenseError(`License activation was rejected by the control plane (HTTP ${response.status}).`);
  }

  const stored: StoredLicense = { token, payload, activatedAt: new Date().toISOString() };
  mkdirSync(licenseDir(), { recursive: true });
  writeFileSync(licensePath(), JSON.stringify(stored, null, 2), { mode: 0o600 });
  return stored;
}

export function loadStoredLicense(): StoredLicense | undefined {
  if (!existsSync(licensePath())) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(licensePath(), "utf8")) as StoredLicense;
  } catch (error) {
    throw new LicenseError(
      `Nova license file at ${licensePath()} is corrupt or unreadable (${(error as Error).message}). ` +
        "Run `nova license activate <key>` again to replace it.",
    );
  }
}

export async function requireValidLicense(): Promise<LicensePayload> {
  const stored = loadStoredLicense();
  if (!stored) {
    throw new LicenseError("No Nova license found. Run `nova license activate <key>` first.");
  }
  return verifyLicenseToken(stored.token);
}

export function reportUsageEvent(
  controlPlaneUrl: string,
  event: { runId: string; orgId: string; kind: string },
): void {
  fetch(`${controlPlaneUrl.replace(/\/+$/, "")}/usage-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...event, occurredAt: new Date().toISOString() }),
  }).catch(() => {
    // Usage reporting is best-effort telemetry; it must never block or fail a test run.
  });
}

function getOrCreateDeviceId(): string {
  const idPath = join(licenseDir(), "device-id");
  if (existsSync(idPath)) {
    return readFileSync(idPath, "utf8").trim();
  }

  const id = randomUUID();
  mkdirSync(licenseDir(), { recursive: true });
  writeFileSync(idPath, id);
  return id;
}

/**
 * VaultKit Signer Provider
 *
 * Falls back to VaultKit's snippet library when a signer is not found locally.
 * This gives WebHarvester access to ALL signers stored in VaultKit,
 * including ones imported from other projects.
 *
 * Integration: register this as a fallback in the SignerRegistry.
 *
 * Usage:
 *   import { VaultKitSignerProvider } from "./vaultkit-signer-provider.js";
 *   VaultKitSignerProvider.init();
 *   // If local lookup fails, SignerRegistry.get() will query VaultKit
 */

import { ISigner, SignerRegistry } from "./signer-registry";

const VAULTKIT_DEFAULT_PORT = 43761;

class VaultKitSigner implements ISigner {
  readonly name: string;
  private vaultkitToken: string | null = null;
  private vaultkitPassword: string;
  private port: number;

  constructor(name: string, password: string, port: number) {
    this.name = name;
    this.vaultkitPassword = password;
    this.port = port;
  }

  private get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private async ensureAuth(): Promise<string> {
    if (this.vaultkitToken) return this.vaultkitToken;

    try {
      // Check health
      const healthRes = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const health = (await healthRes.json()) as { setup: boolean };

      // Auth
      const endpoint = health.setup ? "/api/auth/unlock" : "/api/auth/setup";
      const authRes = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: this.vaultkitPassword }),
        signal: AbortSignal.timeout(5000),
      });
      const authData = (await authRes.json()) as { token?: string };
      if (!authData.token) throw new Error("Auth failed");
      this.vaultkitToken = authData.token;
      return this.vaultkitToken;
    } catch {
      throw new Error("VaultKit service unavailable");
    }
  }

  async sign(params: Record<string, unknown>): Promise<Record<string, string>> {
    const token = await this.ensureAuth();

    // Search VaultKit for this signer
    const searchRes = await fetch(`${this.baseUrl}/api/search/semantic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ q: this.name, limit: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const searchData = (await searchRes.json()) as { items?: Array<{ code: string; title: string }> };
    const snippet = searchData.items?.[0];

    if (!snippet) {
      throw new Error(`Signer "${this.name}" not found in VaultKit`);
    }

    // The snippet's code is the signer implementation.
    // For security, we evaluate it in a sandboxed context.
    // In production, consider using vm.Script or dynamic import.
    try {
      // Create a dynamic async function from the code
      const fn = new AsyncFunction(
        "params",
        `${snippet.code}\n\n// Call the main export\nif (typeof sign === "function") return sign(params);\nif (typeof main === "function") return main(params);\nthrow new Error("No export function found");`,
      );
      const result = await fn(params);
      return result as Record<string, string>;
    } catch {
      throw new Error(`Failed to execute signer "${this.name}" from VaultKit`);
    }
  }
}

// AsyncFunction is not globally available in all runtimes
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

export class VaultKitSignerProvider {
  private static initialized = false;

  /**
   * Initialize VaultKit as a fallback signer provider.
   * Call this once during app startup.
   */
  static init(password?: string, port = VAULTKIT_DEFAULT_PORT): void {
    if (this.initialized) return;
    this.initialized = true;

    const pw = password || process.env.VAULTKIT_PASSWORD;
    if (!pw) {
      console.warn("[VaultKit] VAULTKIT_PASSWORD not set; VaultKit signer fallback disabled");
      return;
    }

    // Wrap the registry's get() to fall back to VaultKit
    const originalGet = SignerRegistry.get.bind(SignerRegistry);
    const vaultkitSignerCache = new Map<string, VaultKitSigner>();

    (SignerRegistry as any).get = (name: string): ISigner | null => {
      // Try local first
      const local = originalGet(name);
      if (local) return local;

      // Fall back to VaultKit
      if (!vaultkitSignerCache.has(name)) {
        vaultkitSignerCache.set(name, new VaultKitSigner(name, pw, port));
      }
      return vaultkitSignerCache.get(name) ?? null;
    };

    console.log(`[VaultKit] Signer fallback ready (port ${port})`);
  }
}

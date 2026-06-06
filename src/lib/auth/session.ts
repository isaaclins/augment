// In-memory session. Holds the access token (and derived expiry) for the life
// of the window only — nothing is persisted. The GmailClient reads the token
// through `getToken`, and refreshes through `refresh` on a 401.

import type { OauthResult } from "./commands";

export class Session {
  private accessToken: string | null = null;
  private expiresAtMs = 0;
  private email: string | null = null;

  setTokens(result: OauthResult): void {
    this.accessToken = result.accessToken;
    this.expiresAtMs = Date.now() + result.expiresIn * 1000;
  }

  setEmail(email: string): void {
    this.email = email;
  }

  getEmail(): string | null {
    return this.email;
  }

  hasToken(): boolean {
    return this.accessToken !== null;
  }

  getToken(): string {
    if (this.accessToken === null) {
      throw new Error("Not authenticated — sign in first.");
    }
    return this.accessToken;
  }

  /** True within 60s of expiry, so callers can refresh proactively. */
  isExpiringSoon(): boolean {
    return Date.now() >= this.expiresAtMs - 60_000;
  }

  clear(): void {
    this.accessToken = null;
    this.expiresAtMs = 0;
    this.email = null;
  }
}

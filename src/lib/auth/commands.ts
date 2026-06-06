// Bridge to the Rust OAuth commands. The access token is the only secret that
// crosses into the frontend; the refresh token stays in Rust (kept in the OS
// keychain across launches), reachable only through these commands.

import { invoke } from "@tauri-apps/api/core";

export interface OauthResult {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  scope: string;
}

/** Run the interactive loopback + PKCE sign-in. Opens the system browser. */
export function startOAuth(): Promise<OauthResult> {
  return invoke<OauthResult>("start_oauth");
}

/** Abort an in-progress sign-in (the `startOAuth` promise then rejects). */
export function cancelOAuth(): Promise<void> {
  return invoke<void>("cancel_oauth");
}

/** Silently mint a new access token from the stored/in-memory refresh token. */
export function refreshAccessToken(): Promise<OauthResult> {
  return invoke<OauthResult>("refresh_access_token");
}

/** Drop the in-memory refresh token and erase the one saved in the OS keychain. */
export function clearStoredSession(): Promise<void> {
  return invoke<void>("clear_session");
}

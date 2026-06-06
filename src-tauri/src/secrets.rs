//! Secure, persistent storage for the single secret we keep across launches:
//! the Google OAuth refresh token. It lives in the OS-native credential store
//! (macOS Keychain, Windows Credential Manager) via the `keyring` crate — never
//! in plaintext on disk. The access token is short-lived and stays in memory;
//! the client id/secret come from `.env`, so the refresh token is all we persist.

use keyring::{Entry, Error as KeyringError};

use crate::error::{AppError, AppResult};

/// Keychain service name (the app's bundle identifier) and account label.
const SERVICE: &str = "com.isaaclins.augment";
const ACCOUNT: &str = "google-oauth-refresh-token";

fn entry() -> AppResult<Entry> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| AppError::Keychain(e.to_string()))
}

/// Persist (or overwrite) the refresh token in the OS keychain.
pub fn store_refresh_token(token: &str) -> AppResult<()> {
    entry()?
        .set_password(token)
        .map_err(|e| AppError::Keychain(e.to_string()))
}

/// Read the stored refresh token, if any. A missing entry (or any keychain
/// error) is reported as `None` so startup can fall back to interactive login.
pub fn load_refresh_token() -> Option<String> {
    match entry().ok()?.get_password() {
        Ok(token) => Some(token),
        Err(_) => None,
    }
}

/// Remove the stored refresh token. A missing entry is treated as success.
pub fn clear_refresh_token() -> AppResult<()> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

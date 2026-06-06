//! Augment — Tauri backend.
//!
//! Rust's responsibilities are deliberately narrow: OAuth "secure glue", the
//! background scheduler, and native notifications. All Gmail data access lives
//! in the TypeScript layer. See `oauth.rs` and `scheduler.rs`.

mod error;
mod oauth;
mod scheduler;
mod secrets;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{Manager, State};

use error::AppError;

/// Shared, app-wide state. The access token stays in the frontend's memory; the
/// refresh token is held here and mirrored to the OS keychain (see `secrets`) so
/// the session can be restored on the next launch.
pub struct AppState {
    pub http: reqwest::Client,
    pub refresh_token: Mutex<Option<String>>,
    pub creds: Mutex<Option<oauth::OauthCreds>>,
    pub schedule: Mutex<Vec<scheduler::ScheduleItem>>,
    pub store_path: PathBuf,
    /// Set by `cancel_oauth` to abort an in-progress interactive sign-in.
    pub oauth_cancel: Arc<AtomicBool>,
}

#[tauri::command]
async fn start_oauth(state: State<'_, AppState>) -> Result<oauth::OauthResult, AppError> {
    oauth::run_login(&state.http, &state.refresh_token, &state.creds, &state.oauth_cancel).await
}

/// Abort an in-progress interactive sign-in (the loopback wait in `oauth.rs`
/// polls this flag), so a stuck or abandoned flow can be dismissed immediately.
#[tauri::command]
fn cancel_oauth(state: State<'_, AppState>) {
    state.oauth_cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn refresh_access_token(state: State<'_, AppState>) -> Result<oauth::OauthResult, AppError> {
    oauth::run_refresh(&state.http, &state.refresh_token, &state.creds).await
}

/// Sign out: drop the in-memory refresh token and erase the persisted one so a
/// later launch starts signed out.
#[tauri::command]
fn clear_session(state: State<'_, AppState>) -> Result<(), AppError> {
    if let Ok(mut slot) = state.refresh_token.lock() {
        *slot = None;
    }
    secrets::clear_refresh_token()
}

/// Best-effort load of OAuth client credentials from `.env`. We check the
/// current directory and its parents (covers `tauri dev`), then the directory
/// next to the executable (covers a packaged app launched with a sibling .env).
fn load_env() {
    dotenvy::dotenv().ok();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dotenvy::from_path(dir.join(".env")).ok();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle();
            let store_path = scheduler::store_path(handle)?;
            let items = scheduler::load_items(&store_path).unwrap_or_default();

            let http = reqwest::Client::builder()
                .user_agent("Augment/0.1 (+https://github.com/isaaclins)")
                .timeout(Duration::from_secs(30))
                .build()?;

            // Restore a previous session: load the refresh token from the OS
            // keychain and the client credentials from `.env`. With both present,
            // the frontend can mint an access token on launch — no re-login.
            let stored_refresh = secrets::load_refresh_token();
            let creds = oauth::OauthCreds::from_env().ok();

            app.manage(AppState {
                http,
                refresh_token: Mutex::new(stored_refresh),
                creds: Mutex::new(creds),
                schedule: Mutex::new(items),
                store_path,
                oauth_cancel: Arc::new(AtomicBool::new(false)),
            });

            scheduler::spawn_ticker(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_oauth,
            cancel_oauth,
            refresh_access_token,
            clear_session,
            scheduler::schedule_list,
            scheduler::schedule_add,
            scheduler::schedule_remove,
            scheduler::notify,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Augment");
}

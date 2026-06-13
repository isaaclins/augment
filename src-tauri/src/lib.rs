//! Augment — Tauri backend.
//!
//! Rust's responsibilities are deliberately narrow: OAuth "secure glue", the
//! background scheduler, and native notifications. All Gmail data access lives
//! in the TypeScript layer. See `oauth.rs` and `scheduler.rs`.

mod error;
mod menu;
mod oauth;
mod ollama;
mod scheduler;
mod secrets;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};

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

/// Open (or focus) the dedicated Settings window — same effect as the app
/// menu's "Settings…" item, exposed so the in-app button can trigger it too.
#[tauri::command]
fn open_settings_window(app: AppHandle) {
    menu::open_settings(&app);
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
        .menu(|handle| menu::build(handle))
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                menu::SETTINGS_MENU_ID => menu::open_settings(app),
                menu::SHOW_MAIN_MENU_ID => menu::show_main(app),
                menu::QUIT_MENU_ID => app.exit(0),
                _ => {}
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
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

            menu::install_tray(handle)?;
            scheduler::spawn_ticker(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_oauth,
            cancel_oauth,
            refresh_access_token,
            clear_session,
            open_settings_window,
            scheduler::schedule_list,
            scheduler::schedule_add,
            scheduler::schedule_remove,
            scheduler::notify,
            ollama::ollama_triage,
            ollama::ollama_health,
            ollama::ollama_assist,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Augment")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                menu::show_main(app);
            }
        });
}

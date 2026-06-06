//! The background scheduler — Rust's job in Augment. It owns a small JSON store
//! of "schedule items" (snoozes and reply-watches), ticks on a timer, and emits
//! a `schedule-due` event the moment an item comes due. The frontend reacts to
//! that event by performing the Gmail-side work (resurfacing a thread, checking
//! for a reply) and then fires the native notification via the `notify` command.
//!
//! Keeping all Gmail logic in the TypeScript layer and all *timing + OS
//! notification* logic here gives us one source of truth per concern.

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::error::{AppError, AppResult};
use crate::AppState;

/// How often the scheduler wakes to look for due items. 15s keeps short demo
/// intervals snappy without busy-looping.
const TICK: Duration = Duration::from_secs(15);

/// One scheduled action. Persisted to `schedule.json` in the app data dir so it
/// survives relaunch (a snooze set before quitting still fires on next launch).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleItem {
    pub id: String,
    /// "snooze" or "watch".
    pub kind: String,
    pub thread_id: String,
    /// Human-readable label used in the notification body.
    pub subject: String,
    /// When the item comes due (epoch milliseconds).
    pub due_at: i64,
    /// When the item was created (epoch milliseconds).
    pub created_at: i64,
    /// For "watch": the moment watching began; a reply after this counts.
    #[serde(default)]
    pub watch_since: Option<i64>,
}

/// Payload sent from the frontend to create an item (id/createdAt assigned here).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewScheduleItem {
    pub kind: String,
    pub thread_id: String,
    pub subject: String,
    pub due_at: i64,
    #[serde(default)]
    pub watch_since: Option<i64>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn random_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Read the persisted items from disk (returns empty if the file is absent).
pub fn load_items(path: &PathBuf) -> AppResult<Vec<ScheduleItem>> {
    match std::fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| AppError::Store(format!("parse schedule.json: {e}")))
        }
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(AppError::Store(format!("read schedule.json: {e}"))),
    }
}

fn save_items(path: &PathBuf, items: &[ScheduleItem]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Store(format!("create app dir: {e}")))?;
    }
    let json = serde_json::to_vec_pretty(items)
        .map_err(|e| AppError::Store(format!("serialize schedule: {e}")))?;
    std::fs::write(path, json).map_err(|e| AppError::Store(format!("write schedule.json: {e}")))
}

/// Items that are due *now*. We deliberately re-emit due items on every tick
/// rather than dedup in Rust: the frontend removes an item (via `schedule_remove`)
/// as soon as it finishes handling it, so re-emits stop within one tick. This is
/// what makes overdue items from a *previous* session reliably fire once the
/// webview is up — even though the very first tick happens before sign-in.
pub fn drain_due(items: &[ScheduleItem], now: i64) -> Vec<ScheduleItem> {
    items.iter().filter(|item| item.due_at <= now).cloned().collect()
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn schedule_list(state: State<'_, AppState>) -> AppResult<Vec<ScheduleItem>> {
    let items = state.schedule.lock().map_err(|_| AppError::Internal("schedule lock poisoned".into()))?;
    Ok(items.clone())
}

#[tauri::command]
pub fn schedule_add(state: State<'_, AppState>, item: NewScheduleItem) -> AppResult<ScheduleItem> {
    let stored = ScheduleItem {
        id: random_id(),
        kind: item.kind,
        thread_id: item.thread_id,
        subject: item.subject,
        due_at: item.due_at,
        created_at: now_ms(),
        watch_since: item.watch_since,
    };
    let mut items = state.schedule.lock().map_err(|_| AppError::Internal("schedule lock poisoned".into()))?;
    items.push(stored.clone());
    save_items(&state.store_path, &items)?;
    Ok(stored)
}

#[tauri::command]
pub fn schedule_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let mut items = state.schedule.lock().map_err(|_| AppError::Internal("schedule lock poisoned".into()))?;
    items.retain(|it| it.id != id);
    save_items(&state.store_path, &items)
}

/// Fire a native OS notification. This is the only path notifications take, so
/// "native notification" always means a real macOS Notification Center banner.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> AppResult<()> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| AppError::Notification(e.to_string()))
}

// ---------------------------------------------------------------------------
// Background tick
// ---------------------------------------------------------------------------

/// Spawn the recurring scheduler tick on Tauri's async runtime. Each tick emits
/// any newly-due items to the frontend as `schedule-due`.
pub fn spawn_ticker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(TICK);
        loop {
            interval.tick().await;
            let state = app.state::<AppState>();
            let now = now_ms();

            let due = {
                let items = match state.schedule.lock() {
                    Ok(items) => items,
                    Err(_) => continue,
                };
                drain_due(&items, now)
            };

            for item in due {
                let _ = app.emit("schedule-due", &item);
            }
        }
    });
}

/// Compute the schedule store path inside the OS app-data directory.
pub fn store_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Store(format!("resolve app data dir: {e}")))?;
    Ok(dir.join("schedule.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, due_at: i64) -> ScheduleItem {
        ScheduleItem {
            id: id.to_string(),
            kind: "snooze".into(),
            thread_id: "t".into(),
            subject: "s".into(),
            due_at,
            created_at: 0,
            watch_since: None,
        }
    }

    #[test]
    fn drain_due_returns_only_past_due_items() {
        let items = vec![item("a", 100), item("b", 300), item("c", 50)];
        let due = drain_due(&items, 200);
        let ids: Vec<_> = due.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "c"]);
    }

    #[test]
    fn drain_due_re_emits_until_removed() {
        // Re-emitting each tick is intentional; the frontend dedups + removes.
        let items = vec![item("a", 100)];
        assert_eq!(drain_due(&items, 200).len(), 1);
        assert_eq!(drain_due(&items, 200).len(), 1);
    }

    #[test]
    fn drain_due_excludes_future_items() {
        let items = vec![item("a", 500)];
        assert!(drain_due(&items, 200).is_empty());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = std::env::temp_dir().join(format!("augment-test-{}", random_id()));
        let path = dir.join("schedule.json");
        let items = vec![item("a", 1), item("b", 2)];
        save_items(&path, &items).unwrap();
        let loaded = load_items(&path).unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "a");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn load_missing_file_is_empty() {
        let path = std::env::temp_dir().join("augment-does-not-exist-xyz.json");
        assert!(load_items(&path).unwrap().is_empty());
    }
}

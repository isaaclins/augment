//! Local LLM email triage via Ollama.
//!
//! The webview's CSP blocks it from reaching `http://localhost:11434`, and an
//! LLM call shouldn't run on the UI thread anyway — so the request goes through
//! Rust's shared async HTTP client (a Tauri command runs on the tokio runtime,
//! off the webview). We ask Ollama for *structured* output by passing a JSON
//! schema as `format`, so the reply is always parseable. Nothing leaves the
//! machine: it's a localhost call to the user's own model.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::AppState;

const DEFAULT_ENDPOINT: &str = "http://localhost:11434";

/// One email to classify, plus the model + a list of suggested labels to prefer.
/// The taxonomy is open and lives in the frontend; Rust stays policy-free.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageInput {
    pub from: String,
    pub subject: String,
    pub snippet: String,
    pub model: String,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub suggestions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageOutput {
    pub category: String,
    pub priority: String,
    pub summary: String,
}

// Just the slice of Ollama's /api/chat response we read.
#[derive(Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

// The structured JSON the model is constrained to emit (matches our schema).
#[derive(Deserialize)]
struct TriageJson {
    category: String,
    priority: String,
    summary: String,
}

/// Normalize a user-supplied endpoint (trim, drop trailing slash, fall back to
/// the Ollama default).
fn endpoint_of(endpoint: &Option<String>) -> String {
    endpoint
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_ENDPOINT)
        .trim_end_matches('/')
        .to_string()
}

/// Classify one email into a category + priority and summarize it in a sentence.
#[tauri::command]
pub async fn ollama_triage(
    state: State<'_, AppState>,
    input: TriageInput,
) -> Result<TriageOutput, AppError> {
    let endpoint = endpoint_of(&input.endpoint);
    let url = format!("{endpoint}/api/chat");

    let schema = json!({
        "type": "object",
        "properties": {
            "category": { "type": "string" },
            "priority": { "type": "string", "enum": ["low", "normal", "high"] },
            "summary": { "type": "string" }
        },
        "required": ["category", "priority", "summary"]
    });

    let system = "You are an email triage assistant. Assign ONE short topical label \
                  (1-2 words, Title Case) describing what the email is about. Strongly \
                  prefer reusing one of the suggested labels when one fits; only invent a \
                  new label when none fit. Judge the priority to the recipient (low, \
                  normal, or high) and write one concise sentence summarizing the email. \
                  Judge only from the fields given. Respond with JSON only.";

    let suggestions_line = if input.suggestions.is_empty() {
        String::new()
    } else {
        format!(
            "\nSuggested labels (reuse one if it fits): {}",
            input.suggestions.join(", ")
        )
    };

    let user = format!(
        "From: {}\nSubject: {}\nPreview: {}{}",
        input.from, input.subject, input.snippet, suggestions_line
    );

    let body = json!({
        "model": input.model,
        "stream": false,
        "format": schema,
        "options": { "temperature": 0 },
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });

    // A generous per-request timeout: the first call may have to load the model.
    let response = state
        .http
        .post(&url)
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Ollama(format!(
            "Ollama returned {status}: {}",
            text.chars().take(200).collect::<String>()
        )));
    }

    let chat: ChatResponse = response.json().await?;
    let parsed: TriageJson = serde_json::from_str(chat.message.content.trim())
        .map_err(|err| AppError::Ollama(format!("could not parse model output: {err}")))?;

    Ok(TriageOutput {
        category: parsed.category,
        priority: parsed.priority,
        summary: parsed.summary,
    })
}

/// One conversational turn passed back to the model as history.
#[derive(Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

/// A user request to the assistant, plus the serialized context (email list,
/// labels, folders, selection) the frontend assembled. The mode tunes how much
/// the model is allowed to do; the frontend also enforces it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistInput {
    pub model: String,
    #[serde(default)]
    pub endpoint: Option<String>,
    pub mode: String,
    pub message: String,
    #[serde(default)]
    pub history: Vec<ChatTurn>,
    #[serde(default)]
    pub context: String,
    /// Correlates the streamed `assist-stream` events with this call.
    #[serde(default)]
    pub stream_id: String,
}

#[derive(Serialize)]
pub struct AssistOutput {
    pub reply: String,
    pub actions: Vec<serde_json::Value>,
}

/// The assistant: turn a natural-language request (plus context) into a short
/// reply and a list of structured actions the frontend executes. Plan-then-
/// execute — one structured call, no tool-calling loop.
#[tauri::command]
pub async fn ollama_assist(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AssistInput,
) -> Result<AssistOutput, AppError> {
    let endpoint = endpoint_of(&input.endpoint);
    let url = format!("{endpoint}/api/chat");

    let action_schema = json!({
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": [
                    "createLabel", "applyLabel", "removeLabel", "archive", "snooze",
                    "markRead", "moveToFolder", "openThread", "setSort", "setFilter", "answer"
                ]
            },
            "label": { "type": "string" },
            "ids": { "type": "array", "items": { "type": "string" } },
            "folder": { "type": "string" },
            "sortKey": {
                "type": "string",
                "enum": ["date", "sender", "subject", "priority", "category", "unread"]
            },
            "sortDir": { "type": "string", "enum": ["asc", "desc"] },
            "query": { "type": "string" },
            "from": { "type": "string" },
            "unread": { "type": "boolean" },
            "snoozePreset": { "type": "string" },
            "filterTitle": { "type": "string" }
        },
        "required": ["type"]
    });

    let schema = json!({
        "type": "object",
        "properties": {
            "reply": { "type": "string" },
            "actions": { "type": "array", "items": action_schema }
        },
        "required": ["reply", "actions"]
    });

    // Ask mode gets a completely different, answer-only prompt: no action catalog
    // to role-play, and an explicit ban on claiming it changed anything. The other
    // modes get the action catalog.
    let system = if input.mode == "ask" {
        "You are Augment's email assistant. When the user asks about an email, you do TWO \
         things: (1) OPEN that email in the main view by returning an openThread action with \
         its id, and (2) give a short, direct TL;DR of its contents in \"reply\". NEVER tell \
         the user to open, read, or check the email themselves — you open it for them. \
         You are READ-ONLY for mail content: never label, move, archive, snooze, send, or \
         delete, and never claim to have done so.\n\
         Identify which email the user means from the list (by sender, subject, or topic) and \
         use its id. Summarize using the full email bodies provided below; if a body is not \
         included, summarize from its subject/snippet and still open it. You may also use \
         setSort to reorder or setFilter to narrow the list. Put your TL;DR answer in \
         \"reply\". Respond with JSON only."
            .to_string()
    } else {
        let mode_rules = "When the request implies changes, express them as actions. Only \
             use thread ids from the provided list. Prefer reusing existing labels and \
             folders. \"this email\"/\"this mail\" refers to the open email (marked > in the \
             list) or the current selection (marked *) — use that email's id. If an action \
             that targets emails omits \"ids\", the user's current selection is used. When \
             the user asks about a specific email, OPEN it with \
             openThread and give a short TL;DR in \"reply\" — never tell the user to open or \
             read it themselves. Never claim to have done something you did not return as an action.";
        format!(
            "You are Augment's email assistant, helping the user manage their Gmail. You are \
             given the current list of emails (each with an id), the full bodies of the \
             open/selected emails, the user's labels and folders, and which emails are \
             selected. Decide a brief reply and a list of actions that fulfil the request.\n\n\
             Action types:\n\
             - createLabel {{label, ids}} — create a new label and apply it.\n\
             - applyLabel {{label, ids}} — apply an existing label.\n\
             - removeLabel {{label, ids}} — remove a label.\n\
             - archive {{ids}} / markRead {{ids}} — archive or mark as read.\n\
             - snooze {{ids, snoozePreset}} — snooze (snoozePreset must be one of the listed names).\n\
             - moveToFolder {{folder, ids}} — file into a folder.\n\
             - openThread {{ids:[id]}} — open an email in the main reading view.\n\
             - setSort {{sortKey, sortDir}} — reorder the list.\n\
             - setFilter {{query|label|from|unread, filterTitle}} — narrow the list.\n\
             - answer — no change; reply only.\n{}\nRespond with JSON only.",
            mode_rules
        )
    };

    let mut messages: Vec<serde_json::Value> =
        vec![json!({ "role": "system", "content": system })];
    for turn in &input.history {
        let role = if turn.role == "assistant" { "assistant" } else { "user" };
        messages.push(json!({ "role": role, "content": turn.content }));
    }
    messages.push(json!({
        "role": "user",
        "content": format!("{}\n\nRequest: {}", input.context, input.message)
    }));

    let body = json!({
        "model": input.model,
        "stream": true,
        "format": schema,
        "options": { "temperature": 0 },
        "messages": messages
    });

    let mut response = state
        .http
        .post(&url)
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Ollama(format!(
            "Ollama returned {status}: {}",
            text.chars().take(200).collect::<String>()
        )));
    }

    // Ollama streams NDJSON: one JSON object per line, each carrying a
    // `message.content` delta. Accumulate the content and emit the growing string
    // so the webview can render the reply token-by-token.
    fn delta_of(line: &str) -> Option<String> {
        serde_json::from_str::<serde_json::Value>(line).ok().and_then(|value| {
            value
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .map(str::to_string)
        })
    }

    let mut buffer = String::new();
    let mut content = String::new();
    while let Some(chunk) = response.chunk().await? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(nl) = buffer.find('\n') {
            let line: String = buffer.drain(..=nl).collect();
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(delta) = delta_of(trimmed) {
                if !delta.is_empty() {
                    content.push_str(&delta);
                    let _ = app.emit(
                        "assist-stream",
                        json!({ "id": input.stream_id, "content": content }),
                    );
                }
            }
        }
    }
    let tail = buffer.trim();
    if !tail.is_empty() {
        if let Some(delta) = delta_of(tail) {
            content.push_str(&delta);
        }
    }

    let parsed: serde_json::Value = serde_json::from_str(content.trim())
        .map_err(|err| AppError::Ollama(format!("could not parse assistant output: {err}")))?;

    let reply = parsed
        .get("reply")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let actions = parsed
        .get("actions")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(AssistOutput { reply, actions })
}

/// Quick reachability probe for the "Test connection" button — true when the
/// Ollama daemon answers at `endpoint`.
#[tauri::command]
pub async fn ollama_health(
    state: State<'_, AppState>,
    endpoint: Option<String>,
) -> Result<bool, AppError> {
    let url = format!("{}/api/tags", endpoint_of(&endpoint));
    match state
        .http
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

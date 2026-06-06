use serde::{Serialize, Serializer};

/// A single error type for every Tauri command. It implements `Serialize` by
/// emitting its human-readable message, so the frontend always receives a
/// plain string it can surface to the user.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("missing environment variable {0} — set it in your .env (see .env.example)")]
    MissingEnv(&'static str),

    #[error("OAuth state mismatch — the login response did not match the request (possible CSRF); please try again")]
    StateMismatch,

    #[error("the login flow returned an error: {0}")]
    OauthDenied(String),

    #[error("timed out waiting for the Google sign-in to complete")]
    OauthTimeout,

    #[error("no active session to refresh — sign in first")]
    NoSession,

    #[error("the Google token endpoint returned {status}: {body}")]
    TokenEndpoint { status: u16, body: String },

    #[error("could not open the system browser: {0}")]
    Browser(String),

    #[error("local network error during sign-in: {0}")]
    Io(#[from] std::io::Error),

    #[error("network error talking to Google: {0}")]
    Http(#[from] reqwest::Error),

    #[error("could not persist app data: {0}")]
    Store(String),

    #[error("secure storage (keychain) error: {0}")]
    Keychain(String),

    #[error("notification failed: {0}")]
    Notification(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

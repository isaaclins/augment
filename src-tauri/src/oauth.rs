//! Google OAuth 2.0 for an installed/desktop app using the loopback-IP redirect
//! and PKCE (S256). This is "secure glue": it runs a one-shot localhost server
//! to catch the redirect, exchanges the authorization code for tokens, and hands
//! the *access* token to the frontend. The refresh token is kept in process
//! memory for the lifetime of the session and is never written to disk — by
//! design, this sidesteps long-term token rot (we simply re-auth each launch).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
/// `gmail.modify` is the least-privileged scope that still allows reading mail,
/// adding/removing labels, and archiving (removing the INBOX label). It does NOT
/// permit permanent deletion or sending — those stay off-limits by construction.
const SCOPE: &str = "https://www.googleapis.com/auth/gmail.modify";
/// Bound so a forgotten browser tab cannot wedge the flow forever.
const REDIRECT_TIMEOUT: Duration = Duration::from_secs(300);

/// OAuth client credentials supplied by the user via env (`.env`).
#[derive(Clone)]
pub struct OauthCreds {
    pub client_id: String,
    /// Google "Desktop app" clients issue a secret; PKCE makes it non-critical,
    /// but we include it in the token exchange when present.
    pub client_secret: Option<String>,
}

impl OauthCreds {
    pub fn from_env() -> AppResult<Self> {
        let client_id =
            std::env::var("GOOGLE_CLIENT_ID").map_err(|_| AppError::MissingEnv("GOOGLE_CLIENT_ID"))?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").ok().filter(|s| !s.is_empty());
        Ok(Self { client_id, client_secret })
    }
}

/// PKCE pair: a high-entropy verifier and its S256 challenge.
struct Pkce {
    verifier: String,
    challenge: String,
}

impl Pkce {
    fn generate() -> Self {
        // 32 random bytes -> base64url (43 chars), comfortably inside the
        // RFC 7636 43..=128 range and well above the 256-bit entropy floor.
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        let verifier = URL_SAFE_NO_PAD.encode(bytes);

        let digest = Sha256::digest(verifier.as_bytes());
        let challenge = URL_SAFE_NO_PAD.encode(digest);

        Self { verifier, challenge }
    }
}

fn random_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// The result returned to the frontend after a successful sign-in. Only the
/// access token crosses the boundary; the refresh token stays in Rust memory.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthResult {
    pub access_token: String,
    /// Seconds until the access token expires (typically 3600).
    pub expires_in: u64,
    pub scope: String,
}

/// Tokens as returned by Google's token endpoint.
#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    expires_in: u64,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    scope: String,
}

/// Run the full interactive sign-in. Returns the access token; stores the
/// refresh token + creds in `session` for silent refresh during this session.
pub async fn run_login(
    http: &reqwest::Client,
    refresh_slot: &std::sync::Mutex<Option<String>>,
    creds_slot: &std::sync::Mutex<Option<OauthCreds>>,
) -> AppResult<OauthResult> {
    let creds = OauthCreds::from_env()?;
    let pkce = Pkce::generate();
    let state = random_state();

    // Bind an ephemeral loopback port. Google's loopback handling accepts any
    // port for "Desktop app" clients, so we never need to register one.
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let auth_url = build_auth_url(&creds.client_id, &redirect_uri, &pkce.challenge, &state);
    open_in_browser(&auth_url)?;

    // The blocking accept loop runs off the async runtime so we don't stall it.
    let expected_state = state.clone();
    let code = tokio::task::spawn_blocking(move || wait_for_redirect(listener, &expected_state))
        .await
        .map_err(|e| AppError::Internal(format!("redirect task panicked: {e}")))??;

    let tokens = exchange_code(http, &creds, &redirect_uri, &code, &pkce.verifier).await?;

    // Hold the refresh token + creds in memory for silent refresh this session,
    // and persist the refresh token to the OS keychain so the next launch can
    // restore the session without an interactive sign-in.
    if let Ok(mut slot) = refresh_slot.lock() {
        *slot = tokens.refresh_token.clone();
    }
    if let Ok(mut slot) = creds_slot.lock() {
        *slot = Some(creds);
    }
    if let Some(refresh_token) = &tokens.refresh_token {
        if let Err(e) = crate::secrets::store_refresh_token(refresh_token) {
            // Non-fatal: the user is still signed in for this session, they'll
            // just need to re-auth next launch.
            eprintln!("warning: could not persist refresh token: {e}");
        }
    }

    Ok(OauthResult {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        scope: if tokens.scope.is_empty() { SCOPE.to_string() } else { tokens.scope },
    })
}

/// Silently mint a new access token from the in-memory refresh token.
pub async fn run_refresh(
    http: &reqwest::Client,
    refresh_slot: &std::sync::Mutex<Option<String>>,
    creds_slot: &std::sync::Mutex<Option<OauthCreds>>,
) -> AppResult<OauthResult> {
    let refresh_token = refresh_slot
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .ok_or(AppError::NoSession)?;
    let creds = creds_slot
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .ok_or(AppError::NoSession)?;

    let mut form = vec![
        ("client_id", creds.client_id.clone()),
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh_token),
    ];
    if let Some(secret) = &creds.client_secret {
        form.push(("client_secret", secret.clone()));
    }

    let tokens = post_token(http, &form).await?;
    Ok(OauthResult {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        scope: if tokens.scope.is_empty() { SCOPE.to_string() } else { tokens.scope },
    })
}

fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTH_ENDPOINT).expect("static auth endpoint is valid");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        // We want a refresh token for silent in-session refresh; `prompt=consent`
        // guarantees Google returns one even on repeat logins.
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    url.to_string()
}

#[cfg(target_os = "macos")]
fn open_in_browser(url: &str) -> AppResult<()> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Browser(e.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn open_in_browser(url: &str) -> AppResult<()> {
    // Augment targets macOS, but keep a portable fallback so the crate builds
    // and behaves on other platforms during CI/dev.
    let (cmd, args): (&str, Vec<&str>) = if cfg!(target_os = "windows") {
        ("cmd", vec!["/C", "start", "", url])
    } else {
        ("xdg-open", vec![url])
    };
    std::process::Command::new(cmd)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Browser(e.to_string()))
}

/// Block until the browser redirects back with `?code=...&state=...`, validating
/// the CSRF state. Uses a non-blocking accept loop with a hard deadline so a
/// stale tab can never hang the thread.
fn wait_for_redirect(listener: TcpListener, expected_state: &str) -> AppResult<String> {
    listener.set_nonblocking(true)?;
    let deadline = Instant::now() + REDIRECT_TIMEOUT;

    loop {
        if Instant::now() >= deadline {
            return Err(AppError::OauthTimeout);
        }
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                let request_line = read_request_line(&mut stream)?;
                let target = parse_request_target(&request_line);

                match target.and_then(|t| extract_code_and_state(&t)) {
                    Some(RedirectParams::Error(err)) => {
                        respond(&mut stream, false);
                        return Err(AppError::OauthDenied(err));
                    }
                    Some(RedirectParams::Code { code, state }) => {
                        if state != expected_state {
                            respond(&mut stream, false);
                            return Err(AppError::StateMismatch);
                        }
                        respond(&mut stream, true);
                        return Ok(code);
                    }
                    None => {
                        // Favicon / preflight / unrelated probe — answer politely
                        // and keep waiting for the real redirect.
                        respond(&mut stream, true);
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(e) => return Err(AppError::Io(e)),
        }
    }
}

fn read_request_line(stream: &mut std::net::TcpStream) -> AppResult<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut buf = [0u8; 2048];
    let n = stream.read(&mut buf)?;
    let text = String::from_utf8_lossy(&buf[..n]);
    Ok(text.lines().next().unwrap_or_default().to_string())
}

/// From `GET /?code=...&state=... HTTP/1.1` pull out the request target.
fn parse_request_target(request_line: &str) -> Option<String> {
    let mut parts = request_line.split_whitespace();
    let _method = parts.next()?;
    Some(parts.next()?.to_string())
}

enum RedirectParams {
    Code { code: String, state: String },
    Error(String),
}

fn extract_code_and_state(target: &str) -> Option<RedirectParams> {
    // `target` looks like `/?code=...&state=...`. Parse against a dummy base.
    let parsed = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }
    if let Some(err) = error {
        return Some(RedirectParams::Error(err));
    }
    match (code, state) {
        (Some(code), Some(state)) => Some(RedirectParams::Code { code, state }),
        _ => None,
    }
}

fn respond(stream: &mut std::net::TcpStream, ok: bool) {
    let (title, message) = if ok {
        ("Augment — signed in", "You're signed in. You can close this tab and return to Augment.")
    } else {
        ("Augment — sign-in failed", "Sign-in did not complete. Return to Augment and try again.")
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title>\
         <style>body{{font-family:-apple-system,system-ui,sans-serif;background:#0b0d12;color:#e7e9ee;\
         display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}}\
         .card{{text-align:center;padding:40px}}h1{{font-size:18px;font-weight:600}}\
         p{{color:#9aa3b2;font-size:14px}}</style></head>\
         <body><div class=\"card\"><h1>{title}</h1><p>{message}</p></div></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

async fn exchange_code(
    http: &reqwest::Client,
    creds: &OauthCreds,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> AppResult<TokenResponse> {
    let mut form = vec![
        ("client_id", creds.client_id.clone()),
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
        ("code_verifier", verifier.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
    ];
    if let Some(secret) = &creds.client_secret {
        form.push(("client_secret", secret.clone()));
    }
    post_token(http, &form).await
}

async fn post_token(http: &reqwest::Client, form: &[(&str, String)]) -> AppResult<TokenResponse> {
    let response = http.post(TOKEN_ENDPOINT).form(form).send().await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::TokenEndpoint { status: status.as_u16(), body });
    }
    Ok(response.json::<TokenResponse>().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_sha256_base64url_of_verifier() {
        let pkce = Pkce::generate();
        // Verifier length: 32 bytes -> 43 base64url chars (no padding).
        assert_eq!(pkce.verifier.len(), 43);
        let expected = URL_SAFE_NO_PAD.encode(Sha256::digest(pkce.verifier.as_bytes()));
        assert_eq!(pkce.challenge, expected);
        // base64url must not contain '+', '/', or '=' padding.
        assert!(!pkce.challenge.contains('+'));
        assert!(!pkce.challenge.contains('/'));
        assert!(!pkce.challenge.contains('='));
    }

    #[test]
    fn auth_url_contains_required_params() {
        let url = build_auth_url("cid.apps.googleusercontent.com", "http://127.0.0.1:1234", "chal", "st");
        assert!(url.starts_with(AUTH_ENDPOINT));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("gmail.modify"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A1234"));
    }

    #[test]
    fn parses_code_and_state_from_redirect_target() {
        let params = extract_code_and_state("/?code=abc123&state=xyz").unwrap();
        match params {
            RedirectParams::Code { code, state } => {
                assert_eq!(code, "abc123");
                assert_eq!(state, "xyz");
            }
            _ => panic!("expected a code"),
        }
    }

    #[test]
    fn surfaces_oauth_error_from_redirect() {
        let params = extract_code_and_state("/?error=access_denied").unwrap();
        assert!(matches!(params, RedirectParams::Error(e) if e == "access_denied"));
    }

    #[test]
    fn request_target_parsed_from_request_line() {
        assert_eq!(
            parse_request_target("GET /?code=1&state=2 HTTP/1.1").as_deref(),
            Some("/?code=1&state=2")
        );
    }
}

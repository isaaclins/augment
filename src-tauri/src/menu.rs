//! Native application menu (macOS menu bar) + the dedicated Settings window.
//!
//! The app menu carries a "Settings…" item bound to ⌘, — being a real native
//! menu item, it's discoverable through macOS's Help menu search. Choosing it
//! (or pressing the accelerator) opens a separate `settings` webview window that
//! loads the same bundle with `?view=settings`, which the frontend renders as a
//! standalone settings UI. The Edit/Window submenus restore the native text
//! shortcuts (copy/paste/select-all, minimize, …) that a custom menu replaces.

use tauri::{
    menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};

/// Menu item id for the Settings command (matched in the menu-event handler).
pub const SETTINGS_MENU_ID: &str = "augment.settings";
/// Menu item id for showing the main window from the tray/menu bar.
pub const SHOW_MAIN_MENU_ID: &str = "augment.show-main";
/// Menu item id for a deliberate full app quit from the tray/menu bar.
pub const QUIT_MENU_ID: &str = "augment.quit";
/// Window label for the dedicated settings window.
pub const SETTINGS_WINDOW_LABEL: &str = "settings";

/// Build the application menu. The first submenu becomes the macOS app menu.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings_item = MenuItemBuilder::new("Settings…")
        .id(SETTINGS_MENU_ID)
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let about = AboutMetadataBuilder::new().name(Some("Augment")).build();

    #[allow(unused_mut)]
    let mut app_menu = SubmenuBuilder::new(app, "Augment")
        .about(Some(about))
        .separator()
        .item(&settings_item)
        .separator();
    #[cfg(target_os = "macos")]
    {
        app_menu = app_menu
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator();
    }
    let app_menu = app_menu.quit().build()?;

    // Restores the native editing shortcuts the OS menu would normally provide.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &edit_menu, &window_menu])
        .build()
}

/// Show the main window after it has been hidden to keep background schedules
/// alive. Used by the tray icon/menu and app activation events.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Install a small tray/menu-bar affordance so closing Augment can hide the
/// window while the process keeps running scheduled snooze/watch checks.
pub fn install_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItemBuilder::new("Show Augment")
        .id(SHOW_MAIN_MENU_ID)
        .build(app)?;
    let settings_item = MenuItemBuilder::new("Settings…")
        .id(SETTINGS_MENU_ID)
        .build(app)?;
    let quit_item = MenuItemBuilder::new("Quit Augment")
        .id(QUIT_MENU_ID)
        .build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .items(&[&show_item, &settings_item, &quit_item])
        .build()?;

    let mut tray = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("Augment")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app).map(|_| ())
}

/// Show the settings window, creating it on first use. Reused on subsequent
/// invocations so ⌘, just refocuses the existing window.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title("Settings")
    .inner_size(560.0, 620.0)
    .min_inner_size(460.0, 480.0)
    .resizable(true)
    .build();
}

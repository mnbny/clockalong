fn main() {
    // App credentials are embedded by option_env!; Finder launches need no environment.
    for name in [
        "CLOCKALONG_TELEGRAM_API_ID",
        "CLOCKALONG_TELEGRAM_API_HASH",
        "CLOCKALONG_LINEAR_CLIENT_ID",
        "CLOCKALONG_LINEAR_REDIRECT_URI",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    tauri_build::build()
}

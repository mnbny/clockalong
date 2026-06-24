pub const STORAGE_PATH: &str = "settings.json";

#[allow(dead_code)]
#[derive(Clone, Copy)]
pub enum StorageKey {
    ClockifyAuthConnected,
    LinearAuthConnected,
    Theme,
}

impl StorageKey {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ClockifyAuthConnected => "clockifyAuthConnected",
            Self::LinearAuthConnected => "linearAuthConnected",
            Self::Theme => "theme",
        }
    }
}

use crate::stronghold;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

const KEY: &str = "telegramGroup";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramGroup {
    version: u8,
    account_id: String,
    title: String,
    #[serde(flatten)]
    peer: GroupPeer,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum GroupPeer {
    Basic {
        id: String,
    },
    Supergroup {
        id: String,
        #[serde(rename = "accessHash")]
        access_hash: String,
        forum: bool,
    },
}

impl TelegramGroup {
    fn image_cache_key(&self) -> String {
        let (kind, id) = match &self.peer {
            GroupPeer::Basic { id } => ("basic", id),
            GroupPeer::Supergroup { id, .. } => ("supergroup", id),
        };
        format!("{}:{kind}:{id}", self.account_id)
    }

    fn valid(&self) -> bool {
        // Marked group IDs must stay within JavaScript's safe integer range.
        let valid_id = |id: &str| {
            id.parse::<u64>()
                .is_ok_and(|id| id > 0 && id <= 9_007_199_254_740_991 - 1_000_000_000_000)
        };
        self.version == 1
            && valid_id(&self.account_id)
            && !self.title.trim().is_empty()
            && match &self.peer {
                GroupPeer::Basic { id } => valid_id(id),
                GroupPeer::Supergroup {
                    id, access_hash, ..
                } => valid_id(id) && access_hash.parse::<i64>().is_ok_and(|hash| hash != 0),
            }
    }
}

#[tauri::command]
pub fn telegram_group_read<R: Runtime>(app: AppHandle<R>) -> Result<Option<TelegramGroup>, String> {
    stronghold::read_json(&app, KEY)
        .map_err(|_| "Could not read the saved Telegram group.".to_string())
}

#[tauri::command]
pub fn telegram_group_save<R: Runtime>(
    app: AppHandle<R>,
    group: TelegramGroup,
) -> Result<(), String> {
    if !group.valid() {
        return Err("Invalid Telegram group.".to_string());
    }
    stronghold::write_json(&app, KEY, &group)
        .map_err(|_| "Could not save the Telegram group.".to_string())?;
    // An unavailable disk cache must not prevent group connection or image downloads.
    let _ = crate::telegram_image_cache::select(&app, group.image_cache_key());
    Ok(())
}

pub fn remove<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    crate::telegram_image_cache::clear(app)?;
    stronghold::remove_value(app, KEY)
        .map_err(|_| "Could not remove the saved Telegram group.".to_string())
}

#[tauri::command]
pub fn telegram_group_remove<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    remove(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_private_group_records() {
        let make = |hash: &str| TelegramGroup {
            version: 1,
            account_id: "1".into(),
            title: "Team".into(),
            peer: GroupPeer::Supergroup {
                id: "123".into(),
                access_hash: hash.into(),
                forum: true,
            },
        };
        assert!(make("-9223372036854775808").valid());
        assert!(make("9223372036854775807").valid());
        assert!(!make("9223372036854775808").valid());
        assert!(!make("0").valid());
        let mut basic = make("1");
        basic.peer = GroupPeer::Basic { id: "123".into() };
        assert!(basic.valid());
        basic.version = 2;
        assert!(!basic.valid());
    }
}

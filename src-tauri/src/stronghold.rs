use serde::{de::DeserializeOwned, Serialize};
use std::{collections::BTreeMap, fs, sync::Mutex};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_stronghold::{kdf::KeyDerivation, stronghold::Stronghold};

use crate::{
    auth::to_error_message,
    stronghold_config::{
        STRONGHOLD_CLIENT_NAME, STRONGHOLD_METADATA_KEY, STRONGHOLD_PASSWORD, STRONGHOLD_PATH,
        STRONGHOLD_SALT_FILE,
    },
};

#[derive(Default)]
pub struct ClockalongStrongholdState {
    lock: Mutex<()>,
}

pub fn write_string<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<(), String> {
    write_json(app, key, &value)
}

pub fn read_string<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<Option<String>, String> {
    read_json(app, key)
}

pub fn write_json<R: Runtime, T: Serialize>(
    app: &AppHandle<R>,
    key: &str,
    value: &T,
) -> Result<(), String> {
    with_client(app, true, |client| {
        stronghold_log(&format!("write_json: writing key={key}"));
        let value = serde_json::to_vec(value).map_err(to_error_message)?;
        client
            .store()
            .insert(key.as_bytes().to_vec(), value, None)
            .map(|_| ())
            .map_err(to_error_message)?;
        add_metadata_key(client, key)
    })
}

pub fn read_json<R: Runtime, T: DeserializeOwned>(
    app: &AppHandle<R>,
    key: &str,
) -> Result<Option<T>, String> {
    with_client(app, false, |client| {
        let Some(value) = client
            .store()
            .get(key.as_bytes())
            .map_err(to_error_message)?
        else {
            stronghold_log(&format!("read_json: key={key} present=false"));
            return Ok(None);
        };

        stronghold_log(&format!("read_json: key={key} present=true"));
        serde_json::from_slice::<T>(&value)
            .map(Some)
            .map_err(to_error_message)
    })
}

pub fn remove_value<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<(), String> {
    with_client(app, true, |client| {
        stronghold_log(&format!("remove_value: deleting key={key}"));
        client
            .store()
            .delete(key.as_bytes())
            .map(|_| ())
            .map_err(to_error_message)?;
        remove_metadata_key(client, key)
    })
}

fn with_client<R: Runtime, T>(
    app: &AppHandle<R>,
    save: bool,
    operation: impl FnOnce(&iota_stronghold::Client) -> Result<T, String>,
) -> Result<T, String> {
    let state = app.state::<ClockalongStrongholdState>();
    let _guard = state
        .lock
        .lock()
        .map_err(|_| "Failed to lock Clockalong Stronghold access".to_string())?;

    stronghold_log(&format!(
        "with_client: opening locked stronghold session save={save}"
    ));
    let stronghold = open_stronghold(app)?;
    let client = load_or_create_stronghold_client(&stronghold)?;
    let result = operation(&client)?;

    if save {
        stronghold_log("with_client: saving stronghold snapshot");
        stronghold.save().map_err(to_error_message)?;
    }

    Ok(result)
}

fn open_stronghold<R: Runtime>(app: &AppHandle<R>) -> Result<Stronghold, String> {
    stronghold_log("open_stronghold: opening snapshot");
    let app_data_dir = app.path().app_data_dir().map_err(to_error_message)?;
    let app_local_data_dir = app.path().app_local_data_dir().map_err(to_error_message)?;
    fs::create_dir_all(&app_data_dir).map_err(to_error_message)?;
    fs::create_dir_all(&app_local_data_dir).map_err(to_error_message)?;

    let snapshot_path = app_data_dir.join(STRONGHOLD_PATH);
    let salt_path = app_local_data_dir.join(STRONGHOLD_SALT_FILE);
    let password = KeyDerivation::argon2(STRONGHOLD_PASSWORD, &salt_path);

    Stronghold::new(snapshot_path, password).map_err(to_error_message)
}

fn load_or_create_stronghold_client(
    stronghold: &Stronghold,
) -> Result<iota_stronghold::Client, String> {
    match stronghold.load_client(STRONGHOLD_CLIENT_NAME) {
        Ok(client) => {
            stronghold_log("load_or_create_stronghold_client: loaded existing client");
            Ok(client)
        }
        Err(error) => {
            stronghold_log(&format!(
                "load_or_create_stronghold_client: load failed, creating client: {error}"
            ));
            stronghold
                .create_client(STRONGHOLD_CLIENT_NAME)
                .map_err(to_error_message)
        }
    }
}

fn add_metadata_key(client: &iota_stronghold::Client, key: &str) -> Result<(), String> {
    let mut metadata = read_metadata(client)?;
    metadata.insert(key.to_string(), 1);
    write_metadata(client, metadata)
}

fn remove_metadata_key(client: &iota_stronghold::Client, key: &str) -> Result<(), String> {
    let mut metadata = read_metadata(client)?;
    metadata.remove(key);
    write_metadata(client, metadata)
}

fn read_metadata(client: &iota_stronghold::Client) -> Result<BTreeMap<String, u8>, String> {
    let Some(value) = client
        .store()
        .get(STRONGHOLD_METADATA_KEY.as_bytes())
        .map_err(to_error_message)?
    else {
        return Ok(BTreeMap::new());
    };

    serde_json::from_slice::<BTreeMap<String, u8>>(&value).map_err(to_error_message)
}

fn write_metadata(
    client: &iota_stronghold::Client,
    metadata: BTreeMap<String, u8>,
) -> Result<(), String> {
    stronghold_log("write_metadata: writing metadata");
    let value = serde_json::to_vec(&metadata).map_err(to_error_message)?;

    client
        .store()
        .insert(STRONGHOLD_METADATA_KEY.as_bytes().to_vec(), value, None)
        .map(|_| ())
        .map_err(to_error_message)
}

fn stronghold_log(message: &str) {
    log::info!("stronghold: {message}");
}

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tauri_plugin_store::StoreExt;
use tokio::{io::AsyncReadExt, process::Command};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoStatus {
    available: bool,
    detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoCommandResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_id: Option<String>,
}

fn executable() -> Option<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        paths.push(home.join(".local/bin/paseo"));
        paths.push(home.join("Applications/Paseo.app/Contents/Resources/bin/paseo"));
    }
    paths.push(PathBuf::from(
        "/Applications/Paseo.app/Contents/Resources/bin/paseo",
    ));
    if let Some(path) = std::env::var_os("PATH") {
        paths.extend(
            std::env::split_paths(&path)
                .map(|path| path.join(if cfg!(windows) { "paseo.cmd" } else { "paseo" })),
        );
    }
    paths.into_iter().find(|path| path.is_file())
}

fn process(path: &PathBuf) -> Command {
    let mut command = Command::new(path);
    command
        .env_remove("PASEO_AGENT_ID")
        .env_remove("PASEO_WORKSPACE_ID")
        .env_remove("PASEO_HOST")
        .env_remove("PASEO_HOME")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command
}

fn command(path: &PathBuf, args: &[String]) -> Command {
    let mut command = process(path);
    if let Some(home) = std::env::var_os("HOME") {
        command
            .arg("--home")
            .arg(PathBuf::from(home).join(".paseo"));
    }
    command.args(args);
    command
}

async fn read_output(reader: impl tokio::io::AsyncRead + Unpin) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take(65_537).read_to_end(&mut bytes).await?;
    if bytes.len() > 65_536 {
        return Err(std::io::Error::other("Paseo output exceeded the limit"));
    }
    Ok(bytes)
}

// A failed response after spawn cannot establish whether the daemon accepted the command.
async fn run_process(
    mut command: Command,
    timeout: Duration,
) -> Result<std::process::Output, bool> {
    let mut child = command.spawn().map_err(|_| false)?;
    let stdout = child.stdout.take().ok_or(true)?;
    let stderr = child.stderr.take().ok_or(true)?;
    let result = tokio::time::timeout(timeout, async {
        tokio::try_join!(child.wait(), read_output(stdout), read_output(stderr))
    })
    .await;
    match result {
        Ok(Ok((status, stdout, stderr))) => Ok(std::process::Output {
            status,
            stdout,
            stderr,
        }),
        _ => {
            let _ = child.kill().await;
            Err(true)
        }
    }
}

#[tauri::command]
pub async fn paseo_detect() -> PaseoStatus {
    let Some(path) = executable() else {
        return PaseoStatus {
            available: false,
            path: None,
            detail: "Install Paseo to use Telegram triggers.".into(),
        };
    };
    let args = vec!["status".into(), "--json".into()];
    let reachable = match run_process(command(&path, &args), Duration::from_secs(10)).await {
        Ok(output) if output.status.success() => {
            serde_json::from_slice::<serde_json::Value>(&output.stdout)
                .ok()
                .is_some_and(|value| value["connectedDaemon"] == "reachable")
        }
        _ => false,
    };
    PaseoStatus {
        available: reachable,
        path: Some(path.to_string_lossy().into()),
        detail: if reachable {
            "Paseo is ready. Enabled triggers can run automatically."
        } else {
            "Paseo is installed but unavailable. Open Paseo, then check again."
        }
        .into(),
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoProject {
    project_id: String,
    name: String,
    kind: String,
    path: String,
}

#[derive(Deserialize, Serialize)]
pub struct PaseoMode {
    id: String,
    label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoProvider {
    id: String,
    label: String,
    default_mode_id: Option<String>,
    modes: Vec<PaseoMode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaseoRuntime {
    home: PathBuf,
    daemon_node: PathBuf,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoModel {
    id: String,
    #[serde(rename(deserialize = "model", serialize = "label"))]
    label: String,
    #[serde(default)]
    thinking_option_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default_thinking_option_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseoLaunch {
    project_id: String,
    provider: String,
    model: String,
    thinking: String,
    #[serde(default)]
    mode: String,
    prompt: String,
    title: String,
    run_id: String,
    trigger_id: String,
    revision: String,
    scope: String,
}

async fn read_cli<T: DeserializeOwned>(args: Vec<String>) -> Result<T, String> {
    let path = executable().ok_or("Paseo is not installed.")?;
    let output = run_process(command(&path, &args), Duration::from_secs(30))
        .await
        .map_err(|_| "Could not read Paseo configuration. Open Paseo and try again.")?;
    if !output.status.success() {
        return Err(
            "Paseo could not return its configuration. Check the connection and try again.".into(),
        );
    }
    serde_json::from_slice(&output.stdout).map_err(|_| {
        "Paseo returned an unsupported configuration format. Update Paseo and try again.".into()
    })
}

#[tauri::command]
pub async fn paseo_projects() -> Result<Vec<PaseoProject>, String> {
    let projects =
        read_cli::<Vec<PaseoProject>>(vec!["project".into(), "ls".into(), "--json".into()]).await?;
    Ok(projects
        .into_iter()
        .filter(|project| project.kind == "git")
        .collect())
}

fn provider_client_path() -> Result<PathBuf, String> {
    let cli = executable()
        .and_then(|path| path.canonicalize().ok())
        .ok_or("Paseo is not installed.")?;
    for directory in cli.ancestors().skip(1).take(4) {
        let archive = directory.join("app.asar");
        if archive.is_file() {
            return Ok(archive.join("node_modules/@getpaseo/cli/dist/utils/client.js"));
        }
        let client = directory.join("utils/client.js");
        if client.is_file() {
            return Ok(client);
        }
        let client = directory.join("node_modules/@getpaseo/cli/dist/utils/client.js");
        if client.is_file() {
            return Ok(client);
        }
    }
    Err("Could not locate Paseo's provider client. Update or reinstall Paseo.".into())
}

#[tauri::command]
pub async fn paseo_providers() -> Result<Vec<PaseoProvider>, String> {
    let client = provider_client_path()?;
    let runtime = read_cli::<PaseoRuntime>(vec!["status".into(), "--json".into()]).await?;
    let mut command = process(&runtime.daemon_node);
    command
        .env("ELECTRON_RUN_AS_NODE", "1")
        .args([
            "--input-type=module",
            "-e",
            include_str!("paseo-providers.mjs"),
        ])
        .arg(client)
        .arg(runtime.home);
    let output = run_process(command, Duration::from_secs(30))
        .await
        .map_err(|_| "Could not read Paseo permission modes. Open Paseo and try again.")?;
    if !output.status.success() {
        return Err("Could not read Paseo permission modes. Update Paseo and try again.".into());
    }
    serde_json::from_slice(&output.stdout).map_err(|_| {
        "Paseo returned unsupported provider metadata. Update Paseo and try again.".into()
    })
}

#[tauri::command]
pub async fn paseo_models(provider: String) -> Result<Vec<PaseoModel>, String> {
    if provider.is_empty()
        || provider.len() > 100
        || provider.starts_with('-')
        || !provider
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
    {
        return Err("Select an available provider.".into());
    }
    read_cli(vec![
        "provider".into(),
        "models".into(),
        provider,
        "--thinking".into(),
        "--json".into(),
    ])
    .await
}

async fn launch_arguments(request: &PaseoLaunch) -> Result<(Vec<String>, PathBuf), String> {
    if request.prompt.trim().is_empty()
        || request.prompt.len() > 65_536
        || request.prompt.contains('\0')
        || request.title.chars().count() > 100
        || request.run_id.len() > 2000
    {
        return Err("The prompt or trigger details are invalid or too large.".into());
    }
    let (projects, providers) = tokio::try_join!(paseo_projects(), paseo_providers())?;
    let project = projects.iter().find(|project| project.project_id == request.project_id)
        .ok_or("The saved project is no longer available in Paseo. Edit the trigger to choose a project.")?;
    let provider = providers
        .iter()
        .find(|provider| provider.id == request.provider)
        .ok_or("The saved provider is unavailable. Enable it in Paseo or edit the trigger.")?;
    if !request.mode.is_empty() && !provider.modes.iter().any(|mode| mode.id == request.mode) {
        return Err(
            "The saved permissions are unavailable for this provider. Edit the trigger.".into(),
        );
    }
    let models = paseo_models(request.provider.clone()).await?;
    let model = models
        .iter()
        .find(|model| model.id == request.model)
        .ok_or("The saved model is no longer available. Edit the trigger to choose a model.")?;
    if (!model.thinking_option_ids.is_empty()
        && !model.thinking_option_ids.contains(&request.thinking))
        || (model.thinking_option_ids.is_empty() && !request.thinking.is_empty())
    {
        return Err(
            "The saved thinking effort is unavailable for this model. Edit the trigger.".into(),
        );
    }
    let directory = PathBuf::from(&project.path);
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("The selected project's directory is unavailable on this computer.".into());
    }
    let mut args = vec![
        "run".into(),
        "--cwd".into(),
        project.path.clone(),
        "--new-workspace".into(),
        "worktree".into(),
        "--worktree-mode".into(),
        "branch-off".into(),
        "--base".into(),
        "origin/main".into(),
        "--new-branch".into(),
        format!("clockalong-{:016x}", rand::random::<u64>()),
        "--provider".into(),
        request.provider.clone(),
        "--model".into(),
        request.model.clone(),
        "--title".into(),
        request.title.clone(),
        "--label".into(),
        format!("clockalong-run={}", request.run_id),
        "--no-wait".into(),
        "--json".into(),
    ];
    if !request.mode.is_empty() {
        args.extend(["--mode".into(), request.mode.clone()]);
    }
    if !request.thinking.is_empty() {
        args.extend(["--thinking".into(), request.thinking.clone()]);
    }
    args.extend(["--".into(), request.prompt.clone()]);
    Ok((args, directory))
}

#[tauri::command]
pub async fn paseo_execute(app: tauri::AppHandle, request: PaseoLaunch) -> PaseoCommandResult {
    execute_paseo(request, Some(app)).await
}

// Explicit sample runs use the confirmed draft, independently of saved trigger enable state.
#[tauri::command]
pub async fn paseo_execute_sample(request: PaseoLaunch) -> PaseoCommandResult {
    let run_id = request.run_id.clone();
    log::info!("[paseo] Sample run {run_id}: launching.");
    let result = execute_paseo(request, None).await;
    let summary = format!(
        "[paseo] Sample run {run_id}: {}. Agent: {}. {}",
        result.status,
        result.agent_id.as_deref().unwrap_or("none"),
        result.detail.as_deref().unwrap_or("")
    );
    if result.status == "failed" || result.status == "unconfirmed" {
        log::warn!("{summary}");
    } else {
        log::info!("{summary}");
    }
    result
}

async fn execute_paseo(request: PaseoLaunch, app: Option<tauri::AppHandle>) -> PaseoCommandResult {
    let result = |status, detail: &str| PaseoCommandResult {
        status,
        detail: Some(detail.into()),
        agent_id: None,
    };
    let (args, directory) = match launch_arguments(&request).await {
        Ok(value) => value,
        Err(error) => return result("failed", &error),
    };
    if let Some(app) = app {
        // Discovery can take time. Respect edits or disabling while it was in progress.
        let enabled = app
            .store(crate::storage_config::STORAGE_PATH)
            .ok()
            .and_then(|store| store.get("paseoTriggers"))
            .and_then(|value| {
                value.as_array().map(|triggers| {
                    triggers.iter().any(|trigger| {
                        trigger["id"] == request.trigger_id
                            && trigger["revision"] == request.revision
                            && trigger["scope"] == request.scope
                            && trigger["enabled"] == true
                    })
                })
            })
            .unwrap_or(false);
        if !enabled {
            return result(
                "cancelled",
                "The trigger was disabled, edited, or removed before launch.",
            );
        }
    }
    let Some(path) = executable() else {
        return result("failed", "Paseo is no longer installed.");
    };
    let mut invocation = command(&path, &args);
    invocation.current_dir(directory);
    match run_process(invocation, Duration::from_secs(120)).await {
        Ok(output) => {
            if !output.status.success() {
                return result("unconfirmed", "Paseo reported a failure. Check Paseo before sending this request again; a workspace or agent may already exist.");
            }
            let agent_id = serde_json::from_slice::<serde_json::Value>(&output.stdout).ok()
                .and_then(|value| value.get("agentId").and_then(|id| id.as_str()).map(String::from));
            if agent_id.is_none() {
                return result("unconfirmed", "Paseo returned no agent ID. Check Paseo before sending this request again.");
            }
            PaseoCommandResult { status: "started", detail: None, agent_id }
        }
        Err(false) => result("failed", "Could not start the Paseo CLI. Check the installation."),
        Err(true) => result("unconfirmed", "No confirmed result within the command limits. Check Paseo before sending this request again."),
    }
}

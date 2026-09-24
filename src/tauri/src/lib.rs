mod app_storage;
mod config_commands;
mod developer_cli;
mod development_commands;
mod dry_run;
mod dry_run_assets;
mod dry_run_host;
mod dry_run_profile;
mod dry_run_report;
mod game_card_archive;
mod game_card_commands;
mod game_card_copy;
mod game_card_error;
mod game_card_imports;
mod game_card_install;
mod game_card_package;
mod game_card_paths;
mod game_card_png;
mod game_card_png_read;
mod game_card_png_write;
mod game_card_references;
mod game_card_repository;
mod game_card_schema;
mod game_card_source_map;
mod game_card_state_schema;
#[cfg(test)]
mod game_runtime_definition;
mod history;
mod runtime_session;
mod json_store;
mod model_commands;
mod model_http;
mod project_init;
mod project_init_assets;
mod project_init_error;
mod project_init_paths;
mod project_init_plan;
mod project_init_write;
mod resource_assets;
mod resource_response;
mod runtime_trace;
mod session_commands;
mod session_management;
mod sessions;
mod tavern_bundle;
mod tavern_commands;
mod tavern_input;
mod tavern_output;
mod tavern_png;
mod tavern_resources;
mod tavern_tasks;
mod trace_commands;
mod trace_files;
mod web_release;
mod web_release_files;
mod web_release_protocol;
#[cfg(test)]
mod web_release_tests;

pub fn publish_game_card(
    source: &std::path::Path,
    output: &std::path::Path,
    cover: Option<&str>,
) -> Result<serde_json::Value, String> {
    let release = web_release::publish(source, output, cover).map_err(|e| e.error)?;
    serde_json::to_value(release).map_err(|e| e.to_string())
}

use app_storage::AppStorage;
use model_commands::ModelNetworkState;
use tauri::Manager;

fn storage_dir(app: &tauri::App) -> tauri::Result<std::path::PathBuf> {
    #[cfg(feature = "e2e")]
    if let Some(path) = std::env::var_os("WORLD_CARD_STATION_E2E_DATA_DIR") {
        return Ok(path.into());
    }
    app.path().app_data_dir()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = developer_cli::run(tauri::generate_context!());
    let builder = tauri::Builder::default();
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    builder
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("local", |context, request, responder| {
            let storage = context.app_handle().state::<AppStorage>().inner().clone();
            std::thread::spawn(move || {
                responder.respond(resource_response::handle_resource_request(
                    &storage, request,
                ));
            });
        })
        .setup(|app| {
            let data_dir = storage_dir(app)?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(AppStorage::new(data_dir));
            app.manage(ModelNetworkState::new()?);
            app.manage(tavern_tasks::TavernTasks::default());
            app.manage(runtime_trace::RuntimeTrace::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            development_commands::get_game_card_development_instructions,
            trace_commands::start_session_trace,
            trace_commands::append_session_trace,
            trace_commands::close_session_trace,
            config_commands::get_model_config,
            config_commands::save_model_config,
            config_commands::get_background_config,
            config_commands::save_background_config,
            config_commands::select_background_image,
            session_commands::get_chat_history,
            session_commands::save_chat_history,
            session_commands::list_chat_sessions,
            session_commands::get_active_chat_session,
            session_commands::create_chat_session,
            session_commands::set_active_chat_session,
            session_commands::rename_chat_session,
            session_commands::delete_chat_session,
            game_card_commands::get_game_cards,
            game_card_commands::get_game_card,
            #[cfg(feature = "e2e")]
            game_card_commands::e2e_seed_game_card,
            game_card_commands::import_game_card_from_file,
            game_card_commands::set_active_game_card,
            game_card_commands::delete_game_card,
            game_card_commands::get_active_game_card,
            game_card_commands::read_game_card_file,
            tavern_commands::stage_tavern_import,
            tavern_commands::commit_tavern_import,
            tavern_commands::cancel_tavern_import,
            model_commands::stream_model_request,
            model_commands::cancel_model_stream
        ])
        .run(context)
        .expect("error while running Tauri application");
}

pub fn export_game_card_package(
    source: &std::path::Path,
    output_dir: &std::path::Path,
    format: &str,
    cover: Option<&std::path::Path>,
) -> Result<(std::path::PathBuf, String), String> {
    let format = match format {
        "gamecard" => game_card_package::ExportFormat::GameCard,
        "png" => game_card_package::ExportFormat::Png,
        value => return Err(format!("unsupported game card export format: {value}")),
    };
    game_card_package::export_package(source, output_dir, format, cover)
        .map_err(|error| error.error)
}

#[cfg(test)]
mod development_tests;
#[cfg(test)]
#[path = "../build/devkit.rs"]
mod devkit;
#[cfg(test)]
mod dry_run_tests;
#[cfg(test)]
mod game_card_directory_tests;
#[cfg(test)]
mod game_card_file_import_tests;
#[cfg(test)]
mod game_card_import_data_tests;
#[cfg(test)]
mod game_card_package_tests;
#[cfg(test)]
mod game_card_tests;
#[cfg(test)]
mod game_card_uninstall_tests;
#[cfg(test)]
mod model_tests;
#[cfg(test)]
mod project_init_safety_tests;
#[cfg(test)]
mod project_init_tests;
#[cfg(test)]
mod resource_tests;
#[cfg(test)]
mod runtime_trace_tests;
#[cfg(test)]
mod tavern_container_tests;
#[cfg(test)]
mod tavern_install_tests;
#[cfg(test)]
mod tavern_resource_tests;
#[cfg(test)]
mod tavern_test_support;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod trace_safety_tests;

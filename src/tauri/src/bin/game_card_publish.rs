use std::path::PathBuf;
use world_card_station_tauri_lib::publish_game_card;

fn run() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let source = args.next().filter(|s| !s.starts_with('-')).ok_or(
        "usage: game-card-publish <source> [--output <cards-dir>] [--cover <relative-path>]",
    )?;
    let mut output = PathBuf::from("dist/web-cards");
    let mut cover = None;
    let mut seen = std::collections::HashSet::new();
    while let Some(option) = args.next() {
        if !seen.insert(option.clone()) {
            return Err(format!("Repeated argument: {option}"));
        }
        let value = args
            .next()
            .ok_or_else(|| format!("Missing value: {option}"))?;
        match option.as_str() {
            "--output" => output = value.into(),
            "--cover" => cover = Some(value),
            _ => return Err(format!("Unknown argument: {option}")),
        }
    }
    let release = publish_game_card(&PathBuf::from(source), &output, cover.as_deref())?;
    println!(
        "{}",
        serde_json::to_string_pretty(&release).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

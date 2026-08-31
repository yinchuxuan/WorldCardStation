use std::path::PathBuf;
use world_card_station_tauri_lib::export_game_card_package;

struct Arguments {
    source: PathBuf,
    output: PathBuf,
    format: String,
    cover: Option<PathBuf>,
}

fn usage() -> String {
    "usage: game-card-export <source> [--format gamecard|png] [--cover <relative-path>] [--output <directory>]".to_string()
}

fn parse_arguments() -> Result<Arguments, String> {
    let mut values = std::env::args().skip(1);
    let source = values.next().map(PathBuf::from).ok_or_else(usage)?;
    let mut output = PathBuf::from("dist/game-cards");
    let mut format = "gamecard".to_string();
    let mut cover = None;
    while let Some(argument) = values.next() {
        match argument.as_str() {
            "--format" => format = values.next().ok_or_else(usage)?,
            "--cover" => cover = Some(PathBuf::from(values.next().ok_or_else(usage)?)),
            "--output" => output = PathBuf::from(values.next().ok_or_else(usage)?),
            _ => return Err(format!("unknown argument: {argument}\n{}", usage())),
        }
    }
    if format != "gamecard" && format != "png" {
        return Err(format!("unsupported format: {format}"));
    }
    if format == "png" && cover.is_none() {
        return Err("PNG export requires --cover <relative-path>".to_string());
    }
    Ok(Arguments {
        source,
        output,
        format,
        cover,
    })
}

fn run() -> Result<(), String> {
    let arguments = parse_arguments()?;
    let (output, checksum) = export_game_card_package(
        &arguments.source,
        &arguments.output,
        &arguments.format,
        arguments.cover.as_deref(),
    )?;
    println!("{}", output.display());
    println!("sha256 {checksum}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

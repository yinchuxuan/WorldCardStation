use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_png::{GAME_CHUNK, PNG_SIGNATURE};
use base64::{engine::general_purpose::STANDARD, Engine};
use crc32fast::Hasher;
use serde_json::Value;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

pub const MAX_JSON: usize = 16 * 1024 * 1024;

pub fn parse_json(bytes: &[u8]) -> CardResult<Value> {
    if bytes.len() > MAX_JSON {
        return Err(GameCardError::new("角色卡 JSON 超过 16 MiB 限制"));
    }
    serde_json::from_slice(bytes)
        .map_err(|error| GameCardError::new(format!("角色卡 JSON 无效：{error}")))
}

// None means native gcAr takes priority, including when its payload is corrupt.
pub fn read_character(path: &Path) -> CardResult<Option<Value>> {
    if path.metadata()?.len() > 1537 * 1024 * 1024 {
        return Err(GameCardError::new("PNG 文件超限"));
    }
    let mut input = BufReader::new(File::open(path)?);
    let mut signature = [0; 8];
    input.read_exact(&mut signature)?;
    if signature != PNG_SIGNATURE {
        return Err(GameCardError::new("不是 PNG 图片"));
    }
    let mut native = false;
    let mut v2 = None;
    let mut v3 = None;
    let mut image = false;
    let mut first = true;
    loop {
        let mut header = [0; 8];
        input.read_exact(&mut header)?;
        let length = u32::from_be_bytes(header[..4].try_into().unwrap()) as usize;
        let kind = &header[4..];
        if first && (kind != b"IHDR" || length != 13) {
            return Err(GameCardError::new("PNG IHDR 无效"));
        }
        first = false;
        native |= kind == GAME_CHUNK;
        image |= kind == b"IDAT";
        let mut hash = Hasher::new();
        hash.update(kind);
        let mut text = Vec::new();
        let mut remaining = length;
        let mut buffer = [0; 65536];
        while remaining > 0 {
            let take = remaining.min(buffer.len());
            input.read_exact(&mut buffer[..take])?;
            hash.update(&buffer[..take]);
            if kind == b"tEXt" {
                if text.len() + take > MAX_JSON * 2 {
                    return Err(GameCardError::new("PNG 文本 chunk 超限"));
                }
                text.extend_from_slice(&buffer[..take]);
            }
            remaining -= take;
        }
        let mut crc = [0; 4];
        input.read_exact(&mut crc)?;
        if u32::from_be_bytes(crc) != hash.finalize() {
            return Err(GameCardError::new("PNG chunk CRC 无效"));
        }
        if kind == b"tEXt" {
            if let Some(separator) = text.iter().position(|byte| *byte == 0) {
                let slot = match &text[..separator] {
                    b"ccv3" => Some(&mut v3),
                    b"chara" => Some(&mut v2),
                    _ => None,
                };
                if let Some(slot) = slot {
                    if slot.is_some() {
                        return Err(GameCardError::new("PNG 包含重复角色数据 chunk"));
                    }
                    *slot = Some(text[separator + 1..].to_vec());
                }
            }
        }
        if kind == b"IEND" {
            if length != 0 || !image || input.read(&mut [0])? != 0 {
                return Err(GameCardError::new("PNG 图片结构无效"));
            }
            break;
        }
    }
    if native {
        return Ok(None);
    }
    let text = v3
        .or(v2)
        .ok_or_else(|| GameCardError::new("图片不包含平台游戏卡或 V2/V3 酒馆卡数据"))?;
    let decoded = STANDARD
        .decode(text)
        .map_err(|_| GameCardError::new("酒馆卡 Base64 无效"))?;
    parse_json(&decoded).map(Some)
}

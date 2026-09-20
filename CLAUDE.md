# CLAUDE.md

你正在一个AI Roleplay Game平台仓库中工作

## 技术栈

Node.js + Tauri + React

## Docs

Read `docs/docs_roadmap.md` first and follow its task routes. Read only the matching contracts and their explicit prerequisites; do not recursively read the whole documentation tree. Use each document's code pointers when implementation details are needed. Pure documentation tasks do not require language-specific coding guides.

## auto mode

```
if user types "start auto mode ${dir}" at the beginning of a session:
    if ${dir} is provided:
        read auto_mode_harness/${dir}/auto-mode.md
    else :  // dir is empty
        read auto_mode_harness/auto-mode.md
enter the auto mode workflow
```

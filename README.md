# PlotKityCat

PlotKityCat is a portable desktop app for running AI-generated Python plotting scripts for math teaching.

## Project Structure

- `frontend/`: Vue 3 + Vite user interface
- `internal/bridge/`: Wails-facing application service layer
- `internal/files/`: script file management
- `internal/runner/`: Python process execution and lifecycle
- `internal/env/`: runtime bootstrap and unpacking
- `resources/runtime/`: shipped runtime archive location used by both dev and packaged app
- `packaging/`: runtime download, staging, helper dependencies, and output artifacts
- `tools/`: local packaging helpers

## Status

The project is now beyond the initial skeleton:

- frontend loading screen is implemented for runtime initialization and extraction progress
- runtime readiness is checked against `python.exe`, `numpy`, `matplotlib`, `scipy`, and `PyQt5`
- first-run runtime extraction from `resources/runtime/runtime.zip` is wired into the app startup flow
- Python runner is restricted to the bundled runtime and no longer falls back to system Python
- process-tree cleanup on app shutdown is implemented
- single-instance lock is implemented

## Runtime Packaging Status

Current local artifacts:

- `packaging/downloads/WinPython64-3.13.11.0slim.exe`: downloaded WinPython installer
- `packaging/staging/runtime-staging/WPy64-313110/python/`: extracted WinPython runtime root
- `packaging/.tools_py/`: local Python dependency sandbox used by packaging helpers
- `runtime.version.json`: version manifest template and generated runtime metadata source
- `resources/runtime/runtime.zip`: current runtime archive used by both development and packaged app runs

Current cleanup status:

- already excluded by packaging choice:
  - outer WinPython launchers such as `Spyder.exe`, `Jupyter Lab.exe`, `VS Code.exe`
  - outer `notebooks/`, `scripts/`, `t/` directories
- already cleaned from the staged runtime:
  - `Lib/test`
  - `Lib/idlelib`
  - `Lib/turtledemo`
  - selected package test folders such as `numpy/tests`, `scipy/tests`, `matplotlib/tests`, `mpl_toolkits/tests`
  - recursive `__pycache__`
- not fully cleaned yet:
  - many extra site-packages that come with WinPython slim
  - Jupyter-related packages and docs inside `site-packages`
  - other development-oriented docs/examples/test suites nested in third-party packages

## Packaging Flow

Current packaging flow:

1. Download a WinPython slim package into `packaging/downloads/`.
2. Extract it to a staging directory.
3. Use only the inner `python/` directory as the future `runtime/` root.
4. Generate `runtime.version.json` with actual package versions.
5. Remove low-risk unused content first.
6. Compress the cleaned `python/` contents into `resources/runtime/runtime.zip`.
7. Keep `resources/runtime/runtime.zip` in both the development workspace and the packaged app distribution.
8. On startup, the app checks `runtime/`; if missing or incomplete, it extracts `resources/runtime/runtime.zip` while showing the loading progress UI.

## Remaining Runtime Tasks

High-priority next steps:

- further slim the staged runtime by removing obviously unused Jupyter, notebook, docs, examples, and test-heavy packages
- decide whether to keep or remove developer-oriented package sets that are unrelated to PlotKityCat runtime playback
- verify that the cleaned runtime still supports:
  - `numpy`
  - `matplotlib`
  - `scipy`
  - `PyQt5`
  - `pip`
- test packaged `.exe` first-run extraction from `resources/runtime/runtime.zip`

## AI Workspace Notes

Current direction for the non-chat AI workflow:

- add a collapsible AI panel on the right side of the code editor
- the right panel is the single note area; text and images are first-class inputs with equal status
- the code editor remains focused on Python source, while note materials live in the side panel
- the panel should be collapsible so normal coding keeps the widest possible editor area

Planned interaction model:

- users edit Python in the main editor
- users write note text in the right panel
- users attach one or more reference images in the same panel
- AI generation is request-based, not chat-based
- generated code should be inserted back into the script in a controlled way instead of turning the whole app into a conversation UI

Binding model between `.py` and note materials:

- keep `.py` as the runnable source of truth
- bind each script to a sidecar metadata file such as `<script>.plotcat.json`
- bind images through a sibling asset folder such as `<script>.assets/`
- this keeps runtime execution simple while allowing note text and images to persist with each script

Planned share/import package:

- use a dedicated package format with the extension `.pkc`
- `.pkc` is intended as a PlotKityCat bundle that can include Python source, note metadata, and referenced images
- implementation-wise it can be a zipped container with a custom extension
- internal editing can still use `py + sidecar + assets`, while export/import uses `.pkc`

Notes about the `.pkc` extension:

- `.pkc` is not a mainstream archive extension like `.zip`, `.rar`, or `.7z`
- it does appear in some unrelated niche software/file-type contexts, so it is not globally unique
- for PlotKityCat this is still acceptable as long as the app owns the association during import/export

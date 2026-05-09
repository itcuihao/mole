# Codex Home Isolation PRD

## Background

Mole currently starts runtime sessions by combining a saved Profile with a shell, host, or custom command. This works for simple environment-variable based tools, but Codex also reads local state from its Codex home directory, including `config.toml`, `auth.json`, session state, history, cache, plugins, skills, and logs.

When users need to run Codex against both the official OpenAI account and one or more third-party providers, sharing the same default `~/.codex` directory makes configuration and authentication easy to mix up. Mole should provide a simple Codex-specific launch mode that isolates the Codex home per Codex configuration.

## Goals

- Add first-class Codex session support.
- Allow users to create named Codex configurations such as `openai-official` or `maxx`.
- Support multiple Codex configurations at the same time, such as `maxx`, `qiniu`, and `openai-official`.
- Give each Codex configuration its own home directory under Mole's config directory.
- Let users create and edit the raw Codex `config.toml` content for each Codex configuration.
- Let users initialize or replace the raw Codex `auth.json` in the same isolated home.
- Inject `CODEX_HOME` into the runtime session before launching `codex`.
- Keep Codex authentication state isolated by Codex configuration.
- Reuse Mole Profiles for environment-variable based secrets and provider-specific environment variables.
- Support raw `auth.json` for providers that require file-backed credentials.

## Non-Goals

- Do not add Claude, Crush, or other AI app support in this phase.
- Do not share Codex caches across isolated homes.
- Do not read, parse, display, migrate, or export existing `auth.json` content.
- Do not keep `auth.json` content in `codex_configs.json`.
- Do not automate `codex login`.
- Do not validate provider credentials against remote APIs.
- Do not discover available models from providers.
- Do not translate structured Mole provider fields into Codex TOML in this phase.
- Do not parse Codex TOML beyond syntax validation.
- Do not add a file watcher or live-update running Codex sessions when a Codex configuration changes.
- Do not replace existing shell, host, or custom command session behavior.

## User Stories

- As a user, I can create Codex configurations named `maxx` and `qiniu` by pasting provider-supplied Codex `config.toml` content for each channel.
- As a user, I can initialize the matching provider-supplied `auth.json` in the same isolated Codex home.
- As a user, I can create a Codex session that combines a Mole Profile with the `maxx` Codex configuration.
- As a user, I can run official Codex, maxx, and qiniu sessions side by side without their `config.toml` or `auth.json` colliding.
- As a user, I can enter a Codex session's terminal and run `codex login` manually for that isolated Codex home.
- As a user, I can verify the active Codex home with `echo $CODEX_HOME`.

## Data Model

Add a Codex configuration store, persisted as:

```text
~/.config/mole/codex_configs.json
```

Proposed shape:

```json
[
  {
    "id": "maxx",
    "name": "maxx",
    "home_dir": "~/.config/mole/ai/codex/maxx",
    "config_path": "~/.config/mole/ai/codex/maxx/config.toml",
    "auth_path": "~/.config/mole/ai/codex/maxx/auth.json",
    "created_at": "2026-05-09T00:00:00Z",
    "updated_at": "2026-05-09T00:00:00Z"
  },
  {
    "id": "qiniu",
    "name": "Qiniu",
    "home_dir": "~/.config/mole/ai/codex/qiniu",
    "config_path": "~/.config/mole/ai/codex/qiniu/config.toml",
    "auth_path": "~/.config/mole/ai/codex/qiniu/auth.json",
    "created_at": "2026-05-09T00:00:00Z",
    "updated_at": "2026-05-09T00:00:00Z"
  }
]
```

`home_dir`, `config_path`, and `auth_path` are derived from the Codex configuration `id` and Mole's config directory. They are shown in the store shape for clarity; implementations may persist them or derive them at runtime as long as the resulting paths remain stable.

Each object in `codex_configs.json` represents one selectable Codex channel/configuration. The file is a list, not a singleton. Session records choose exactly one Codex configuration through `codex_config_id`.

Extend stored sessions with:

```json
{
  "run_mode": "codex",
  "codex_config_id": "maxx"
}
```

The existing `profile_id` remains responsible for environment variables and env-based secrets.

The raw Codex TOML content is not stored in `codex_configs.json`. It is persisted directly at the configuration's `config_path` so the on-disk layout matches Codex's native expectations.

The raw Codex auth JSON content is not stored in `codex_configs.json`. It may be written directly to `auth_path` during create or explicit replacement flows for providers that expect file-backed credentials, but Mole should not load and show an existing `auth.json` by default.

## Codex Home Layout

Each Codex configuration gets a dedicated home:

```text
~/.config/mole/ai/codex/<codex-config-id>/
```

Example:

```text
~/.config/mole/ai/codex/maxx/
  config.toml
  auth.json
  sessions/
  history.jsonl
  cache/
  log/

~/.config/mole/ai/codex/qiniu/
  config.toml
  auth.json
  sessions/
  history.jsonl
  cache/
  log/
```

Mole owns creating and editing `config.toml` as raw user-provided TOML. Mole may also initialize or explicitly replace `auth.json` as raw user-provided JSON. Codex owns any runtime files it creates inside the directory after launch.

## Launch Rules

When a session uses `run_mode = "codex"`:

1. Load the selected Codex configuration.
2. Resolve the selected Mole Profile into environment variables.
3. Ensure the Codex home directory exists.
4. Ensure `<codex-home>/config.toml` exists with the saved raw TOML content.
5. Leave `<codex-home>/auth.json` untouched if it already exists.
6. Add `CODEX_HOME=<codex-home>` to the session environment.
7. Launch `codex`.

```sh
codex
```

Two sessions may use different Codex configurations at the same time. Each session receives the `CODEX_HOME` derived from its own `codex_config_id`.

Model, provider, retry, timeout, and other Codex behavior should come from the raw `config.toml` unless the user explicitly chooses to use a custom command outside Codex mode.

Profile env values should win over Mole-added env values except for `CODEX_HOME`, which Mole sets from the selected Codex configuration to avoid accidental cross-home launches.

## Raw config.toml

Mole should expose an editor for the raw `config.toml` content. Users can paste provider-supplied configuration directly, for example:

```toml
model_provider = "maxx"

[model_providers.maxx]
name = "maxx"
base_url = "https://maxx-direct.cloverstd.com"
wire_api = "responses"
env_key = "MAXX_API_KEY"
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000
```

If the provider uses an environment variable for a secret, users should put the key name in TOML and store the actual value in a Mole Profile:

```toml
[model_providers.maxx]
env_key = "MAXX_API_KEY"
```

Secrets should not be written into `config.toml`.

Mole may show a non-blocking hint when `cli_auth_credentials_store = "file"` is absent, because file-backed auth keeps `auth.json` inside the selected `CODEX_HOME`. Mole should not force this setting into the user's TOML.

## Raw auth.json

Some providers supply a matching `auth.json` alongside `config.toml`, for example:

```json
{
  "OPENAI_API_KEY": "maxx_your_token_here"
}
```

For those providers, Mole should support initializing `auth.json` in the same isolated Codex home as `config.toml`:

```text
~/.config/mole/ai/codex/maxx/auth.json
```

Rules:

- `config.toml` and `auth.json` should live together in the selected Codex home.
- `auth.json` may contain secrets; it is the file-backed credential path, separate from Mole Profile env secrets.
- Creating a Codex configuration may include an optional raw `auth.json` editor.
- Saving raw auth JSON writes directly to `<codex-home>/auth.json`.
- The auth file should be written with owner-only permissions where the platform supports it.
- After saving auth JSON, Mole should clear the editor and show only status such as `auth.json exists`.
- Existing `auth.json` content should not be loaded back into the UI by default.
- Replacing an existing `auth.json` requires an explicit replace action.
- Workspace export should not include `auth.json` by default.
- Deleting or replacing `auth.json` is a sensitive operation and should require confirmation.

## Update And Restart Behavior

- Creating a Codex session creates the Codex home when needed and starts a new runtime session.
- Updating an existing session to Codex mode follows the existing kill-and-recreate behavior when the runtime session is alive.
- Restarting a dead Codex session ensures the selected Codex home and `config.toml` exist before launching.
- Restarting a dead Codex session does not rewrite `auth.json`.
- Editing a Codex configuration does not automatically update already-running runtime sessions. Users must restart or update affected sessions.

## UI Requirements

Add the first Codex configuration management surface inside the existing Settings page.

Recommended Settings layout:

```text
Settings
  Terminal
  Workspace
  Codex Configurations
```

The Codex Configurations section should include:

- Name
- Config ID
- Codex home path, read-only by default
- Raw `config.toml` editor
- TOML syntax validation
- Save action that writes the raw TOML to `<codex-home>/config.toml`
- Auth status: missing or exists
- Optional raw `auth.json` initialization or explicit replacement flow
- JSON syntax validation for new or replacement auth content

The list should support multiple rows, for example:

```text
Maxx   ~/.config/mole/ai/codex/maxx    auth.json exists
Qiniu  ~/.config/mole/ai/codex/qiniu   auth.json exists
OpenAI ~/.config/mole/ai/codex/openai  auth.json missing
```

Extend session creation/editing with a Codex run mode:

- Run mode: Shell, Host, Custom Command, Codex
- When Codex is selected, show Codex configuration selector.
- Continue showing Mole Profile selector for env/secrets.

The Sessions page should only select and use Codex configurations. Creating and editing Codex configurations stays in Settings for this phase.

Do not add a top-level AI Apps navigation item in this phase. If Claude, Crush, or other AI tools are added later, the Settings section can be promoted into a broader AI Apps management area.

## Validation

- `name` and `id` are required.
- `id` should be safe for path generation.
- Codex config IDs must be unique.
- Raw `config.toml` must be valid TOML before saving.
- Raw `auth.json`, when provided, must be valid JSON before saving.
- Mole should not reject semantically unknown Codex fields if the TOML is syntactically valid.

## Acceptance Criteria

- A user can create a Codex configuration named `maxx`.
- A user can create another Codex configuration named `qiniu`.
- The user can paste raw provider-supplied `config.toml` content for `maxx`.
- The user can paste different raw provider-supplied `config.toml` content for `qiniu`.
- The user can optionally paste provider-supplied `auth.json` content for `maxx`.
- A user can create a session with `run_mode = "codex"` and `codex_config_id = "maxx"`.
- A user can create another session with `run_mode = "codex"` and `codex_config_id = "qiniu"`.
- Starting that session creates `~/.config/mole/ai/codex/maxx/config.toml`.
- Starting the qiniu session creates `~/.config/mole/ai/codex/qiniu/config.toml`.
- Saving auth content creates `~/.config/mole/ai/codex/maxx/auth.json`.
- The created `config.toml` preserves the user's raw TOML content without converting it through structured provider fields.
- The runtime shell has `CODEX_HOME` set to the selected Codex home.
- Two Codex sessions using different Codex configurations have different `CODEX_HOME` values.
- Mole does not load or display existing `auth.json` content by default.
- Existing shell, host, and custom command sessions continue to work.

## Open Questions

- Should official OpenAI Codex provide a default raw TOML template, or start with an empty editor?
- Should a new Codex configuration show an optional auth editor by default, or hide it behind an `Initialize auth.json` action?
- Should Codex configuration edits warn users about running sessions that still use the previous saved config?
- Should workspace import/export include Codex configurations in the same bundle as Profiles, Hosts, and Sessions?
- Should `CODEX_HOME` always override Profile-provided `CODEX_HOME`, or should advanced users be allowed to opt out?

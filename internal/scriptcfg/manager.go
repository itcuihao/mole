package scriptcfg

import (
	"fmt"
	"mole/internal/config"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Manager coordinates script preset metadata.
type Manager struct {
	store *Store
}

func NewManager(storePath string) *Manager {
	return &Manager{
		store: NewStore(storePath),
	}
}

func (m *Manager) List() ([]Config, error) {
	configs, err := m.store.List()
	if err != nil {
		return []Config{}, err
	}
	configs, err = m.ensureBuiltins(configs)
	if err != nil {
		return []Config{}, err
	}

	sort.SliceStable(configs, func(i, j int) bool {
		return strings.ToLower(configs[i].Name) < strings.ToLower(configs[j].Name)
	})

	return configs, nil
}

func (m *Manager) Save(req SaveRequest) (Config, error) {
	req.ID = strings.TrimSpace(req.ID)
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	req.Command = strings.TrimSpace(req.Command)
	var err error
	req.Platform, err = normalizeAndValidatePlatform(req.Platform)
	if err != nil {
		return Config{}, err
	}

	if err := validateID(req.ID); err != nil {
		return Config{}, err
	}
	if err := validateName(req.Name); err != nil {
		return Config{}, err
	}
	if err := validateCommand(req.Command); err != nil {
		return Config{}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	existing, existingErr := m.store.Get(req.ID)
	if existingErr == nil && strings.TrimSpace(existing.CreatedAt) != "" {
		if existing.Builtin {
			return Config{}, fmt.Errorf("built-in script %q cannot be edited", req.ID)
		}
		existing.Name = req.Name
		existing.Description = req.Description
		existing.Platform = req.Platform
		existing.Command = req.Command
		existing.UpdatedAt = now
		if err := m.store.Save(existing); err != nil {
			return Config{}, fmt.Errorf("failed to save script config: %w", err)
		}
		return existing, nil
	}

	cfg := Config{
		ID:          req.ID,
		Name:        req.Name,
		Description: req.Description,
		Platform:    req.Platform,
		Command:     req.Command,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := m.store.Save(cfg); err != nil {
		return Config{}, fmt.Errorf("failed to save script config: %w", err)
	}
	return cfg, nil
}

func (m *Manager) Delete(id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	existing, err := m.store.Get(id)
	if err != nil {
		return err
	}
	if existing.Builtin {
		return fmt.Errorf("built-in script %q cannot be deleted", id)
	}
	return m.store.Delete(id)
}

func (m *Manager) ensureBuiltins(configs []Config) ([]Config, error) {
	builtins, err := builtinScriptConfigs()
	if err != nil {
		return configs, err
	}
	if len(builtins) == 0 {
		return configs, nil
	}

	builtinByID := make(map[string]Config, len(builtins))
	for _, item := range builtins {
		builtinByID[item.ID] = item
	}

	changed := false
	for i := range configs {
		cfg := configs[i]
		builtin, ok := builtinByID[cfg.ID]
		if !ok {
			continue
		}
		if shouldRefreshBuiltinCommand(cfg.Command) || !cfg.Builtin {
			configs[i].Command = builtin.Command
			configs[i].Platform = builtin.Platform
			configs[i].Description = builtin.Description
			configs[i].Builtin = true
			configs[i].UpdatedAt = time.Now().Format(time.RFC3339Nano)
			if err := m.store.Save(configs[i]); err != nil {
				return configs, fmt.Errorf("failed to refresh built-in script config %q: %w", cfg.ID, err)
			}
			changed = true
		}
		delete(builtinByID, cfg.ID)
	}

	if changed {
		latest, loadErr := m.store.List()
		if loadErr == nil {
			configs = latest
		}
	}

	for _, builtin := range builtins {
		if _, ok := builtinByID[builtin.ID]; !ok {
			continue
		}
		now := time.Now().Format(time.RFC3339Nano)
		builtin.CreatedAt = now
		builtin.UpdatedAt = now
		if err := m.store.Save(builtin); err != nil {
			return configs, fmt.Errorf("failed to create built-in script config %q: %w", builtin.ID, err)
		}
		configs = append(configs, builtin)
	}
	return configs, nil
}

func builtinScriptConfigs() ([]Config, error) {
	dir := filepath.Join(config.Dir(), "scripts", "vscode-claude")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create built-in scripts dir: %w", err)
	}

	macPath := filepath.Join(dir, "start_vscode_claude_mac.sh")
	winPath := filepath.Join(dir, "start_vscode_claude_win.ps1")

	if err := os.WriteFile(macPath, []byte(builtinMacScriptContent), 0755); err != nil {
		return nil, fmt.Errorf("failed to write built-in mac script: %w", err)
	}
	if err := os.WriteFile(winPath, []byte(builtinWinScriptContent), 0644); err != nil {
		return nil, fmt.Errorf("failed to write built-in windows script: %w", err)
	}

	return []Config{
		{
			ID:          "vscode-claude-mac",
			Name:        "VSCode Claude (MacOS)",
			Description: "Built-in one-click VSCode + Claude startup script",
			Platform:    "macos",
			Command:     "bash " + quoteShellArg(macPath),
			Builtin:     true,
		},
		{
			ID:          "vscode-claude-win",
			Name:        "VSCode Claude (Windows)",
			Description: "Built-in one-click VSCode + Claude startup script",
			Platform:    "windows",
			Command:     "powershell -ExecutionPolicy Bypass -File " + quotePowerShellArg(winPath),
			Builtin:     true,
		},
	}, nil
}

func shouldRefreshBuiltinCommand(command string) bool {
	normalized := strings.TrimSpace(command)
	if normalized == "" {
		return true
	}
	legacy := []string{
		"bash /absolute/path/to/mole/scripts/vscode-claude/start_vscode_claude_mac.sh",
		"powershell -ExecutionPolicy Bypass -File \"D:\\absolute\\path\\to\\mole\\scripts\\vscode-claude\\start_vscode_claude_win.ps1\"",
	}
	for _, item := range legacy {
		if normalized == item {
			return true
		}
	}
	if strings.Contains(normalized, "scripts/vscode-claude/start_vscode_claude_") &&
		!strings.Contains(normalized, filepath.Join(config.Dir(), "scripts", "vscode-claude")) {
		return true
	}
	return false
}

const builtinMacScriptContent = `#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${MOLE_WORKSPACE:-$HOME}"

cd "$WORKSPACE"
mkdir -p .vscode

# Write profile env vars to .vscode/settings.json for Claude Code extension
python3 -c '
import json, os, sys
path = os.path.join(".vscode", "settings.json")
settings = {}
if os.path.isfile(path):
    try:
        with open(path) as f:
            settings = json.load(f)
    except Exception:
        pass
env = settings.get("claude-code.environmentVariables", {})
for key in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"):
    val = os.environ.get(key)
    if val:
        env[key] = val
    else:
        env.pop(key, None)
if env:
    settings["claude-code.environmentVariables"] = env
else:
    settings.pop("claude-code.environmentVariables", None)
with open(path, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")
'

code -n "$WORKSPACE"
`

const builtinWinScriptContent = `$Workspace = if ($env:MOLE_WORKSPACE) { $env:MOLE_WORKSPACE } else { $env:USERPROFILE }

Set-Location $Workspace
if (!(Test-Path ".vscode")) { New-Item -ItemType Directory -Path ".vscode" | Out-Null }

# Write profile env vars to .vscode/settings.json for Claude Code extension
$settingsPath = Join-Path ".vscode" "settings.json"
$settings = @{}
if (Test-Path $settingsPath) {
    try { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable } catch {}
}
$envMap = @{}
if ($settings."claude-code.environmentVariables") {
    $settings."claude-code.environmentVariables".GetEnumerator() | ForEach-Object { $envMap[$_.Key] = $_.Value }
}
foreach ($key in @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL")) {
    $val = [Environment]::GetEnvironmentVariable($key)
    if ($val) { $envMap[$key] = $val } else { $envMap.Remove($key) }
}
if ($envMap.Count -gt 0) { $settings."claude-code.environmentVariables" = $envMap } else { $settings.Remove("claude-code.environmentVariables") }
$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8

code -n $Workspace
`

func quoteShellArg(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func quotePowerShellArg(value string) string {
	escaped := strings.ReplaceAll(value, "\"", "\\\"")
	return "\"" + escaped + "\""
}

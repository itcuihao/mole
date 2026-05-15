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
		if shouldRefreshBuiltinCommand(cfg.Command) {
			configs[i].Command = builtin.Command
			configs[i].Platform = builtin.Platform
			configs[i].Description = builtin.Description
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
		},
		{
			ID:          "vscode-claude-win",
			Name:        "VSCode Claude (Windows)",
			Description: "Built-in one-click VSCode + Claude startup script",
			Platform:    "windows",
			Command:     "powershell -ExecutionPolicy Bypass -File " + quotePowerShellArg(winPath),
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
PROJECT_DIR="${PROJECT_DIR:-$HOME/mygo/mole}"
CONFIG_FILE="${HOME}/.config/mole/vscode-claude.env"

[[ -f "$CONFIG_FILE" ]] || { echo "缺少配置: $CONFIG_FILE"; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"

cd "$PROJECT_DIR"
mkdir -p .claude
code "$PROJECT_DIR"
`

const builtinWinScriptContent = `$ProjectDir = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { "$env:USERPROFILE\mygo\mole" }
$ConfigFile = "$env:USERPROFILE\.mole\vscode-claude.ps1"

if (!(Test-Path $ConfigFile)) { Write-Error "缺少配置: $ConfigFile"; exit 1 }
. $ConfigFile

Set-Location $ProjectDir
if (!(Test-Path ".claude")) { New-Item -ItemType Directory -Path ".claude" | Out-Null }

code $ProjectDir
`

func quoteShellArg(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func quotePowerShellArg(value string) string {
	escaped := strings.ReplaceAll(value, "\"", "\\\"")
	return "\"" + escaped + "\""
}

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"mole/internal/codex"
	"mole/internal/config"
	"mole/internal/docker"
	"mole/internal/inventory"
	"mole/internal/pluginconfig"
	"mole/internal/profile"
	"mole/internal/provider"
	"mole/internal/scriptcfg"
	"mole/internal/session"
	"mole/internal/terminal"
	"mole/internal/traymenu"
	"mole/internal/workspace"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct holds the application state and managers.
type App struct {
	ctx             context.Context
	profileMgr      *profile.Manager
	codexMgr        *codex.Manager
	dockerMgr       *docker.Manager
	scriptMgr       *scriptcfg.Manager
	pluginConfigMgr *pluginconfig.Manager
	sessionMgr      *session.Manager
	invMgr          *inventory.Manager
	trayOnce        sync.Once
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
}

// startup initializes the application.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if err := config.EnsureDir(); err != nil {
		log.Printf("Failed to create config directory: %v", err)
	}

	// Initialize settings.json if it doesn't exist
	if err := config.InitSettings(); err != nil {
		log.Printf("Failed to initialize settings: %v", err)
	}

	a.profileMgr = profile.NewManager(config.ProfilesPath())
	a.codexMgr = codex.NewManager(config.CodexConfigsPath())
	a.dockerMgr = docker.NewManager(config.DockerConfigsPath())
	a.scriptMgr = scriptcfg.NewManager(config.ScriptConfigsPath())
	a.pluginConfigMgr = pluginconfig.NewManager(config.PluginConfigsPath())
	a.invMgr = inventory.NewManager(config.HostsPath())
	a.sessionMgr = session.NewPlatformManager(config.SessionsPath(), a.profileMgr, a.invMgr)
	a.sessionMgr.SetCodexManager(a.codexMgr)
	a.sessionMgr.SetDockerManager(a.dockerMgr)
	a.sessionMgr.SetPluginConfigManager(a.pluginConfigMgr)
	a.sessionMgr.SetScriptManager(a.scriptMgr)
}

// domReady wires desktop integrations that rely on the frontend runtime being available.
func (a *App) domReady(ctx context.Context) {
	a.startTray()
}

// GetProviderPresets returns all built-in provider preset templates.
func (a *App) GetProviderPresets() []provider.Preset {
	return provider.GetPresets()
}

// ListProfiles returns all profiles.
func (a *App) ListProfiles() ([]profile.Profile, error) {
	return a.profileMgr.List()
}

// SaveProfile saves a profile with optional secrets.
// After saving, it syncs the updated env vars to all alive sessions using this profile.
func (a *App) SaveProfile(p profile.Profile, secrets map[string]string) error {
	if err := a.profileMgr.Save(p, secrets); err != nil {
		return err
	}
	a.sessionMgr.SyncEnvForProfile(p.ID)
	return nil
}

// DeleteProfile removes a profile by ID.
func (a *App) DeleteProfile(id string) error {
	return a.profileMgr.Delete(id)
}

// ListCodexConfigs returns all configured isolated Codex homes.
func (a *App) ListCodexConfigs() ([]codex.Config, error) {
	return a.codexMgr.List()
}

// GetCodexConfigToml returns raw config.toml content for a Codex config.
func (a *App) GetCodexConfigToml(id string) (string, error) {
	return a.codexMgr.ReadConfigToml(id)
}

// SaveCodexConfig saves Codex metadata and raw config/auth files.
func (a *App) SaveCodexConfig(req codex.SaveRequest) (codex.Config, error) {
	return a.codexMgr.Save(req)
}

// DeleteCodexConfig removes Codex config metadata without deleting its home directory.
func (a *App) DeleteCodexConfig(id string) error {
	return a.codexMgr.Delete(id)
}

// ListDockerConfigs returns all Docker container launch configurations.
func (a *App) ListDockerConfigs() ([]docker.Config, error) {
	return a.dockerMgr.List()
}

// SaveDockerConfig saves Docker config metadata.
func (a *App) SaveDockerConfig(req docker.SaveRequest) (docker.Config, error) {
	return a.dockerMgr.Save(req)
}

// DeleteDockerConfig removes Docker config metadata.
func (a *App) DeleteDockerConfig(id string) error {
	return a.dockerMgr.Delete(id)
}

// ListScriptConfigs returns reusable local script launch presets.
func (a *App) ListScriptConfigs() ([]scriptcfg.Config, error) {
	return a.scriptMgr.List()
}

// SaveScriptConfig saves or updates one reusable script preset.
func (a *App) SaveScriptConfig(req scriptcfg.SaveRequest) (scriptcfg.Config, error) {
	return a.scriptMgr.Save(req)
}

// DeleteScriptConfig removes one reusable script preset.
func (a *App) DeleteScriptConfig(id string) error {
	return a.scriptMgr.Delete(id)
}

// TestScriptCommand validates whether a launch command can run on this machine.
// It checks command syntax, executable availability, and referenced script path.
func (a *App) TestScriptCommand(command string) (scriptcfg.CommandTestResult, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return scriptcfg.CommandTestResult{OK: false, Message: "命令为空，无法测试"}, nil
	}

	tokens, err := splitShellLike(command)
	if err != nil {
		return scriptcfg.CommandTestResult{OK: false, Message: fmt.Sprintf("命令格式错误: %v", err)}, nil
	}
	if len(tokens) == 0 {
		return scriptcfg.CommandTestResult{OK: false, Message: "命令为空，无法测试"}, nil
	}

	exeName := tokens[0]
	exePath, err := exec.LookPath(exeName)
	if err != nil {
		return scriptcfg.CommandTestResult{OK: false, Message: fmt.Sprintf("找不到可执行程序: %s", exeName)}, nil
	}

	if scriptPath, ok := inferScriptPath(tokens); ok {
		resolved := expandUserHome(scriptPath)
		info, statErr := os.Stat(resolved)
		if statErr != nil || info.IsDir() {
			return scriptcfg.CommandTestResult{
				OK:      false,
				Message: fmt.Sprintf("脚本文件不存在: %s", resolved),
			}, nil
		}
		return scriptcfg.CommandTestResult{
			OK:      true,
			Message: fmt.Sprintf("测试通过: %s 可用，脚本存在 (%s)", exePath, resolved),
		}, nil
	}

	return scriptcfg.CommandTestResult{
		OK:      true,
		Message: fmt.Sprintf("测试通过: %s 可用", exePath),
	}, nil
}

// ListPluginConfigs returns reusable launch plugin presets.
func (a *App) ListPluginConfigs(pluginID string) ([]pluginconfig.Config, error) {
	return a.pluginConfigMgr.List(pluginID)
}

// SavePluginConfig saves a reusable launch plugin preset.
func (a *App) SavePluginConfig(req pluginconfig.SaveRequest) (pluginconfig.Config, error) {
	return a.pluginConfigMgr.Save(req)
}

// DeletePluginConfig removes a reusable launch plugin preset.
func (a *App) DeletePluginConfig(id string) error {
	return a.pluginConfigMgr.Delete(id)
}

// ListLaunchPlugins returns metadata for all registered launch plugins.
func (a *App) ListLaunchPlugins() []session.PluginInfo {
	return a.sessionMgr.ListLaunchPlugins()
}

// CreateSession creates a new runtime session from a profile.
func (a *App) CreateSession(profileID, name, command string) error {
	return a.sessionMgr.Create(profileID, name, command, inferRunMode(command), "", "", "", "")
}

// CreateSessionWithOptions creates a new runtime session with explicit launch metadata.
func (a *App) CreateSessionWithOptions(profileID, name, command, runMode, hostID, codexConfigID, den, cwd string) error {
	return a.sessionMgr.Create(profileID, name, command, runMode, hostID, codexConfigID, den, cwd)
}

// CreateSessionWithOptionsV2 creates a new runtime session with plugin metadata.
func (a *App) CreateSessionWithOptionsV2(req session.SessionLaunchRequest) error {
	return a.sessionMgr.CreateWithRequest(req)
}

// ListSessions returns all sessions with live status.
func (a *App) ListSessions() ([]session.SessionStatus, error) {
	return a.sessionMgr.ListWithStatus()
}

// AttachSession opens the user's preferred terminal and attaches to a session.
// Returns true if the profile was modified since the session was last started.
func (a *App) AttachSession(sessionID string) (bool, error) {
	return a.sessionMgr.Attach(sessionID)
}

// AttachSessionWithTerminal opens a specific terminal and attaches to a session.
// Returns true if the profile was modified since the session was last started.
func (a *App) AttachSessionWithTerminal(sessionID, terminalID string) (bool, error) {
	return a.sessionMgr.AttachWithTerminal(sessionID, terminalID)
}

// UpdateSession updates a session's profile and command, recreating the runtime session.
func (a *App) UpdateSession(sessionID, profileID, command string) error {
	return a.sessionMgr.Update(sessionID, profileID, command, inferRunMode(command), "", "", "", "")
}

// UpdateSessionWithOptions updates a session with explicit launch metadata.
func (a *App) UpdateSessionWithOptions(sessionID, profileID, command, runMode, hostID, codexConfigID, den, cwd string) error {
	return a.sessionMgr.Update(sessionID, profileID, command, runMode, hostID, codexConfigID, den, cwd)
}

// UpdateSessionWithOptionsV2 updates a session with plugin metadata.
func (a *App) UpdateSessionWithOptionsV2(req session.SessionUpdateRequest) error {
	return a.sessionMgr.UpdateWithRequest(req)
}

// KillSession terminates a session and removes it from storage.
func (a *App) KillSession(sessionID string) error {
	return a.sessionMgr.Kill(sessionID)
}

// DetachSession disconnects attached terminal clients while keeping the session alive.
func (a *App) DetachSession(sessionID string) error {
	return a.sessionMgr.Detach(sessionID)
}

// RestartSession recreates a dead runtime session using its stored configuration.
func (a *App) RestartSession(sessionID string) error {
	return a.sessionMgr.Restart(sessionID)
}

// OpenDen opens every burrow in a den using the stored order.
func (a *App) OpenDen(den string) (session.OpenDenResult, error) {
	return a.sessionMgr.OpenDen(den)
}

// GetDenOrder returns the persisted session order for a den.
func (a *App) GetDenOrder(den string) ([]string, error) {
	return a.sessionMgr.GetDenOrder(den)
}

// SaveDenOrder persists the explicit session order for a den.
func (a *App) SaveDenOrder(den string, sessionIDs []string) error {
	return a.sessionMgr.SaveDenOrder(den, sessionIDs)
}

// GetInstalledTerminals returns all installed terminal applications.
func (a *App) GetInstalledTerminals() []terminal.TerminalApp {
	return terminal.DetectInstalled()
}

// GetDefaultTerminal returns the user's configured default terminal.
func (a *App) GetDefaultTerminal() (string, error) {
	settings, err := config.LoadSettings()
	if err != nil {
		return "", err
	}

	// If no default set, auto-detect best available
	if settings.DefaultTerminal == "" {
		bestTerminal := terminal.GetDefaultTerminal()
		if bestTerminal != nil {
			return bestTerminal.ID, nil
		}
		return terminal.DefaultTerminalID(), nil
	}

	return settings.DefaultTerminal, nil
}

// SetDefaultTerminal sets the user's default terminal.
func (a *App) SetDefaultTerminal(terminalID string) error {
	settings, err := config.LoadSettings()
	if err != nil {
		settings = &config.Settings{}
	}

	settings.DefaultTerminal = terminalID
	return config.SaveSettings(settings)
}

// PickDirectory opens a native directory picker and returns the selected path.
func (a *App) PickDirectory(initialPath string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Select Workspace Directory",
		DefaultDirectory:     strings.TrimSpace(initialPath),
		CanCreateDirectories: true,
	})
}

// GetInventory returns the current host inventory.
func (a *App) GetInventory() (inventory.Inventory, error) {
	return a.invMgr.GetInventory()
}

// SaveInventory replaces the entire host inventory.
func (a *App) SaveInventory(inv inventory.Inventory) error {
	return a.invMgr.SaveInventory(inv)
}

// SaveInventoryDefaults updates default SSH values.
func (a *App) SaveInventoryDefaults(defaults inventory.HostDefaults) error {
	return a.invMgr.SaveDefaults(defaults)
}

// SaveHost creates or updates a host.
func (a *App) SaveHost(h inventory.Host) error {
	return a.invMgr.SaveHost(h)
}

// DeleteHost removes a host by ID.
func (a *App) DeleteHost(id string) error {
	return a.invMgr.DeleteHost(id)
}

// PreviewSSHConfigImport parses ~/.ssh/config and returns import candidates.
func (a *App) PreviewSSHConfigImport(path string) (inventory.SSHConfigImportPreview, error) {
	return a.invMgr.PreviewSSHConfigImport(path)
}

// ImportSSHConfig imports selected SSH config aliases into Mole hosts.
func (a *App) ImportSSHConfig(req inventory.SSHConfigImportRequest) error {
	return a.invMgr.ImportSSHConfig(req)
}

// SaveHostGroup creates or updates a host group.
func (a *App) SaveHostGroup(g inventory.HostGroup) error {
	return a.invMgr.SaveGroup(g)
}

// DeleteHostGroup removes a host group by ID.
func (a *App) DeleteHostGroup(id string) error {
	return a.invMgr.DeleteGroup(id)
}

// ExportBurrow returns the full portable burrow payload as formatted JSON.
func (a *App) ExportBurrow() (string, error) {
	if a.profileMgr == nil || a.invMgr == nil || a.sessionMgr == nil {
		return "", fmt.Errorf("burrow is not initialized")
	}

	profiles, err := a.profileMgr.List()
	if err != nil {
		return "", err
	}

	inv, err := a.invMgr.GetInventory()
	if err != nil {
		return "", err
	}

	sessions, err := a.sessionMgr.ExportBurrowSessions()
	if err != nil {
		return "", err
	}

	pluginConfigs := []pluginconfig.Config{}
	if a.pluginConfigMgr != nil {
		var pluginErr error
		pluginConfigs, pluginErr = a.pluginConfigMgr.List("")
		if pluginErr != nil {
			return "", pluginErr
		}
	}

	payload := workspace.Bundle{
		SchemaVersion: workspace.SchemaVersion,
		ExportedAt:    time.Now().Format(time.RFC3339Nano),
		Profiles:      profiles,
		Inventory:     inv,
		PluginConfigs: pluginConfigs,
		Sessions:      sessions,
	}

	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}

	return string(data), nil
}

// ImportBurrow replaces the current burrow with the provided JSON payload.
func (a *App) ImportBurrow(raw string) error {
	if a.profileMgr == nil || a.invMgr == nil || a.sessionMgr == nil {
		return fmt.Errorf("burrow is not initialized")
	}

	if strings.TrimSpace(raw) == "" {
		return fmt.Errorf("burrow payload cannot be empty")
	}

	var payload workspace.Bundle
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return fmt.Errorf("invalid burrow JSON: %w", err)
	}

	if payload.SchemaVersion != workspace.SchemaVersion {
		return fmt.Errorf("unsupported burrow schema version %d", payload.SchemaVersion)
	}

	profiles, err := a.profileMgr.PrepareImport(payload.Profiles)
	if err != nil {
		return err
	}

	inv := a.invMgr.PrepareImport(payload.Inventory)
	pluginConfigs := []pluginconfig.Config{}
	if a.pluginConfigMgr != nil {
		var pluginErr error
		pluginConfigs, pluginErr = a.pluginConfigMgr.PrepareImport(payload.PluginConfigs)
		if pluginErr != nil {
			return pluginErr
		}
	}

	profileIDs := make(map[string]struct{}, len(profiles))
	for _, p := range profiles {
		profileIDs[p.ID] = struct{}{}
	}

	hostIDs := make(map[string]struct{}, len(inv.Hosts))
	for _, host := range inv.Hosts {
		hostIDs[host.ID] = struct{}{}
	}

	pluginConfigIDs := make(map[string]struct{}, len(pluginConfigs))
	for _, cfg := range pluginConfigs {
		pluginConfigIDs[cfg.ID] = struct{}{}
	}

	sessions, err := a.sessionMgr.PrepareBurrowImport(payload.Sessions, profileIDs, hostIDs, pluginConfigIDs)
	if err != nil {
		return err
	}

	if err := a.sessionMgr.StopTrackedSessions(); err != nil {
		return err
	}
	if err := a.profileMgr.ReplaceAll(profiles); err != nil {
		return err
	}
	if err := a.invMgr.SaveInventory(inv); err != nil {
		return err
	}
	if a.pluginConfigMgr != nil {
		if err := a.pluginConfigMgr.ReplaceAll(pluginConfigs); err != nil {
			return err
		}
	}
	if err := a.sessionMgr.ReplaceAllImported(sessions); err != nil {
		return err
	}

	return nil
}

func inferRunMode(command string) string {
	if strings.TrimSpace(command) == "" {
		return session.RunModeShell
	}
	return session.RunModeCustom
}

func splitShellLike(input string) ([]string, error) {
	var tokens []string
	var current strings.Builder
	inSingle := false
	inDouble := false
	escaped := false

	for _, r := range input {
		switch {
		case escaped:
			current.WriteRune(r)
			escaped = false
		case r == '\\' && !inSingle:
			escaped = true
		case r == '\'' && !inDouble:
			inSingle = !inSingle
		case r == '"' && !inSingle:
			inDouble = !inDouble
		case unicode.IsSpace(r) && !inSingle && !inDouble:
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}

	if escaped || inSingle || inDouble {
		return nil, fmt.Errorf("引号或转义未闭合")
	}
	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}
	return tokens, nil
}

func inferScriptPath(tokens []string) (string, bool) {
	if len(tokens) < 2 {
		return "", false
	}
	exeName := strings.ToLower(filepath.Base(tokens[0]))
	args := tokens[1:]

	switch exeName {
	case "bash", "sh", "zsh":
		if len(args) >= 2 && args[0] == "-c" {
			return "", false
		}
		for _, arg := range args {
			if strings.HasPrefix(arg, "-") {
				continue
			}
			if strings.Contains(arg, "/") || strings.Contains(arg, `\`) || strings.HasSuffix(strings.ToLower(arg), ".sh") {
				return arg, true
			}
			return "", false
		}
	case "powershell", "powershell.exe", "pwsh", "pwsh.exe":
		for i := 0; i < len(args); i++ {
			if strings.EqualFold(args[i], "-File") || strings.EqualFold(args[i], "/File") {
				if i+1 < len(args) {
					return args[i+1], true
				}
			}
		}
	}

	return "", false
}

func expandUserHome(path string) string {
	if path == "" {
		return path
	}
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return path
		}
		if path == "~" {
			return home
		}
		return filepath.Join(home, path[2:])
	}
	return path
}

func (a *App) startTray() {
	if a.ctx == nil || a.sessionMgr == nil {
		return
	}

	a.trayOnce.Do(func() {
		go traymenu.Run(traymenu.Callbacks{
			OnShowWindow: a.showWindow,
			OnAttach: func(sessionID string) {
				if _, err := a.sessionMgr.Attach(sessionID); err != nil {
					log.Printf("[Tray] Attach failed for %s: %v", sessionID, err)
				}
			},
			OnQuit: func() {
				runtime.Quit(a.ctx)
			},
			GetSessions: a.traySessions,
		})
	})
}

func (a *App) showWindow() {
	if a.ctx == nil {
		return
	}

	showDockIcon()
	runtime.Show(a.ctx)
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
}

func (a *App) traySessions() []traymenu.SessionInfo {
	if a.sessionMgr == nil {
		return nil
	}

	sessions, err := a.sessionMgr.ListWithStatus()
	if err != nil {
		log.Printf("[Tray] Failed to list sessions: %v", err)
		return nil
	}

	sort.SliceStable(sessions, func(i, j int) bool {
		left := sessions[i]
		right := sessions[j]

		if left.Attached != right.Attached {
			return left.Attached
		}
		if left.Alive != right.Alive {
			return left.Alive
		}
		return strings.ToLower(left.Name) < strings.ToLower(right.Name)
	})

	result := make([]traymenu.SessionInfo, 0, len(sessions))
	for _, sess := range sessions {
		result = append(result, traymenu.SessionInfo{
			SessionID:   sess.ID,
			Name:        sess.Name,
			ProfileName: sess.ProfileName,
			Den:         sess.Den,
			Terminal:    a.defaultTerminalID(),
			Attached:    sess.Attached,
			Alive:       sess.Alive,
		})
	}

	return result
}

func (a *App) defaultTerminalID() string {
	settings, err := config.LoadSettings()
	if err != nil || settings.DefaultTerminal == "" {
		return terminal.GetDefaultTerminal().ID
	}
	return settings.DefaultTerminal
}

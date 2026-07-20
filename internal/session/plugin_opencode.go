package session

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"mole/internal/opencode"
)

type opencodePlugin struct {
	opencodeMgr *opencode.Manager
}

func NewOpencodePlugin(opencodeMgr *opencode.Manager) LaunchPlugin {
	return &opencodePlugin{opencodeMgr: opencodeMgr}
}

func (p *opencodePlugin) ID() string                 { return RunModeOpencode }
func (p *opencodePlugin) LabelKey() string           { return "burrows.runMode.opencode" }
func (p *opencodePlugin) HintKey() string            { return "burrows.runMode.opencodeHint" }
func (p *opencodePlugin) RequiresHost() bool         { return false }
func (p *opencodePlugin) RequiresCodex() bool        { return false }
func (p *opencodePlugin) RequiresOpencode() bool     { return true }
func (p *opencodePlugin) RequiresCommand() bool      { return false }
func (p *opencodePlugin) RequiresPluginConfig() bool { return false }

func (p *opencodePlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	if req.OpencodeConfigID == "" {
		return LaunchConfig{}, fmt.Errorf("opencode mode requires a selected opencode config")
	}
	return LaunchConfig{Command: "opencode", OpencodeConfigID: req.OpencodeConfigID}, nil
}

func (p *opencodePlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	return p.Validate(req)
}

func (p *opencodePlugin) Command(_ Session) (string, error) {
	return "opencode", nil
}

// PrepareEnv materializes the opencode.json template into the session's cwd so
// opencode reads it as project-level config (overriding the global one). It
// does not inject env directly: token/base_url come from the profile's EnvVars
// and opencode expands $VAR placeholders itself when parsing the config.
func (p *opencodePlugin) PrepareEnv(sess Session, env map[string]string, command string) (map[string]string, string, error) {
	if p.opencodeMgr == nil {
		return nil, "", fmt.Errorf("opencode configuration manager is unavailable")
	}
	cfg, err := p.opencodeMgr.Get(sess.OpencodeConfigID)
	if err != nil {
		return nil, "", err
	}
	if err := writeProjectOpencodeJSON(sess.Cwd, cfg.ConfigJSON); err != nil {
		return nil, "", err
	}
	return env, "opencode", nil
}

// writeProjectOpencodeJSON writes the opencode.json template into the session's
// cwd. An existing cwd/opencode.json is left untouched to protect any
// user-written project config.
func writeProjectOpencodeJSON(cwd, configJSON string) error {
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		return fmt.Errorf("opencode session requires a working directory")
	}
	if strings.TrimSpace(configJSON) == "" {
		return nil // nothing to materialize
	}
	if err := os.MkdirAll(cwd, 0o700); err != nil {
		return fmt.Errorf("failed to create session cwd: %w", err)
	}
	target := filepath.Join(cwd, "opencode.json")
	if _, err := os.Stat(target); err == nil {
		log.Printf("opencode: cwd already has opencode.json at %s; leaving it untouched", target)
		return nil
	}
	if err := os.WriteFile(target, []byte(configJSON), 0o644); err != nil {
		return fmt.Errorf("failed to write opencode.json: %w", err)
	}
	return nil
}

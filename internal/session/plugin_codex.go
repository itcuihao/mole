package session

import (
	"fmt"

	"mole/internal/codex"
)

type codexPlugin struct {
	codexMgr *codex.Manager
}

func NewCodexPlugin(codexMgr *codex.Manager) LaunchPlugin {
	return &codexPlugin{codexMgr: codexMgr}
}

func (p *codexPlugin) ID() string             { return RunModeCodex }
func (p *codexPlugin) LabelKey() string       { return "burrows.runMode.codex" }
func (p *codexPlugin) HintKey() string         { return "burrows.runMode.codexHint" }
func (p *codexPlugin) RequiresHost() bool      { return false }
func (p *codexPlugin) RequiresCodex() bool     { return true }
func (p *codexPlugin) RequiresCommand() bool   { return false }

func (p *codexPlugin) Validate(_, _, codexConfigID string) (LaunchConfig, error) {
	if codexConfigID == "" {
		return LaunchConfig{}, fmt.Errorf("codex mode requires a selected Codex config")
	}
	return LaunchConfig{Command: "codex", CodexConfigID: codexConfigID}, nil
}

func (p *codexPlugin) Resolve(_, _, codexConfigID string) (LaunchConfig, error) {
	return p.Validate("", "", codexConfigID)
}

func (p *codexPlugin) Command(_, _ string) (string, error) {
	return "codex", nil
}

func (p *codexPlugin) PrepareEnv(codexConfigID string, env map[string]string, command string) (map[string]string, string, error) {
	if p.codexMgr == nil {
		return nil, "", fmt.Errorf("Codex configuration manager is unavailable")
	}
	cfg, err := p.codexMgr.EnsureHome(codexConfigID)
	if err != nil {
		return nil, "", err
	}
	nextEnv := make(map[string]string, len(env)+1)
	for k, v := range env {
		nextEnv[k] = v
	}
	nextEnv["CODEX_HOME"] = cfg.HomeDir
	return nextEnv, "codex", nil
}

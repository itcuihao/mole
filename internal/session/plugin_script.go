package session

import (
	"fmt"
	"strings"

	"mole/internal/scriptcfg"
)

type scriptPlugin struct {
	scriptMgr *scriptcfg.Manager
}

func NewScriptPlugin(scriptMgr *scriptcfg.Manager) LaunchPlugin {
	return &scriptPlugin{scriptMgr: scriptMgr}
}

func (p *scriptPlugin) ID() string                 { return RunModeScript }
func (p *scriptPlugin) LabelKey() string           { return "burrows.runMode.script" }
func (p *scriptPlugin) HintKey() string            { return "burrows.runMode.scriptHint" }
func (p *scriptPlugin) RequiresHost() bool         { return false }
func (p *scriptPlugin) RequiresCodex() bool        { return false }
func (p *scriptPlugin) RequiresCommand() bool      { return false }
func (p *scriptPlugin) RequiresPluginConfig() bool { return false }

func (p *scriptPlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	if req.ScriptID == "" && strings.TrimSpace(req.Command) == "" {
		return LaunchConfig{}, fmt.Errorf("script mode requires a script preset or command")
	}
	return LaunchConfig{Command: req.Command, ScriptID: req.ScriptID}, nil
}

func (p *scriptPlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	if strings.TrimSpace(req.Command) != "" {
		return LaunchConfig{Command: req.Command, ScriptID: req.ScriptID}, nil
	}
	if req.ScriptID == "" {
		return LaunchConfig{}, fmt.Errorf("script mode requires a script preset or command")
	}
	if p.scriptMgr == nil {
		return LaunchConfig{}, fmt.Errorf("script manager is unavailable")
	}
	cfg, err := p.scriptMgr.Get(req.ScriptID)
	if err != nil {
		return LaunchConfig{}, fmt.Errorf("failed to resolve script preset %q: %w", req.ScriptID, err)
	}
	return LaunchConfig{Command: cfg.Command, ScriptID: req.ScriptID}, nil
}

func (p *scriptPlugin) Command(sess Session) (string, error) {
	if sess.ScriptID != "" && p.scriptMgr != nil {
		cfg, err := p.scriptMgr.Get(sess.ScriptID)
		if err == nil && strings.TrimSpace(cfg.Command) != "" {
			return cfg.Command, nil
		}
	}
	if strings.TrimSpace(sess.Command) != "" {
		return sess.Command, nil
	}
	return "", fmt.Errorf("script session has no command and preset could not be resolved")
}

func (p *scriptPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

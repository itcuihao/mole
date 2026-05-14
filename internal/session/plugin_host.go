package session

import (
	"fmt"

	"mole/internal/inventory"
)

type hostPlugin struct {
	invMgr *inventory.Manager
}

func NewHostPlugin(invMgr *inventory.Manager) LaunchPlugin {
	return &hostPlugin{invMgr: invMgr}
}

func (p *hostPlugin) ID() string                 { return RunModeHost }
func (p *hostPlugin) LabelKey() string           { return "burrows.runMode.host" }
func (p *hostPlugin) HintKey() string            { return "burrows.runMode.hostHint" }
func (p *hostPlugin) RequiresHost() bool         { return true }
func (p *hostPlugin) RequiresCodex() bool        { return false }
func (p *hostPlugin) RequiresCommand() bool      { return false }
func (p *hostPlugin) RequiresPluginConfig() bool { return false }

func (p *hostPlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	if req.HostID == "" {
		return LaunchConfig{}, fmt.Errorf("host mode requires a selected host")
	}
	return LaunchConfig{Command: req.Command, HostID: req.HostID}, nil
}

func (p *hostPlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	if req.HostID == "" {
		return LaunchConfig{}, fmt.Errorf("host mode requires a selected host")
	}
	if p.invMgr == nil {
		return LaunchConfig{}, fmt.Errorf("host inventory is unavailable")
	}
	hostCmd, err := p.invMgr.BuildSSHCommand(req.HostID)
	if err != nil {
		return LaunchConfig{}, fmt.Errorf("failed to resolve host command: %w", err)
	}
	return LaunchConfig{Command: hostCmd, HostID: req.HostID}, nil
}

func (p *hostPlugin) Command(sess Session) (string, error) {
	if p.invMgr == nil {
		return "", fmt.Errorf("host inventory is unavailable")
	}
	return p.invMgr.BuildSSHCommand(sess.HostID)
}

func (p *hostPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

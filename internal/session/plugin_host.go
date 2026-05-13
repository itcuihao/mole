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

func (p *hostPlugin) ID() string             { return RunModeHost }
func (p *hostPlugin) LabelKey() string       { return "burrows.runMode.host" }
func (p *hostPlugin) HintKey() string         { return "burrows.runMode.hostHint" }
func (p *hostPlugin) RequiresHost() bool      { return true }
func (p *hostPlugin) RequiresCodex() bool     { return false }
func (p *hostPlugin) RequiresCommand() bool   { return false }

func (p *hostPlugin) Validate(command, hostID, _ string) (LaunchConfig, error) {
	if hostID == "" {
		return LaunchConfig{}, fmt.Errorf("host mode requires a selected host")
	}
	return LaunchConfig{Command: command, HostID: hostID}, nil
}

func (p *hostPlugin) Resolve(_, hostID, _ string) (LaunchConfig, error) {
	if hostID == "" {
		return LaunchConfig{}, fmt.Errorf("host mode requires a selected host")
	}
	if p.invMgr == nil {
		return LaunchConfig{}, fmt.Errorf("host inventory is unavailable")
	}
	hostCmd, err := p.invMgr.BuildSSHCommand(hostID)
	if err != nil {
		return LaunchConfig{}, fmt.Errorf("failed to resolve host command: %w", err)
	}
	return LaunchConfig{Command: hostCmd, HostID: hostID}, nil
}

func (p *hostPlugin) Command(_, hostID string) (string, error) {
	if p.invMgr == nil {
		return "", fmt.Errorf("host inventory is unavailable")
	}
	return p.invMgr.BuildSSHCommand(hostID)
}

func (p *hostPlugin) PrepareEnv(_ string, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

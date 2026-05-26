package session

import (
	"fmt"
	"strings"

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
	if strings.TrimSpace(req.Command) != "" {
		return LaunchConfig{Command: req.Command, HostID: req.HostID}, nil
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
	var cmd string
	var err error
	if strings.TrimSpace(sess.Command) != "" {
		cmd = sess.Command
	} else {
		if p.invMgr == nil {
			return "", fmt.Errorf("host inventory is unavailable")
		}
		cmd, err = p.invMgr.BuildSSHCommand(sess.HostID)
		if err != nil {
			return "", err
		}
	}

	if sess.Cwd != "" && strings.HasPrefix(strings.TrimSpace(cmd), "ssh") {
		trimmed := strings.TrimSpace(cmd)
		if !strings.Contains(trimmed, " cd ") && !strings.Contains(trimmed, ";cd ") && !strings.Contains(trimmed, "&&") {
			if !strings.Contains(trimmed, " -t") && !strings.Contains(trimmed, " -tt") {
				trimmed = strings.Replace(trimmed, "ssh ", "ssh -t ", 1)
			}
			escapedCmd := fmt.Sprintf("cd %s && exec $SHELL -l", shellQuote(sess.Cwd))
			cmd = fmt.Sprintf("%s %s", trimmed, shellQuote(escapedCmd))
		}
	}
	return cmd, nil
}

func (p *hostPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

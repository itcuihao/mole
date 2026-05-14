package session

import (
	"fmt"
	"strings"

	"mole/internal/docker"
)

const RunModeDocker = "docker"

type dockerPlugin struct {
	dockerMgr *docker.Manager
}

func NewDockerPlugin(dockerMgr *docker.Manager) LaunchPlugin {
	return &dockerPlugin{dockerMgr: dockerMgr}
}

func (p *dockerPlugin) ID() string                 { return RunModeDocker }
func (p *dockerPlugin) LabelKey() string           { return "burrows.runMode.docker" }
func (p *dockerPlugin) HintKey() string            { return "burrows.runMode.dockerHint" }
func (p *dockerPlugin) RequiresHost() bool         { return false }
func (p *dockerPlugin) RequiresCodex() bool        { return false }
func (p *dockerPlugin) RequiresCommand() bool      { return false }
func (p *dockerPlugin) RequiresPluginConfig() bool { return false }

func (p *dockerPlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	if req.CodexConfigID == "" {
		return LaunchConfig{}, fmt.Errorf("docker mode requires a selected Docker config")
	}
	return LaunchConfig{Command: "docker", CodexConfigID: req.CodexConfigID}, nil
}

func (p *dockerPlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	if req.CodexConfigID == "" {
		return LaunchConfig{}, fmt.Errorf("docker mode requires a selected Docker config")
	}
	if p.dockerMgr == nil {
		return LaunchConfig{}, fmt.Errorf("docker manager is unavailable")
	}
	cmd, err := p.dockerMgr.BuildRunCommand(req.CodexConfigID)
	if err != nil {
		return LaunchConfig{}, fmt.Errorf("failed to build docker command: %w", err)
	}
	return LaunchConfig{Command: cmd, CodexConfigID: req.CodexConfigID}, nil
}

func (p *dockerPlugin) Command(sess Session) (string, error) {
	if p.dockerMgr == nil {
		return "", fmt.Errorf("docker manager is unavailable")
	}
	return p.dockerMgr.BuildRunCommand(strings.TrimSpace(sess.CodexConfigID))
}

func (p *dockerPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

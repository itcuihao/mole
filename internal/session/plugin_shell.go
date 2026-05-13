package session

type shellPlugin struct{}

func NewShellPlugin() LaunchPlugin { return &shellPlugin{} }

func (p *shellPlugin) ID() string             { return RunModeShell }
func (p *shellPlugin) LabelKey() string       { return "burrows.runMode.shell" }
func (p *shellPlugin) HintKey() string         { return "burrows.runMode.shellHint" }
func (p *shellPlugin) RequiresHost() bool      { return false }
func (p *shellPlugin) RequiresCodex() bool     { return false }
func (p *shellPlugin) RequiresCommand() bool   { return false }

func (p *shellPlugin) Validate(_, _, _ string) (LaunchConfig, error) {
	return LaunchConfig{}, nil
}

func (p *shellPlugin) Resolve(_, _, _ string) (LaunchConfig, error) {
	return LaunchConfig{}, nil
}

func (p *shellPlugin) Command(_, _ string) (string, error) {
	return "", nil
}

func (p *shellPlugin) PrepareEnv(_ string, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

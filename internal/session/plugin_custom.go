package session

type customPlugin struct{}

func NewCustomPlugin() LaunchPlugin { return &customPlugin{} }

func (p *customPlugin) ID() string             { return RunModeCustom }
func (p *customPlugin) LabelKey() string       { return "burrows.runMode.custom" }
func (p *customPlugin) HintKey() string         { return "burrows.runMode.customHint" }
func (p *customPlugin) RequiresHost() bool      { return false }
func (p *customPlugin) RequiresCodex() bool     { return false }
func (p *customPlugin) RequiresCommand() bool   { return true }

func (p *customPlugin) Validate(command, _, _ string) (LaunchConfig, error) {
	return LaunchConfig{Command: command}, nil
}

func (p *customPlugin) Resolve(command, _, _ string) (LaunchConfig, error) {
	return LaunchConfig{Command: command}, nil
}

func (p *customPlugin) Command(storedCommand, _ string) (string, error) {
	return storedCommand, nil
}

func (p *customPlugin) PrepareEnv(_ string, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

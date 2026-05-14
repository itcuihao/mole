package session

type customPlugin struct{}

func NewCustomPlugin() LaunchPlugin { return &customPlugin{} }

func (p *customPlugin) ID() string                 { return RunModeCustom }
func (p *customPlugin) LabelKey() string           { return "burrows.runMode.custom" }
func (p *customPlugin) HintKey() string            { return "burrows.runMode.customHint" }
func (p *customPlugin) RequiresHost() bool         { return false }
func (p *customPlugin) RequiresCodex() bool        { return false }
func (p *customPlugin) RequiresCommand() bool      { return true }
func (p *customPlugin) RequiresPluginConfig() bool { return false }

func (p *customPlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	return LaunchConfig{Command: req.Command}, nil
}

func (p *customPlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	return LaunchConfig{Command: req.Command}, nil
}

func (p *customPlugin) Command(sess Session) (string, error) {
	return sess.Command, nil
}

func (p *customPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

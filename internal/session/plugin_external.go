package session

import (
	"fmt"
	"strings"

	"mole/internal/pluginconfig"
)

type pluginConfigResolver interface {
	Require(id, pluginID string) (pluginconfig.Config, error)
}

type presetPlugin struct {
	id       string
	labelKey string
	hintKey  string
	resolver pluginConfigResolver
	build    func(pluginconfig.Config, LaunchRequest) (string, map[string]string, error)
}

func (p *presetPlugin) ID() string                 { return p.id }
func (p *presetPlugin) LabelKey() string           { return p.labelKey }
func (p *presetPlugin) HintKey() string            { return p.hintKey }
func (p *presetPlugin) RequiresHost() bool         { return false }
func (p *presetPlugin) RequiresCodex() bool        { return false }
func (p *presetPlugin) RequiresCommand() bool      { return false }
func (p *presetPlugin) RequiresPluginConfig() bool { return true }

func (p *presetPlugin) Validate(req LaunchRequest) (LaunchConfig, error) {
	cfg, err := p.loadPreset(req.PluginConfigID)
	if err != nil {
		return LaunchConfig{}, err
	}
	command, data, err := p.build(cfg, req)
	if err != nil {
		return LaunchConfig{}, err
	}
	return LaunchConfig{
		Command:        command,
		PluginConfigID: cfg.ID,
		PluginData:     data,
	}, nil
}

func (p *presetPlugin) Resolve(req LaunchRequest) (LaunchConfig, error) {
	return p.Validate(req)
}

func (p *presetPlugin) Command(sess Session) (string, error) {
	cfg, err := p.Resolve(LaunchRequest{
		PluginConfigID: sess.PluginConfigID,
		PluginData:     sess.PluginData,
	})
	if err != nil {
		return "", err
	}
	return cfg.Command, nil
}

func (p *presetPlugin) PrepareEnv(_ Session, env map[string]string, command string) (map[string]string, string, error) {
	return env, command, nil
}

func (p *presetPlugin) loadPreset(id string) (pluginconfig.Config, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return pluginconfig.Config{}, fmt.Errorf("%s mode requires a selected plugin config", p.id)
	}
	if p.resolver == nil {
		return pluginconfig.Config{}, fmt.Errorf("plugin config manager is unavailable")
	}
	return p.resolver.Require(id, p.id)
}

func NewK8sPodPlugin(resolver pluginConfigResolver) LaunchPlugin {
	return &presetPlugin{
		id:       RunModeK8sPod,
		labelKey: "burrows.runMode.k8sPod",
		hintKey:  "burrows.runMode.k8sPodHint",
		resolver: resolver,
		build:    buildK8sPodCommand,
	}
}

func NewCondaPlugin(resolver pluginConfigResolver) LaunchPlugin {
	return &presetPlugin{
		id:       RunModeConda,
		labelKey: "burrows.runMode.conda",
		hintKey:  "burrows.runMode.condaHint",
		resolver: resolver,
		build:    buildCondaCommand,
	}
}

func NewSSHConfigPlugin(resolver pluginConfigResolver) LaunchPlugin {
	return &presetPlugin{
		id:       RunModeSSHConfig,
		labelKey: "burrows.runMode.sshConfig",
		hintKey:  "burrows.runMode.sshConfigHint",
		resolver: resolver,
		build:    buildSSHConfigCommand,
	}
}

func NewTmuxAttachPlugin(resolver pluginConfigResolver) LaunchPlugin {
	return &presetPlugin{
		id:       RunModeTmuxAttach,
		labelKey: "burrows.runMode.tmuxAttach",
		hintKey:  "burrows.runMode.tmuxAttachHint",
		resolver: resolver,
		build:    buildTmuxAttachCommand,
	}
}

func NewRemoteTmuxPlugin(resolver pluginConfigResolver) LaunchPlugin {
	return &presetPlugin{
		id:       RunModeRemoteTmux,
		labelKey: "burrows.runMode.remoteTmux",
		hintKey:  "burrows.runMode.remoteTmuxHint",
		resolver: resolver,
		build:    buildRemoteTmuxCommand,
	}
}

func buildK8sPodCommand(cfg pluginconfig.Config, req LaunchRequest) (string, map[string]string, error) {
	settings := cfg.Settings
	namespace := strings.TrimSpace(settings["namespace"])
	if namespace == "" {
		namespace = "default"
	}
	podShell := strings.TrimSpace(settings["shell"])
	if podShell == "" {
		podShell = "/bin/sh"
	}
	podQuery := strings.TrimSpace(req.PluginData["pod_query"])
	if podQuery == "" {
		return "", nil, fmt.Errorf("k8s pod mode requires a pod name or selector")
	}

	kubectl := "kubectl"
	if kubeconfig := strings.TrimSpace(settings["kubeconfig_path"]); kubeconfig != "" {
		kubectl = "env KUBECONFIG=" + shellQuote(kubeconfig) + " kubectl"
	}
	base := kubectl + " -n " + shellQuote(namespace)

	var findPod string
	if strings.Contains(podQuery, "=") {
		findPod = fmt.Sprintf("%s get pods -l %s --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'", base, shellQuote(podQuery))
	} else {
		findPod = fmt.Sprintf("%s get pods --field-selector=status.phase=Running -o custom-columns=NAME:.metadata.name --no-headers | awk -v prefix=%s 'index($0, prefix) == 1 { print; exit }'", base, shellQuote(podQuery))
	}

	command := fmt.Sprintf("pod=$(%s); if [ -z \"$pod\" ]; then echo %s; exit 1; fi; exec %s exec -it \"$pod\" -- %s",
		findPod,
		shellQuote("No running pod matched "+podQuery),
		base,
		shellQuote(podShell),
	)
	return command, map[string]string{"pod_query": podQuery}, nil
}

func buildCondaCommand(cfg pluginconfig.Config, _ LaunchRequest) (string, map[string]string, error) {
	env := strings.TrimSpace(cfg.Settings["env"])
	if env == "" {
		return "", nil, fmt.Errorf("conda mode requires an environment name or path")
	}
	command := fmt.Sprintf("if [ -f \"$HOME/miniconda3/etc/profile.d/conda.sh\" ]; then . \"$HOME/miniconda3/etc/profile.d/conda.sh\"; elif [ -f \"$HOME/anaconda3/etc/profile.d/conda.sh\" ]; then . \"$HOME/anaconda3/etc/profile.d/conda.sh\"; else eval \"$(conda shell.bash hook)\"; fi; conda activate %s && exec \"${SHELL:-/bin/bash}\"", shellQuote(env))
	return command, nil, nil
}

func buildSSHConfigCommand(cfg pluginconfig.Config, _ LaunchRequest) (string, map[string]string, error) {
	host := strings.TrimSpace(cfg.Settings["host"])
	if host == "" {
		return "", nil, fmt.Errorf("ssh config mode requires a host")
	}
	return "exec ssh -t " + shellQuote(host), nil, nil
}

func buildTmuxAttachCommand(cfg pluginconfig.Config, _ LaunchRequest) (string, map[string]string, error) {
	sessionName := strings.TrimSpace(cfg.Settings["session_name"])
	if sessionName == "" {
		return "", nil, fmt.Errorf("tmux attach mode requires a session name")
	}
	return "exec env TMUX= tmux attach -t " + shellQuote(sessionName), nil, nil
}

func buildRemoteTmuxCommand(cfg pluginconfig.Config, _ LaunchRequest) (string, map[string]string, error) {
	target := strings.TrimSpace(cfg.Settings["ssh_target"])
	sessionName := strings.TrimSpace(cfg.Settings["session_name"])
	if target == "" {
		return "", nil, fmt.Errorf("remote tmux mode requires an ssh target")
	}
	if sessionName == "" {
		return "", nil, fmt.Errorf("remote tmux mode requires a session name")
	}
	remote := "tmux attach -t " + shellQuote(sessionName)
	return "exec ssh -t " + shellQuote(target) + " " + shellQuote(remote), nil, nil
}

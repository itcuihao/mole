package session

import "sort"

// LaunchRequest holds editable launch parameters before plugin normalization.
type LaunchRequest struct {
	Command        string            `json:"command,omitempty"`
	RunMode        string            `json:"run_mode,omitempty"`
	HostID         string            `json:"host_id,omitempty"`
	ScriptID       string            `json:"script_id,omitempty"`
	CodexConfigID  string            `json:"codex_config_id,omitempty"`
	PluginConfigID string            `json:"plugin_config_id,omitempty"`
	PluginData     map[string]string `json:"plugin_data,omitempty"`
}

// LaunchConfig holds the normalized launch parameters produced by a plugin.
type LaunchConfig struct {
	Command        string
	HostID         string
	ScriptID       string
	CodexConfigID  string
	PluginConfigID string
	PluginData     map[string]string
}

// LaunchPlugin defines launch behavior for one run mode.
type LaunchPlugin interface {
	ID() string
	LabelKey() string
	HintKey() string
	RequiresHost() bool
	RequiresCodex() bool
	RequiresCommand() bool
	RequiresPluginConfig() bool

	Validate(req LaunchRequest) (LaunchConfig, error)
	Resolve(req LaunchRequest) (LaunchConfig, error)
	Command(sess Session) (string, error)
	PrepareEnv(sess Session, env map[string]string, command string) (map[string]string, string, error)
}

// PluginInfo is the public metadata returned to the frontend.
type PluginInfo struct {
	ID                   string `json:"id"`
	LabelKey             string `json:"label_key"`
	HintKey              string `json:"hint_key"`
	RequiresHost         bool   `json:"requires_host"`
	RequiresCodex        bool   `json:"requires_codex"`
	RequiresCommand      bool   `json:"requires_command"`
	RequiresPluginConfig bool   `json:"requires_plugin_config"`
}

func pluginInfo(p LaunchPlugin) PluginInfo {
	return PluginInfo{
		ID:                   p.ID(),
		LabelKey:             p.LabelKey(),
		HintKey:              p.HintKey(),
		RequiresHost:         p.RequiresHost(),
		RequiresCodex:        p.RequiresCodex(),
		RequiresCommand:      p.RequiresCommand(),
		RequiresPluginConfig: p.RequiresPluginConfig(),
	}
}

// pluginRegistry is a sorted map of plugin ID → LaunchPlugin.
type pluginRegistry struct {
	plugins map[string]LaunchPlugin
	order   []string
}

func newPluginRegistry() *pluginRegistry {
	return &pluginRegistry{
		plugins: make(map[string]LaunchPlugin),
		order:   make([]string, 0),
	}
}

func (r *pluginRegistry) register(p LaunchPlugin) {
	id := p.ID()
	if _, exists := r.plugins[id]; !exists {
		r.order = append(r.order, id)
	}
	r.plugins[id] = p
}

func (r *pluginRegistry) get(id string) (LaunchPlugin, bool) {
	p, ok := r.plugins[id]
	return p, ok
}

func (r *pluginRegistry) listInfo() []PluginInfo {
	result := make([]PluginInfo, 0, len(r.order))
	for _, id := range r.order {
		if p, ok := r.plugins[id]; ok {
			result = append(result, pluginInfo(p))
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result
}

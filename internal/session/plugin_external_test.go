package session

import (
	"path/filepath"
	"strings"
	"testing"

	"mole/internal/pluginconfig"
)

func TestExternalPluginCommandGeneration(t *testing.T) {
	resolver := newTestPluginConfigResolver(t)

	tests := []struct {
		name         string
		plugin       LaunchPlugin
		configID     string
		data         map[string]string
		wantContains []string
	}{
		{
			name:     "k8s selector",
			plugin:   NewK8sPodPlugin(resolver),
			configID: "k8s",
			data:     map[string]string{"pod_query": "app=api"},
			wantContains: []string{
				"kubectl -n 'default' get pods -l 'app=api'",
				"exec env KUBECONFIG='/tmp/kubeconfig' kubectl -n 'default' exec -it \"$pod\" -- '/bin/sh'",
			},
		},
		{
			name:     "k8s name prefix",
			plugin:   NewK8sPodPlugin(resolver),
			configID: "k8s",
			data:     map[string]string{"pod_query": "api-"},
			wantContains: []string{
				"awk -v prefix='api-'",
				"exec env KUBECONFIG='/tmp/kubeconfig' kubectl -n 'default' exec -it \"$pod\" -- '/bin/sh'",
			},
		},
		{
			name:     "conda",
			plugin:   NewCondaPlugin(resolver),
			configID: "conda",
			wantContains: []string{
				"conda activate 'dev'",
			},
		},
		{
			name:     "ssh config",
			plugin:   NewSSHConfigPlugin(resolver),
			configID: "ssh",
			wantContains: []string{
				"exec ssh -t 'prod'",
			},
		},
		{
			name:     "tmux attach",
			plugin:   NewTmuxAttachPlugin(resolver),
			configID: "tmux",
			wantContains: []string{
				"exec env TMUX= tmux attach -t 'dev'",
			},
		},
		{
			name:     "remote tmux",
			plugin:   NewRemoteTmuxPlugin(resolver),
			configID: "remote",
			wantContains: []string{
				"exec ssh -t 'prod'",
				"tmux attach -t",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := tt.plugin.Resolve(LaunchRequest{
				PluginConfigID: tt.configID,
				PluginData:     tt.data,
			})
			if err != nil {
				t.Fatalf("Resolve() returned error: %v", err)
			}
			for _, want := range tt.wantContains {
				if !strings.Contains(cfg.Command, want) {
					t.Fatalf("command %q does not contain %q", cfg.Command, want)
				}
			}
		})
	}
}

func TestExternalPluginRequiresConfig(t *testing.T) {
	plugin := NewSSHConfigPlugin(newTestPluginConfigResolver(t))
	if _, err := plugin.Resolve(LaunchRequest{}); err == nil {
		t.Fatal("Resolve() returned nil error for missing config")
	}
}

func newTestPluginConfigResolver(t *testing.T) *pluginconfig.Manager {
	t.Helper()
	mgr := pluginconfig.NewManager(filepath.Join(t.TempDir(), "plugin_configs.json"))
	requests := []pluginconfig.SaveRequest{
		{ID: "k8s", Name: "K8s", PluginID: RunModeK8sPod, Settings: map[string]string{"kubeconfig_path": "/tmp/kubeconfig", "namespace": "default", "shell": "/bin/sh"}},
		{ID: "conda", Name: "Conda", PluginID: RunModeConda, Settings: map[string]string{"env": "dev"}},
		{ID: "ssh", Name: "SSH", PluginID: RunModeSSHConfig, Settings: map[string]string{"host": "prod"}},
		{ID: "tmux", Name: "Tmux", PluginID: RunModeTmuxAttach, Settings: map[string]string{"session_name": "dev"}},
		{ID: "remote", Name: "Remote", PluginID: RunModeRemoteTmux, Settings: map[string]string{"ssh_target": "prod", "session_name": "dev"}},
	}
	for _, req := range requests {
		if _, err := mgr.Save(req); err != nil {
			t.Fatalf("Save(%s) returned error: %v", req.ID, err)
		}
	}
	return mgr
}

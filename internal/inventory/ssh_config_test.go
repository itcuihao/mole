package inventory

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildSSHCommandUsesProxyCommandForJumpIdentity(t *testing.T) {
	defaults := HostDefaults{User: "shared", Port: 22}
	hostMap := map[string]Host{
		"jump": {
			ID:           "jump",
			Name:         "jump",
			Host:         "jump.example.com",
			User:         "jumper",
			Port:         2201,
			IdentityFile: "~/.ssh/jump",
		},
	}

	cmd := buildSSHCommand(Host{
		ID:           "target",
		Name:         "target",
		Host:         "prod.example.com",
		User:         "deploy",
		IdentityFile: "~/.ssh/prod",
		BastionID:    "jump",
		JumpHostIDs:  []string{"jump"},
	}, defaults, hostMap)

	expected := "ssh -i ~/.ssh/prod -o ProxyCommand='ssh -i ~/.ssh/jump -p 2201 -W %h:%p jumper@jump.example.com' deploy@prod.example.com"
	if cmd != expected {
		t.Fatalf("unexpected SSH command:\nwant: %s\ngot:  %s", expected, cmd)
	}
}

func TestPreviewSSHConfigImportResolvesChainAndConflicts(t *testing.T) {
	manager, configPath := newInventoryManagerWithConfig(t, `
Host bastion
  HostName bastion.example.com
  User jump
  Port 2201
  IdentityFile ~/.ssh/jump

Host prod
  HostName prod.example.com
  User deploy
  ProxyJump bastion
`)

	if err := manager.SaveInventory(Inventory{
		Version: 1,
		Defaults: HostDefaults{
			User: "",
			Port: 22,
		},
		Hosts: []Host{
			{
				ID:          "existing-bastion",
				Name:        "bastion",
				SourceAlias: "bastion",
				Host:        "bastion.example.com",
			},
		},
		Groups: []HostGroup{},
	}); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}

	preview, err := manager.PreviewSSHConfigImport(configPath)
	if err != nil {
		t.Fatalf("preview import: %v", err)
	}

	bastion := previewCandidateByAlias(t, preview, "bastion")
	if !bastion.Importable {
		t.Fatalf("expected bastion to be importable, got blocked: %s", bastion.BlockedReason)
	}
	if bastion.ConflictKind != "alias" {
		t.Fatalf("expected alias conflict, got %q", bastion.ConflictKind)
	}

	prod := previewCandidateByAlias(t, preview, "prod")
	if !prod.Importable {
		t.Fatalf("expected prod to be importable, got blocked: %s", prod.BlockedReason)
	}
	if len(prod.JumpAliases) != 1 || prod.JumpAliases[0] != "bastion" {
		t.Fatalf("unexpected jump chain: %#v", prod.JumpAliases)
	}
}

func TestPreviewSSHConfigImportBlocksInlineProxyJump(t *testing.T) {
	manager, configPath := newInventoryManagerWithConfig(t, `
Host prod
  HostName prod.example.com
  User deploy
  ProxyJump jump@example.com:2201
`)

	preview, err := manager.PreviewSSHConfigImport(configPath)
	if err != nil {
		t.Fatalf("preview import: %v", err)
	}

	prod := previewCandidateByAlias(t, preview, "prod")
	if prod.Importable {
		t.Fatalf("expected prod to be blocked")
	}
	if prod.BlockedReason == "" {
		t.Fatalf("expected blocked reason to be present")
	}
}

func newInventoryManagerWithConfig(t *testing.T, raw string) (*Manager, string) {
	t.Helper()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "ssh_config")
	if err := os.WriteFile(configPath, []byte(raw), 0o644); err != nil {
		t.Fatalf("write ssh config: %v", err)
	}

	manager := NewManager(filepath.Join(tmpDir, "hosts.json"))
	return manager, configPath
}

func previewCandidateByAlias(t *testing.T, preview SSHConfigImportPreview, alias string) SSHConfigImportCandidate {
	t.Helper()
	for _, candidate := range preview.Candidates {
		if candidate.Alias == alias {
			return candidate
		}
	}
	t.Fatalf("candidate %q not found", alias)
	return SSHConfigImportCandidate{}
}

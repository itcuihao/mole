package session

import (
	"path/filepath"
	"testing"
)

func TestPrepareWorkspaceImportNormalizesStaticSessions(t *testing.T) {
	manager := NewManagerWithBackends(filepath.Join(t.TempDir(), "sessions.json"), nil, nil, NewTmuxBackend())

	prepared, err := manager.PrepareWorkspaceImport([]WorkspaceSession{
		{
			ID:        "sess-1",
			Name:      "deploy-shell",
			ProfileID: "profile-1",
			BackendID: "unsupported-backend",
			Command:   "ssh deploy@example",
			RunMode:   RunModeHost,
			HostID:    "host-1",
		},
		{
			Name:      "custom-job",
			ProfileID: "profile-1",
			Command:   "npm run dev",
		},
	}, map[string]struct{}{
		"profile-1": {},
	}, map[string]struct{}{
		"host-1": {},
	})
	if err != nil {
		t.Fatalf("PrepareWorkspaceImport() returned error: %v", err)
	}

	if len(prepared) != 2 {
		t.Fatalf("len(prepared) = %d, want 2", len(prepared))
	}

	if got := prepared[0].BackendID; got != BackendIDTmux {
		t.Fatalf("prepared[0].BackendID = %q, want %q", got, BackendIDTmux)
	}
	if got := prepared[0].TmuxSessionName; got != "mole-deploy-shell" {
		t.Fatalf("prepared[0].TmuxSessionName = %q, want %q", got, "mole-deploy-shell")
	}
	if got := prepared[0].RunMode; got != RunModeHost {
		t.Fatalf("prepared[0].RunMode = %q, want %q", got, RunModeHost)
	}
	if got := prepared[0].HostID; got != "host-1" {
		t.Fatalf("prepared[0].HostID = %q, want %q", got, "host-1")
	}
	if prepared[0].CreatedAt == "" {
		t.Fatal("prepared[0].CreatedAt is empty, want a generated timestamp")
	}

	if got := prepared[1].RunMode; got != RunModeCustom {
		t.Fatalf("prepared[1].RunMode = %q, want %q", got, RunModeCustom)
	}
	if got := prepared[1].TmuxSessionName; got != "mole-custom-job" {
		t.Fatalf("prepared[1].TmuxSessionName = %q, want %q", got, "mole-custom-job")
	}
	if prepared[1].ID == "" {
		t.Fatal("prepared[1].ID is empty, want generated ID")
	}
}

func TestPrepareWorkspaceImportRejectsUnknownProfileReference(t *testing.T) {
	manager := NewManagerWithBackends(filepath.Join(t.TempDir(), "sessions.json"), nil, nil, NewTmuxBackend())

	_, err := manager.PrepareWorkspaceImport([]WorkspaceSession{
		{
			Name:      "broken-session",
			ProfileID: "missing-profile",
		},
	}, map[string]struct{}{}, map[string]struct{}{})
	if err == nil {
		t.Fatal("PrepareWorkspaceImport() returned nil error for missing profile reference")
	}
}

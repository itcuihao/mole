package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/session"
	"mole/internal/workspace"
)

func TestAppExportImportBurrowRoundTrip(t *testing.T) {
	source := newBurrowTestApp(t, filepath.Join(t.TempDir(), "source"))

	profiles, err := source.profileMgr.PrepareImport([]profile.Profile{
		{
			ID:          "profile-1",
			Name:        "Prod",
			Description: "Production secrets",
			Color:       "#10B981",
			EnvVars: map[string]string{
				"OPENAI_API_KEY": "secret-value",
			},
			SecretKeys: []string{"OPENAI_API_KEY"},
			CreatedAt:  time.Now().Format(time.RFC3339Nano),
		},
	})
	if err != nil {
		t.Fatalf("PrepareImport(profiles) failed: %v", err)
	}
	if err := source.profileMgr.ReplaceAll(profiles); err != nil {
		t.Fatalf("ReplaceAll(profiles) failed: %v", err)
	}

	inv := inventory.DefaultInventory()
	inv.Hosts = []inventory.Host{
		{
			ID:   "host-1",
			Name: "Prod App",
			Host: "10.0.0.5",
			User: "deploy",
			Tags: []string{"prod"},
		},
	}
	inv.Groups = []inventory.HostGroup{
		{
			ID:      "group-1",
			Name:    "Production",
			HostIDs: []string{"host-1"},
			Tags:    []string{"prod"},
		},
	}
	if err := source.invMgr.SaveInventory(inv); err != nil {
		t.Fatalf("SaveInventory() failed: %v", err)
	}

	preparedSessions, err := source.sessionMgr.PrepareBurrowImport([]session.WorkspaceSession{
		{
			ID:        "session-1",
			Name:      "prod-shell",
			ProfileID: "profile-1",
			RunMode:   session.RunModeHost,
			HostID:    "host-1",
			Command:   "ssh deploy@10.0.0.5",
			CreatedAt: time.Now().Format(time.RFC3339Nano),
		},
	}, map[string]struct{}{
		"profile-1": {},
	}, map[string]struct{}{
		"host-1": {},
	}, map[string]struct{}{})
	if err != nil {
		t.Fatalf("PrepareBurrowImport(sessions) failed: %v", err)
	}
	if err := source.sessionMgr.ReplaceAllImported(preparedSessions); err != nil {
		t.Fatalf("ReplaceAllImported() failed: %v", err)
	}

	exported, err := source.ExportBurrow()
	if err != nil {
		t.Fatalf("ExportBurrow() failed: %v", err)
	}

	var bundle workspace.Bundle
	if err := json.Unmarshal([]byte(exported), &bundle); err != nil {
		t.Fatalf("Unmarshal(exported) failed: %v", err)
	}
	if bundle.SchemaVersion != workspace.SchemaVersion {
		t.Fatalf("bundle.SchemaVersion = %d, want %d", bundle.SchemaVersion, workspace.SchemaVersion)
	}
	if len(bundle.Profiles) != 1 {
		t.Fatalf("len(bundle.Profiles) = %d, want 1", len(bundle.Profiles))
	}
	if len(bundle.Inventory.Hosts) != 1 {
		t.Fatalf("len(bundle.Inventory.Hosts) = %d, want 1", len(bundle.Inventory.Hosts))
	}
	if len(bundle.Sessions) != 1 {
		t.Fatalf("len(bundle.Sessions) = %d, want 1", len(bundle.Sessions))
	}

	target := newBurrowTestApp(t, filepath.Join(t.TempDir(), "target"))
	importResult, err := target.ImportBurrow(exported)
	if err != nil {
		t.Fatalf("ImportBurrow() failed: %v", err)
	}
	if !importResult.Success {
		t.Fatalf("ImportBurrow() returned unsuccessful result: %#v", importResult)
	}

	importedProfiles, err := target.profileMgr.List()
	if err != nil {
		t.Fatalf("target.profileMgr.List() failed: %v", err)
	}
	if len(importedProfiles) != 1 || importedProfiles[0].EnvVars["OPENAI_API_KEY"] != "secret-value" {
		t.Fatalf("imported profiles = %#v, want one profile with preserved secret env value", importedProfiles)
	}

	importedInventory, err := target.invMgr.GetInventory()
	if err != nil {
		t.Fatalf("target.invMgr.GetInventory() failed: %v", err)
	}
	if len(importedInventory.Hosts) != 1 || importedInventory.Hosts[0].ID != "host-1" {
		t.Fatalf("imported inventory hosts = %#v, want host-1", importedInventory.Hosts)
	}

	importedSessions, err := target.sessionMgr.ExportBurrowSessions()
	if err != nil {
		t.Fatalf("target.sessionMgr.ExportBurrowSessions() failed: %v", err)
	}
	if len(importedSessions) != 1 {
		t.Fatalf("len(importedSessions) = %d, want 1", len(importedSessions))
	}
	if importedSessions[0].Name != "prod-shell" || importedSessions[0].HostID != "host-1" {
		t.Fatalf("importedSessions[0] = %#v, want preserved static host session config", importedSessions[0])
	}
}

func TestAppImportBurrowRollsBackOnWriteFailure(t *testing.T) {
	dir := t.TempDir()
	profilesPath := filepath.Join(dir, "profiles.json")
	hostsPath := filepath.Join(dir, "missing", "hosts.json")
	sessionsPath := filepath.Join(dir, "sessions.json")

	profileMgr := profile.NewManager(profilesPath)
	invMgr := inventory.NewManager(hostsPath)
	sessionMgr := session.NewManagerWithBackends(sessionsPath, profileMgr, invMgr, session.NewTmuxBackend())
	app := &App{
		profileMgr: profileMgr,
		invMgr:     invMgr,
		sessionMgr: sessionMgr,
	}

	seedProfiles, err := profileMgr.PrepareImport([]profile.Profile{
		{
			ID:        "profile-old",
			Name:      "old",
			EnvVars:   map[string]string{"OLD_KEY": "old"},
			CreatedAt: time.Now().Format(time.RFC3339Nano),
		},
	})
	if err != nil {
		t.Fatalf("PrepareImport(seedProfiles) failed: %v", err)
	}
	if err := profileMgr.ReplaceAll(seedProfiles); err != nil {
		t.Fatalf("ReplaceAll(seedProfiles) failed: %v", err)
	}

	payload := workspace.Bundle{
		SchemaVersion: workspace.SchemaVersion,
		ExportedAt:    time.Now().Format(time.RFC3339Nano),
		Profiles: []profile.Profile{
			{
				ID:        "profile-new",
				Name:      "new",
				EnvVars:   map[string]string{"NEW_KEY": "new"},
				CreatedAt: time.Now().Format(time.RFC3339Nano),
			},
		},
		Inventory: inventory.DefaultInventory(),
		Sessions:  []session.WorkspaceSession{},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal(payload) failed: %v", err)
	}

	result, err := app.ImportBurrow(string(raw))
	if err != nil {
		t.Fatalf("ImportBurrow() returned unexpected error: %v", err)
	}
	if result.Success {
		t.Fatalf("ImportBurrow() = %#v, want failure", result)
	}
	if result.FailedStage != "replace_inventory" {
		t.Fatalf("result.FailedStage = %q, want replace_inventory", result.FailedStage)
	}
	if !result.RollbackTriggered || !result.RollbackSuccess {
		t.Fatalf("result rollback flags = triggered:%v success:%v, want true/true", result.RollbackTriggered, result.RollbackSuccess)
	}
	if !strings.Contains(result.Message, "replace_inventory") {
		t.Fatalf("result.Message = %q, want mention replace_inventory", result.Message)
	}

	gotProfiles, err := profileMgr.List()
	if err != nil {
		t.Fatalf("profileMgr.List() failed: %v", err)
	}
	if len(gotProfiles) != 1 || gotProfiles[0].ID != "profile-old" {
		t.Fatalf("profiles after rollback = %#v, want original profile-old", gotProfiles)
	}
}

func TestAppDeleteProfileBlocksWhenReferenced(t *testing.T) {
	app := newBurrowTestApp(t, filepath.Join(t.TempDir(), "delete-block"))

	profiles, err := app.profileMgr.PrepareImport([]profile.Profile{
		{
			ID:        "profile-1",
			Name:      "prod",
			EnvVars:   map[string]string{"A": "1"},
			CreatedAt: time.Now().Format(time.RFC3339Nano),
		},
	})
	if err != nil {
		t.Fatalf("PrepareImport(profiles) failed: %v", err)
	}
	if err := app.profileMgr.ReplaceAll(profiles); err != nil {
		t.Fatalf("ReplaceAll(profiles) failed: %v", err)
	}

	preparedSessions, err := app.sessionMgr.PrepareBurrowImport([]session.WorkspaceSession{
		{
			ID:        "session-1",
			Name:      "prod-shell",
			ProfileID: "profile-1",
		},
	}, map[string]struct{}{
		"profile-1": {},
	}, map[string]struct{}{}, map[string]struct{}{})
	if err != nil {
		t.Fatalf("PrepareBurrowImport(sessions) failed: %v", err)
	}
	if err := app.sessionMgr.ReplaceAllImported(preparedSessions); err != nil {
		t.Fatalf("ReplaceAllImported(sessions) failed: %v", err)
	}

	result, err := app.DeleteProfile("profile-1")
	if err != nil {
		t.Fatalf("DeleteProfile() failed: %v", err)
	}
	if result.Deleted {
		t.Fatalf("DeleteProfile() = %#v, want blocked deletion", result)
	}
	if result.Code != ProfileDeleteCodeInUse {
		t.Fatalf("result.Code = %q, want %q", result.Code, ProfileDeleteCodeInUse)
	}
	if len(result.References) != 1 || result.References[0].SessionID != "session-1" {
		t.Fatalf("result.References = %#v, want session-1 reference", result.References)
	}
}

func newBurrowTestApp(t *testing.T, dir string) *App {
	t.Helper()

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll(%q) failed: %v", dir, err)
	}

	profileMgr := profile.NewManager(filepath.Join(dir, "profiles.json"))
	invMgr := inventory.NewManager(filepath.Join(dir, "hosts.json"))
	sessionMgr := session.NewManagerWithBackends(filepath.Join(dir, "sessions.json"), profileMgr, invMgr, session.NewTmuxBackend())

	return &App{
		profileMgr: profileMgr,
		invMgr:     invMgr,
		sessionMgr: sessionMgr,
	}
}

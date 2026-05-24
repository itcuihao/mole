package workspace

import (
	"mole/internal/inventory"
	"mole/internal/pluginconfig"
	"mole/internal/profile"
	"mole/internal/session"
)

const SchemaVersion = 1

// Bundle is the portable burrow export payload.
type Bundle struct {
	SchemaVersion int                        `json:"schema_version"`
	ExportedAt    string                     `json:"exported_at"`
	Profiles      []profile.Profile          `json:"profiles"`
	Inventory     inventory.Inventory        `json:"inventory"`
	PluginConfigs []pluginconfig.Config      `json:"plugin_configs,omitempty"`
	Sessions      []session.WorkspaceSession `json:"sessions"`
}

// ImportResult summarizes the burrow import outcome for frontend UX and logs.
type ImportResult struct {
	Success           bool   `json:"success"`
	Message           string `json:"message,omitempty"`
	FailedStage       string `json:"failed_stage,omitempty"`
	RollbackTriggered bool   `json:"rollback_triggered,omitempty"`
	RollbackSuccess   bool   `json:"rollback_success,omitempty"`
}

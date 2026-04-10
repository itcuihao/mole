package workspace

import (
	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/session"
)

const SchemaVersion = 1

// Bundle is the portable workspace export payload.
type Bundle struct {
	SchemaVersion int                        `json:"schema_version"`
	ExportedAt    string                     `json:"exported_at"`
	Profiles      []profile.Profile          `json:"profiles"`
	Inventory     inventory.Inventory        `json:"inventory"`
	Sessions      []session.WorkspaceSession `json:"sessions"`
}

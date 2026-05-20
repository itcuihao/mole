package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"mole/internal/workspace"

	"github.com/spf13/cobra"
)

func newBurrowCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "burrow",
		Short: "Export or import the full workspace",
	}

	cmd.AddCommand(newBurrowExportCmd(state))
	cmd.AddCommand(newBurrowImportCmd(state))

	return cmd
}

func newBurrowExportCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "export [file]",
		Short: "Export workspace to stdout or a file",
		RunE: func(cmd *cobra.Command, args []string) error {
			payload, err := exportBurrow(state)
			if err != nil {
				return err
			}
			if len(args) > 0 {
				return os.WriteFile(args[0], []byte(payload), 0644)
			}
			fmt.Println(payload)
			return nil
		},
	}
	return cmd
}

func newBurrowImportCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "import <file>",
		Short: "Import workspace from a burrow JSON file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := os.ReadFile(args[0])
			if err != nil {
				return err
			}
			var bundle workspace.Bundle
			if err := json.Unmarshal(data, &bundle); err != nil {
				return fmt.Errorf("invalid burrow JSON: %w", err)
			}
			if bundle.SchemaVersion != workspace.SchemaVersion {
				return fmt.Errorf("unsupported burrow schema version %d", bundle.SchemaVersion)
			}

			profiles, err := state.ProfileMgr.PrepareImport(bundle.Profiles)
			if err != nil {
				return err
			}
			inv := state.InvMgr.PrepareImport(bundle.Inventory)

			profileIDs := make(map[string]struct{})
			for _, p := range profiles {
				profileIDs[p.ID] = struct{}{}
			}
			hostIDs := make(map[string]struct{})
			for _, h := range inv.Hosts {
				hostIDs[h.ID] = struct{}{}
			}

			sessions, err := state.SessionMgr.PrepareBurrowImport(bundle.Sessions, profileIDs, hostIDs, nil)
			if err != nil {
				return err
			}

			if err := state.ProfileMgr.ReplaceAll(profiles); err != nil {
				return err
			}
			if err := state.InvMgr.SaveInventory(inv); err != nil {
				return err
			}
			if err := state.SessionMgr.ReplaceAllImported(sessions); err != nil {
				return err
			}

			fmt.Printf("Imported: %d profiles, %d hosts, %d sessions\n",
				len(profiles), len(inv.Hosts), len(sessions))
			return nil
		},
	}
	return cmd
}

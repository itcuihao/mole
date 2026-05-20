package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

func newDenCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "den",
		Short: "Manage session dens (groups)",
	}

	cmd.AddCommand(newDenListCmd(state))
	cmd.AddCommand(newDenOpenCmd(state))

	return cmd
}

func newDenListCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "list",
		Short:   "List all dens with session counts",
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			statuses, err := state.SessionMgr.ListWithStatus()
			if err != nil {
				return err
			}
			denCounts := make(map[string]int)
			for _, s := range statuses {
				if s.Den != "" {
					denCounts[s.Den]++
				}
			}
			if len(denCounts) == 0 {
				fmt.Println("No dens found.")
				return nil
			}
			for name, count := range denCounts {
				fmt.Printf("  %s  (%d sessions)\n", name, count)
			}
			return nil
		},
	}
	return cmd
}

func newDenOpenCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "open <name>",
		Short: "Open all sessions in a den",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			result, err := state.SessionMgr.OpenDen(args[0])
			if err != nil {
				return err
			}
			fmt.Printf("Opened %d, skipped %d (already attached), failed %d\n",
				len(result.Opened), len(result.Skipped), len(result.Failed))
			for _, f := range result.Failed {
				fmt.Printf("  failed: %s - %s\n", f.Name, f.Error)
			}
			return nil
		},
	}
	return cmd
}

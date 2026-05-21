package cli

import (
	"fmt"
	"os"
	"time"

	"mole/internal/config"
	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/session"
	"mole/internal/workspace"

	"github.com/spf13/cobra"
)

// State holds initialized managers shared across subcommands.
type State struct {
	ProfileMgr *profile.Manager
	SessionMgr *session.Manager
	InvMgr     *inventory.Manager
}

// NewState initializes managers for CLI use.
func NewState() *State {
	invMgr := inventory.NewManager(config.HostsPath())
	profileMgr := profile.NewManager(config.ProfilesPath())
	sessionMgr := session.NewManager(config.SessionsPath(), profileMgr, invMgr)
	return &State{
		ProfileMgr: profileMgr,
		SessionMgr: sessionMgr,
		InvMgr:     invMgr,
	}
}

func newRootCmd() *cobra.Command {
	state := NewState()

	cmd := &cobra.Command{
		Use:           "mole",
		Short:         "Mole - AI terminal session manager",
		Long:          "Mole manages terminal sessions with AI provider profiles, SSH hosts, and more.",
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.AddCommand(newProfileCmd(state))
	cmd.AddCommand(newSessionCmd(state))
	cmd.AddCommand(newHostCmd(state))
	cmd.AddCommand(newSettingsCmd())
	cmd.AddCommand(newBurrowCmd(state))
	cmd.AddCommand(newDenCmd(state))
	cmd.AddCommand(newXbarCmd(state))

	return cmd
}

// Execute runs the CLI.
func Execute() {
	if err := newRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// exportBurrow is shared burrow export logic.
func exportBurrow(state *State) (string, error) {
	profiles, err := state.ProfileMgr.List()
	if err != nil {
		return "", err
	}
	inv, err := state.InvMgr.GetInventory()
	if err != nil {
		return "", err
	}
	sessions, err := state.SessionMgr.ExportBurrowSessions()
	if err != nil {
		return "", err
	}

	bundle := workspace.Bundle{
		SchemaVersion: workspace.SchemaVersion,
		ExportedAt:    time.Now().Format(time.RFC3339Nano),
		Profiles:      profiles,
		Inventory:     inv,
		Sessions:      sessions,
	}
	return marshalJSON(bundle)
}

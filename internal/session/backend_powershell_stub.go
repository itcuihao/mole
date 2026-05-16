//go:build !windows

package session

import (
	"fmt"

	"mole/internal/terminal"
)

func NewPowerShellBackend() SessionBackend {
	return unsupportedPowerShellBackend{}
}

type unsupportedPowerShellBackend struct{}

func (unsupportedPowerShellBackend) ID() string { return BackendIDPowerShell }
func (unsupportedPowerShellBackend) EnsureAvailable() error {
	return fmt.Errorf("powershell backend is only available on Windows")
}
func (unsupportedPowerShellBackend) Create(string, map[string]string, string, string, bool) error {
	return fmt.Errorf("powershell backend is only available on Windows")
}
func (unsupportedPowerShellBackend) List() ([]RuntimeSessionInfo, error) {
	return []RuntimeSessionInfo{}, nil
}
func (unsupportedPowerShellBackend) Kill(string) error                                  { return nil }
func (unsupportedPowerShellBackend) Detach(string) error                                { return nil }
func (unsupportedPowerShellBackend) IsAlive(string) bool                                { return false }
func (unsupportedPowerShellBackend) SyncEnv(string, map[string]string) error            { return nil }
func (unsupportedPowerShellBackend) BuildAttachSpec(string, map[string]string, string) (terminal.LaunchSpec, error) {
	return terminal.LaunchSpec{}, fmt.Errorf("powershell backend is only available on Windows")
}

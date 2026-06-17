// Package molecache owns the per-session runtime files that Mole writes
// under ~/.config/mole/cache/. Centralizing paths and lifecycle here keeps
// terminal launchers, tmux backends, and the session store from each
// inventing their own filename conventions.
//
// Three subdirectories:
//
//   cache/attach-env/<session-id>.sh    Written per attach so the shell can
//                                       `source` profile env before exec'ing
//                                       the tmux command. One per session;
//                                       overwritten on each attach.
//
//   cache/create-env/<session-id>.sh    Written once when the tmux session
//                                       is first created. Same content as
//                                       attach-env, kept separate so we can
//                                       blow away attach-env entries without
//                                       destroying the bootstrap env that
//                                       tmux replays for new panes.
//
//   cache/launch/<rand>.sh              Tiny shell snippet per launch — the
//                                       long attach command goes here, and
//                                       iTerm2's `write text` only invokes
//                                       `bash <path>`. Already cleaned up by
//                                       age (1h) by cleanupOldLaunchScripts.
//
// All files are owned by Mole; the directory itself is 0700. Burrow
// (user-visible) names are intentionally NOT used as filenames — session
// renames must not leave orphan files, and the session UUID is the stable
// identity throughout a Burrow's life.
package molecache

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mole/internal/config"
)

const (
	subdirAttachEnv = "attach-env"
	subdirCreateEnv = "create-env"
	subdirLaunch    = "launch"
)

// Dir returns the cache root, creating it if needed.
func Dir() (string, error) {
	if err := os.MkdirAll(filepath.Join(config.Dir(), "cache"), 0o700); err != nil {
		return "", fmt.Errorf("molecache: mkdir cache: %w", err)
	}
	return filepath.Join(config.Dir(), "cache"), nil
}

// AttachEnvPath returns the path to the per-session attach-env script.
func AttachEnvPath(sessionID string) (string, error) {
	if !validID(sessionID) {
		return "", fmt.Errorf("molecache: invalid session id %q", sessionID)
	}
	root, err := Dir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, subdirAttachEnv)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("molecache: mkdir attach-env: %w", err)
	}
	return filepath.Join(dir, sessionID+".sh"), nil
}

// CreateEnvPath returns the path to the per-session create-env script.
func CreateEnvPath(sessionID string) (string, error) {
	if !validID(sessionID) {
		return "", fmt.Errorf("molecache: invalid session id %q", sessionID)
	}
	root, err := Dir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, subdirCreateEnv)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("molecache: mkdir create-env: %w", err)
	}
	return filepath.Join(dir, sessionID+".sh"), nil
}

// LaunchScriptPath returns the path for a launch snippet with a caller-
// supplied base name (e.g. random hex).
func LaunchScriptPath(baseName string) (string, error) {
	if baseName == "" || strings.ContainsAny(baseName, "/\\") {
		return "", fmt.Errorf("molecache: invalid launch script base name %q", baseName)
	}
	root, err := Dir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, subdirLaunch)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("molecache: mkdir launch: %w", err)
	}
	return filepath.Join(dir, baseName+".sh"), nil
}

// RemoveSession removes every cache file belonging to a session.
// Errors are collected but not fatal — a missing file is not an error.
func RemoveSession(sessionID string) error {
	if !validID(sessionID) {
		return fmt.Errorf("molecache: invalid session id %q", sessionID)
	}
	root, err := Dir()
	if err != nil {
		return err
	}
	var firstErr error
	for _, sub := range []string{subdirAttachEnv, subdirCreateEnv} {
		p := filepath.Join(root, sub, sessionID+".sh")
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			firstErr = err
		}
	}
	return firstErr
}

// MigrateFromLegacyCache removes the old `.mole-*` files that previous
// Mole versions dropped directly into ~/.config/mole/. Safe to call on
// every startup — files that don't exist or don't match the legacy
// patterns are ignored. Returns the number of files removed.
func MigrateFromLegacyCache() (int, error) {
	legacyDir, err := Dir()
	if err != nil {
		return 0, err
	}
	legacyDir = filepath.Dir(legacyDir) // one level up: ~/.config/mole

	entries, err := os.ReadDir(legacyDir)
	if err != nil {
		return 0, nil // config dir may not exist yet on first run
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		// All three legacy prefixes are now safe to remove on startup:
		//   - `.mole-env-*` and `.mole-attach-env-*` are session-scoped
		//     and have no live counterpart (they were superseded by
		//     cache/create-env and cache/attach-env).
		//   - `.mole-launch-*` lived at the legacy root before launch
		//     scripts moved into cache/launch/. Any leftover file here
		//     is a one-shot script that's already been exec'd by iTerm2;
		//     removing it is safe and a new write will never happen here
		//     because writeTempLaunchScript now targets cache/launch/.
		if !strings.HasPrefix(name, ".mole-env-") &&
			!strings.HasPrefix(name, ".mole-attach-env-") &&
			!strings.HasPrefix(name, ".mole-launch-") {
			continue
		}
		if err := os.Remove(filepath.Join(legacyDir, name)); err == nil {
			removed++
		}
	}
	return removed, nil
}

// validID guards against path traversal: session ids are UUIDs in our store,
// but a defensive check here means a future id format change can't smuggle
// "../../etc/passwd" into a cache path.
func validID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if !(r == '-' || r == '_' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return false
		}
	}
	return true
}
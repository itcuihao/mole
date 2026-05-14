package inventory

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

type SSHConfigImportPreview struct {
	Path       string                     `json:"path"`
	Candidates []SSHConfigImportCandidate `json:"candidates"`
}

type SSHConfigImportCandidate struct {
	Alias            string   `json:"alias"`
	Name             string   `json:"name"`
	Host             string   `json:"host"`
	User             string   `json:"user,omitempty"`
	Port             int      `json:"port,omitempty"`
	IdentityFile     string   `json:"identity_file,omitempty"`
	JumpAliases      []string `json:"jump_aliases,omitempty"`
	Importable       bool     `json:"importable"`
	BlockedReason    string   `json:"blocked_reason,omitempty"`
	ConflictKind     string   `json:"conflict_kind,omitempty"`
	ConflictHostID   string   `json:"conflict_host_id,omitempty"`
	ConflictHostName string   `json:"conflict_host_name,omitempty"`
	Warnings         []string `json:"warnings,omitempty"`
}

type SSHConfigImportRequest struct {
	Path             string   `json:"path"`
	Aliases          []string `json:"aliases"`
	ConflictStrategy string   `json:"conflict_strategy"`
}

type sshConfigAlias struct {
	Alias        string
	HostName     string
	User         string
	Port         int
	IdentityFile string
	ProxyJump    string
}

type sshConfigResolvedHost struct {
	Host        Host
	JumpAliases []string
	Warnings    []string
}

type sshConfigParseResult struct {
	path     string
	aliases  map[string]sshConfigAlias
	resolved map[string]sshConfigResolvedHost
}

func (m *Manager) PreviewSSHConfigImport(path string) (SSHConfigImportPreview, error) {
	inv, err := m.GetInventory()
	if err != nil {
		return SSHConfigImportPreview{}, err
	}

	parsed, err := m.parseSSHConfig(path)
	if err != nil {
		return SSHConfigImportPreview{}, err
	}

	preview := SSHConfigImportPreview{
		Path:       parsed.path,
		Candidates: buildSSHConfigPreview(parsed, inv),
	}
	return preview, nil
}

func (m *Manager) ImportSSHConfig(req SSHConfigImportRequest) error {
	parsed, err := m.parseSSHConfig(req.Path)
	if err != nil {
		return err
	}

	selected := make(map[string]struct{}, len(req.Aliases))
	for _, alias := range req.Aliases {
		trimmed := strings.TrimSpace(alias)
		if trimmed != "" {
			selected[trimmed] = struct{}{}
		}
	}
	if len(selected) == 0 {
		return fmt.Errorf("select at least one SSH alias to import")
	}

	strategy := strings.TrimSpace(strings.ToLower(req.ConflictStrategy))
	if strategy == "" {
		strategy = "skip"
	}
	if strategy != "skip" && strategy != "overwrite" {
		return fmt.Errorf("unsupported conflict strategy %q", req.ConflictStrategy)
	}

	return m.store.Update(func(inv *Inventory) error {
		m.normalize(inv)
		importedIDs := make(map[string]string)

		var importAlias func(string, bool) (string, error)
		importAlias = func(alias string, dependency bool) (string, error) {
			if importedID, ok := importedIDs[alias]; ok {
				return importedID, nil
			}

			resolved, ok := parsed.resolved[alias]
			if !ok {
				return "", fmt.Errorf("SSH alias %q is unavailable for import", alias)
			}

			host := resolved.Host
			jumpIDs := make([]string, 0, len(resolved.JumpAliases))
			for _, jumpAlias := range resolved.JumpAliases {
				jumpID, jumpErr := importAlias(jumpAlias, true)
				if jumpErr != nil {
					return "", jumpErr
				}
				if jumpID == "" {
					return "", fmt.Errorf("SSH alias %q depends on %q, but that jump host was skipped", alias, jumpAlias)
				}
				jumpIDs = append(jumpIDs, jumpID)
			}
			host.JumpHostIDs = jumpIDs
			if len(jumpIDs) > 0 {
				host.BastionID = jumpIDs[0]
			} else {
				host.BastionID = ""
			}

			existing, conflictKind := findExistingImportedHost(*inv, host)
			if existing != nil {
				if strategy == "skip" {
					if conflictKind == "alias" {
						importedIDs[alias] = existing.ID
						return existing.ID, nil
					}
					if dependency {
						return "", fmt.Errorf("SSH alias %q conflicts with existing host %q and cannot be skipped as a dependency", alias, existing.Name)
					}
					importedIDs[alias] = ""
					return "", nil
				}
				host.ID = existing.ID
			}

			if host.ID == "" {
				host.ID = uuid.New().String()
			}

			replaced := false
			for i := range inv.Hosts {
				if inv.Hosts[i].ID == host.ID {
					inv.Hosts[i] = host
					replaced = true
					break
				}
			}
			if !replaced {
				inv.Hosts = append(inv.Hosts, host)
			}
			importedIDs[alias] = host.ID
			return host.ID, nil
		}

		aliases := make([]string, 0, len(selected))
		for alias := range selected {
			aliases = append(aliases, alias)
		}
		sort.Strings(aliases)

		for _, alias := range aliases {
			if _, ok := parsed.resolved[alias]; !ok {
				return fmt.Errorf("SSH alias %q was not found in %s", alias, parsed.path)
			}
			if _, err := importAlias(alias, false); err != nil {
				return err
			}
		}

		m.normalize(inv)
		return nil
	})
}

func (m *Manager) parseSSHConfig(path string) (sshConfigParseResult, error) {
	resolvedPath, err := resolveSSHConfigPath(path)
	if err != nil {
		return sshConfigParseResult{}, err
	}

	aliases, err := parseSSHConfigFile(resolvedPath)
	if err != nil {
		return sshConfigParseResult{}, err
	}

	resolved := make(map[string]sshConfigResolvedHost, len(aliases))
	keys := make([]string, 0, len(aliases))
	for alias := range aliases {
		keys = append(keys, alias)
	}
	sort.Strings(keys)

	for _, alias := range keys {
		host, resolveErr := resolveSSHConfigAlias(alias, aliases, nil)
		if resolveErr != nil {
			continue
		}
		resolved[alias] = host
	}

	return sshConfigParseResult{
		path:     resolvedPath,
		aliases:  aliases,
		resolved: resolved,
	}, nil
}

func resolveSSHConfigPath(path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		trimmed = "~/.ssh/config"
	}
	if strings.HasPrefix(trimmed, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		trimmed = filepath.Join(homeDir, strings.TrimPrefix(trimmed, "~/"))
	}
	absPath, err := filepath.Abs(trimmed)
	if err != nil {
		return "", err
	}
	return absPath, nil
}

func parseSSHConfigFile(path string) (map[string]sshConfigAlias, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	global := sshConfigAlias{}
	aliases := map[string]sshConfigAlias{}

	scanner := bufio.NewScanner(file)
	activeAliases := []string(nil)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		commentIndex := strings.Index(line, "#")
		if commentIndex >= 0 {
			line = strings.TrimSpace(line[:commentIndex])
		}
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		key := strings.ToLower(parts[0])
		value := strings.TrimSpace(line[len(parts[0]):])
		value = strings.TrimSpace(value)

		if key == "host" {
			activeAliases = activeAliases[:0]
			for _, alias := range strings.Fields(value) {
				if alias == "*" {
					activeAliases = []string{"*"}
					continue
				}
				if strings.ContainsAny(alias, "*?!") {
					continue
				}
				base := aliases[alias]
				base.Alias = alias
				aliases[alias] = base
				activeAliases = append(activeAliases, alias)
			}
			continue
		}

		applyField := func(target *sshConfigAlias) {
			switch key {
			case "hostname":
				target.HostName = value
			case "user":
				target.User = value
			case "port":
				port, convErr := strconv.Atoi(value)
				if convErr == nil {
					target.Port = port
				}
			case "identityfile":
				target.IdentityFile = value
			case "proxyjump":
				target.ProxyJump = value
			}
		}

		if len(activeAliases) == 0 {
			applyField(&global)
			continue
		}

		if len(activeAliases) == 1 && activeAliases[0] == "*" {
			applyField(&global)
			continue
		}

		for _, alias := range activeAliases {
			current := aliases[alias]
			applyField(&current)
			aliases[alias] = current
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	for alias, current := range aliases {
		if current.HostName == "" {
			current.HostName = alias
		}
		if current.User == "" {
			current.User = global.User
		}
		if current.Port == 0 {
			current.Port = global.Port
		}
		if current.IdentityFile == "" {
			current.IdentityFile = global.IdentityFile
		}
		if current.ProxyJump == "" {
			current.ProxyJump = global.ProxyJump
		}
		aliases[alias] = current
	}

	return aliases, nil
}

func resolveSSHConfigAlias(alias string, aliases map[string]sshConfigAlias, stack []string) (sshConfigResolvedHost, error) {
	if slicesContains(stack, alias) {
		return sshConfigResolvedHost{}, fmt.Errorf("cycle detected in ProxyJump chain for %q", alias)
	}

	entry, ok := aliases[alias]
	if !ok {
		return sshConfigResolvedHost{}, fmt.Errorf("SSH alias %q not found", alias)
	}

	host := Host{
		Name:         alias,
		SourceAlias:  alias,
		Host:         strings.TrimSpace(entry.HostName),
		User:         strings.TrimSpace(entry.User),
		Port:         entry.Port,
		IdentityFile: strings.TrimSpace(entry.IdentityFile),
		Tags:         []string{},
		JumpHostIDs:  []string{},
	}

	jumpAliases, err := resolveProxyJumpChain(alias, entry.ProxyJump, aliases, append(stack, alias))
	if err != nil {
		return sshConfigResolvedHost{}, err
	}

	return sshConfigResolvedHost{
		Host:        host,
		JumpAliases: jumpAliases,
	}, nil
}

func resolveProxyJumpChain(alias, raw string, aliases map[string]sshConfigAlias, stack []string) ([]string, error) {
	value := strings.TrimSpace(raw)
	if value == "" || strings.EqualFold(value, "none") {
		return []string{}, nil
	}

	jumpAliases := []string{}
	for _, item := range strings.Split(value, ",") {
		token := strings.TrimSpace(item)
		if token == "" {
			continue
		}
		if strings.ContainsAny(token, "@:%") {
			return nil, fmt.Errorf("SSH alias %q uses unsupported inline ProxyJump target %q; use the ssh_config plugin instead", alias, token)
		}
		if _, ok := aliases[token]; !ok {
			return nil, fmt.Errorf("SSH alias %q references ProxyJump alias %q that was not found", alias, token)
		}

		nested, err := resolveSSHConfigAlias(token, aliases, stack)
		if err != nil {
			return nil, err
		}
		jumpAliases = append(jumpAliases, nested.JumpAliases...)
		jumpAliases = append(jumpAliases, token)
	}

	return uniqueStrings(jumpAliases), nil
}

func buildSSHConfigPreview(parsed sshConfigParseResult, inv Inventory) []SSHConfigImportCandidate {
	existingByAlias := map[string]Host{}
	existingByName := map[string]Host{}
	for _, host := range inv.Hosts {
		if sourceAlias := strings.TrimSpace(strings.ToLower(host.SourceAlias)); sourceAlias != "" {
			existingByAlias[sourceAlias] = host
		}
		if name := strings.TrimSpace(strings.ToLower(host.Name)); name != "" {
			if _, exists := existingByName[name]; !exists {
				existingByName[name] = host
			}
		}
	}

	candidates := make([]SSHConfigImportCandidate, 0, len(parsed.aliases))
	keys := make([]string, 0, len(parsed.aliases))
	for alias := range parsed.aliases {
		keys = append(keys, alias)
	}
	sort.Strings(keys)

	for _, alias := range keys {
		resolved, resolveErr := resolveSSHConfigAlias(alias, parsed.aliases, nil)
		entry := parsed.aliases[alias]
		candidate := SSHConfigImportCandidate{
			Alias:        alias,
			Name:         alias,
			Host:         entry.HostName,
			User:         entry.User,
			Port:         entry.Port,
			IdentityFile: entry.IdentityFile,
			Importable:   resolveErr == nil,
		}

		if resolveErr != nil {
			candidate.BlockedReason = resolveErr.Error()
			candidates = append(candidates, candidate)
			continue
		}

		candidate.Host = resolved.Host.Host
		candidate.User = resolved.Host.User
		candidate.Port = resolved.Host.Port
		candidate.IdentityFile = resolved.Host.IdentityFile
		candidate.JumpAliases = resolved.JumpAliases

		if existing, ok := existingByAlias[strings.ToLower(alias)]; ok {
			candidate.ConflictKind = "alias"
			candidate.ConflictHostID = existing.ID
			candidate.ConflictHostName = existing.Name
		} else if existing, ok := existingByName[strings.ToLower(alias)]; ok {
			candidate.ConflictKind = "name"
			candidate.ConflictHostID = existing.ID
			candidate.ConflictHostName = existing.Name
		} else if duplicate := findDuplicateEndpoint(inv, resolved.Host); duplicate != nil {
			candidate.Warnings = append(candidate.Warnings, fmt.Sprintf("Potential duplicate of %s (%s)", duplicate.Name, duplicate.Host))
		}

		candidates = append(candidates, candidate)
	}

	return candidates
}

func findExistingImportedHost(inv Inventory, host Host) (*Host, string) {
	sourceAlias := strings.TrimSpace(strings.ToLower(host.SourceAlias))
	name := strings.TrimSpace(strings.ToLower(host.Name))

	for i := range inv.Hosts {
		existing := inv.Hosts[i]
		if sourceAlias != "" && strings.EqualFold(existing.SourceAlias, sourceAlias) {
			return &inv.Hosts[i], "alias"
		}
	}
	for i := range inv.Hosts {
		existing := inv.Hosts[i]
		if name != "" && strings.EqualFold(existing.Name, name) {
			return &inv.Hosts[i], "name"
		}
	}
	return nil, ""
}

func findDuplicateEndpoint(inv Inventory, host Host) *Host {
	targetKey := strings.ToLower(strings.TrimSpace(host.Host))
	if targetKey == "" {
		return nil
	}
	for i := range inv.Hosts {
		existing := inv.Hosts[i]
		if !strings.EqualFold(strings.TrimSpace(existing.Host), targetKey) {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(existing.User), strings.TrimSpace(host.User)) {
			continue
		}
		if existing.Port != host.Port {
			continue
		}
		return &inv.Hosts[i]
	}
	return nil
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func slicesContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

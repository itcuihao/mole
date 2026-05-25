package inventory

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HostHealth holds connection health metrics.
type HostHealth struct {
	HostID      string    `json:"host_id"`
	Online      bool      `json:"online"`
	LatencyMs   float64   `json:"latency_ms"`
	CPULoad     float64   `json:"cpu_load"`     // 1-minute load average
	MemoryUsage float64   `json:"memory_usage"` // memory usage percentage
	LastChecked time.Time `json:"last_checked"`
	Error       string    `json:"error,omitempty"`
}

// StartHealthTicker starts the background periodic health checking loop.
func (m *Manager) StartHealthTicker() {
	m.stopChan = make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		// Initial probe after startup
		time.Sleep(3 * time.Second)
		m.probeAllHosts()

		for {
			select {
			case <-ticker.C:
				m.probeAllHosts()
			case <-m.stopChan:
				return
			}
		}
	}()
}

// StopHealthTicker stops the health checker ticker.
func (m *Manager) StopHealthTicker() {
	if m.stopChan != nil {
		close(m.stopChan)
	}
}

// GetHostsHealth returns the cache of all host health metrics.
func (m *Manager) GetHostsHealth() map[string]HostHealth {
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()
	
	// Return a copy to avoid concurrent map read/write issues
	copyMap := make(map[string]HostHealth, len(m.healthCache))
	for k, v := range m.healthCache {
		copyMap[k] = v
	}
	return copyMap
}

func (m *Manager) probeAllHosts() {
	inv, err := m.store.Load()
	if err != nil {
		return
	}
	m.normalize(&inv)

	var wg sync.WaitGroup
	for _, host := range inv.Hosts {
		if !host.EnableHealthCheck {
			m.cacheMu.Lock()
			delete(m.healthCache, host.ID)
			m.cacheMu.Unlock()
			continue
		}

		wg.Add(1)
		go func(h Host) {
			defer wg.Done()
			health, _ := m.CheckHostHealth(h.ID)
			
			m.cacheMu.Lock()
			m.healthCache[h.ID] = health
			m.cacheMu.Unlock()
		}(host)
	}
	wg.Wait()
}

// CheckHostHealth performs a TCP connectivity check and queries remote server stats.
func (m *Manager) CheckHostHealth(hostID string) (HostHealth, error) {
	inv, err := m.store.Load()
	if err != nil {
		return HostHealth{HostID: hostID, Online: false, LastChecked: time.Now(), Error: err.Error()}, err
	}
	m.normalize(&inv)

	var selected *Host
	for i := range inv.Hosts {
		if inv.Hosts[i].ID == hostID {
			selected = &inv.Hosts[i]
			break
		}
	}
	if selected == nil {
		return HostHealth{HostID: hostID, Online: false, LastChecked: time.Now(), Error: "Host not found"}, fmt.Errorf("host %s not found", hostID)
	}

	defaults := inv.Defaults
	conn := resolveHostConnection(*selected, defaults)

	res := HostHealth{
		HostID:      hostID,
		LastChecked: time.Now(),
	}

	// 1. TCP Connect Probe
	address := net.JoinHostPort(conn.target, strconv.Itoa(conn.port))
	start := time.Now()
	dialer := net.Dialer{Timeout: 2 * time.Second}
	tcpConn, dialErr := dialer.Dial("tcp", address)
	if dialErr != nil {
		res.Online = false
		res.Error = dialErr.Error()
		return res, nil
	}
	tcpConn.Close()
	res.LatencyMs = float64(time.Since(start).Microseconds()) / 1000.0
	res.Online = true

	// 2. Query System CPU / Memory Stats
	sshCmdStr, err := m.BuildSSHCommand(hostID)
	if err != nil {
		return res, nil
	}

	parts := strings.Split(sshCmdStr, " ")
	if len(parts) > 0 && parts[0] == "ssh" {
		newParts := []string{"ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=2"}
		newParts = append(newParts, parts[1:]...)
		newParts = append(newParts, "uptime && (cat /proc/meminfo || free)")

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, newParts[0], newParts[1:]...)
		outputBytes, execErr := cmd.Output()
		if execErr == nil {
			output := string(outputBytes)
			cpu, mem := parseHealthStats(output)
			res.CPULoad = cpu
			res.MemoryUsage = mem
		}
	}

	return res, nil
}

func parseHealthStats(output string) (cpu float64, mem float64) {
	lines := strings.Split(output, "\n")
	var uptimeLine string
	var memLines []string
	for _, line := range lines {
		if strings.Contains(line, "load average") {
			uptimeLine = line
		} else if strings.Contains(line, "MemTotal") || strings.Contains(line, "MemAvailable") || strings.Contains(line, "Mem:") {
			memLines = append(memLines, line)
		}
	}

	if uptimeLine != "" {
		parts := strings.Split(uptimeLine, "load average:")
		if len(parts) > 1 {
			loadParts := strings.Split(parts[1], ",")
			if len(loadParts) > 0 {
				valStr := strings.TrimSpace(loadParts[0])
				if val, parseErr := strconv.ParseFloat(valStr, 64); parseErr == nil {
					cpu = val
				}
			}
		}
	}

	var total, avail float64
	for _, line := range memLines {
		if strings.Contains(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				total, _ = strconv.ParseFloat(fields[1], 64)
			}
		} else if strings.Contains(line, "MemAvailable:") {
			fields := strings.Fields(line)
			if len(fields) > 1 {
				avail, _ = strconv.ParseFloat(fields[1], 64)
			}
		}
	}

	if total > 0 && avail > 0 {
		mem = ((total - avail) / total) * 100.0
	} else {
		for _, line := range memLines {
			if strings.HasPrefix(strings.TrimSpace(line), "Mem:") {
				fields := strings.Fields(line)
				if len(fields) > 2 {
					tot, _ := strconv.ParseFloat(fields[1], 64)
					used, _ := strconv.ParseFloat(fields[2], 64)
					if tot > 0 {
						mem = (used / tot) * 100.0
					}
				}
			}
		}
	}

	return cpu, mem
}

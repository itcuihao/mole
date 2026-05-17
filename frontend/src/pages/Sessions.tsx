import { useState, useEffect, useCallback, useMemo } from 'react'
import { ListSessions, AttachSession, AttachSessionWithTerminal, KillSession, RestartSession, ListProfiles, GetInstalledTerminals, GetDefaultTerminal, GetInventory } from '../../wailsjs/go/main/App'
import { codex, docker, pluginconfig, session, profile, terminal, inventory } from '../../wailsjs/go/models'
import { Environment } from '../../wailsjs/runtime/runtime'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MOLE_OPEN_BURROW_EVENT, type MoleOpenBurrowDetail } from "@/lib/mascot-events"
import { useTranslation } from "@/i18n/context"
import { Bot, Box, Play, Plus, TerminalSquare, Pencil, Trash2, X, ChevronDown, ChevronUp, FolderGit2, Server, Wrench, CheckCircle2, ChevronRight, Search, MoreHorizontal, Copy, RotateCw, AlertTriangle } from "lucide-react"
import type { AppTab, NavigateContext } from '../App'

type SessionSortMode = 'most_used' | 'name' | 'profile'
type SessionRecord = session.SessionStatus & {
  run_mode?: string
  host_id?: string
  codex_config_id?: string
  plugin_config_id?: string
  plugin_data?: Record<string, string>
  cwd?: string
  den?: string
  open_count?: number
  last_opened_at?: string
}

type SessionDraft = {
  profileID: string
  backendID?: string
  runMode: string
  hostID: string
  codexConfigID?: string
  pluginConfigID?: string
  pluginData?: Record<string, string>
  execEnv?: 'local' | 'ssh'
  commandMode?: 'auto' | 'manual'
  scriptID?: string
  command: string
  cwd: string
  sessionName: string
  den: string
  sourceName?: string
}

type ScriptConfig = {
  id: string
  name: string
  description?: string
  platform?: string
  command: string
}

type ScriptPlatform = 'macos' | 'windows'
type RuntimeScriptPlatform = ScriptPlatform | 'other'

const SESSION_SORT_LABEL_KEYS: Record<SessionSortMode, string> = {
  most_used: 'burrows.sort.mostUsed',
  name: 'burrows.sort.nameAZ',
  profile: 'burrows.sort.profile',
}

const ALL_PROFILE_FILTER_VALUE = '__all_profiles__'
const NO_DEN_FILTER_VALUE = '__no_den__'
const BACKEND_WSL_TMUX = 'wsl-tmux'
const BACKEND_POWERSHELL = 'powershell'

const EXTERNAL_PLUGIN_IDS = ['k8s_pod', 'tmux_attach', 'remote_tmux']
const KNOWN_RUN_MODES = new Set(['shell', 'host', 'custom', 'codex', 'docker', ...EXTERNAL_PLUGIN_IDS])
const isExternalPluginMode = (mode: string) => EXTERNAL_PLUGIN_IDS.includes(mode)

const pluginConfigSummary = (pluginID: string, cfg?: pluginconfig.Config | null) => {
  const settings = cfg?.settings || {}
  if (!cfg) return '-'
  if (pluginID === 'k8s_pod') return `${settings.kubeconfig_path || '~/.kube/config'} · ${settings.namespace || 'default'} · ${settings.shell || '/bin/sh'}`
  if (pluginID === 'tmux_attach') return settings.session_name || '-'
  if (pluginID === 'remote_tmux') return `${settings.ssh_target || '-'} · ${settings.session_name || '-'}`
  return Object.values(settings).filter(Boolean).join(' · ') || '-'
}

const buildPluginCommandPreview = (mode: string, cfg?: pluginconfig.Config | null, pluginData: Record<string, string> = {}) => {
  const settings = cfg?.settings || {}
  if (!cfg) return '-'
  if (mode === 'k8s_pod') {
    const query = pluginData.pod_query || '<pod-name-or-selector>'
    const namespace = settings.namespace || 'default'
    const shell = settings.shell || '/bin/sh'
    const kubeconfig = settings.kubeconfig_path ? `KUBECONFIG=${settings.kubeconfig_path} ` : ''
    return `${kubeconfig}kubectl -n ${namespace} exec -it <first:${query}> -- ${shell}`
  }
  if (mode === 'tmux_attach') return `TMUX= tmux attach -t ${settings.session_name || '<session>'}`
  if (mode === 'remote_tmux') return `ssh -t ${settings.ssh_target || '<target>'} 'tmux attach -t ${settings.session_name || '<session>'}'`
  return '-'
}

const normalizeRunMode = (value?: string, hasCommand = false, availableModes?: Set<string>): string => {
  const modes = availableModes && availableModes.size > 0 ? availableModes : KNOWN_RUN_MODES
  if (value && modes.has(value)) {
    return value
  }
  return hasCommand ? 'custom' : 'shell'
}

const compareAlpha = (left: string, right: string) => (
  left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
)

const parseTimestamp = (value?: string) => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const normalizeScriptPlatform = (value?: string): ScriptPlatform | '' => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'macos' || normalized === 'windows') return normalized
  return ''
}

const resolveRuntimeScriptPlatform = (platform?: string): RuntimeScriptPlatform => {
  if (platform === 'darwin') return 'macos'
  if (platform === 'windows') return 'windows'
  return 'other'
}

const scriptPlatformMatchesRuntime = (cfg: ScriptConfig, runtimePlatform: RuntimeScriptPlatform) => {
  const platform = normalizeScriptPlatform(cfg.platform)
  if (!platform) return true
  if (runtimePlatform === 'other') return true
  return platform === runtimePlatform
}

const sessionPriority = (sess: SessionRecord) => {
  if (sess.attached) return 0
  if (sess.alive) return 1
  return 2
}

const compareSessions = (left: SessionRecord, right: SessionRecord) => {
  const priorityDiff = sessionPriority(left) - sessionPriority(right)
  if (priorityDiff !== 0) return priorityDiff

  // Open count first — stable, only changes when a session crosses another's count.
  const openCountDiff = (right.open_count || 0) - (left.open_count || 0)
  if (openCountDiff !== 0) return openCountDiff

  // Tiebreak by most recently opened.
  const recentDiff = parseTimestamp(right.last_opened_at) - parseTimestamp(left.last_opened_at)
  if (recentDiff !== 0) return recentDiff

  const createdDiff = parseTimestamp(right.created_at) - parseTimestamp(left.created_at)
  if (createdDiff !== 0) return createdDiff

  return compareAlpha(left.name || '', right.name || '')
}

const compareSessionsByName = (left: SessionRecord, right: SessionRecord) => {
  const nameDiff = compareAlpha(left.name || '', right.name || '')
  if (nameDiff !== 0) return nameDiff
  return compareSessions(left, right)
}

const compareSessionsByProfile = (left: SessionRecord, right: SessionRecord) => {
  const profileDiff = compareAlpha(left.profile_name || '', right.profile_name || '')
  if (profileDiff !== 0) return profileDiff
  return compareSessions(left, right)
}

const profileLabel = (item: profile.Profile) => item.name || ''
type HostRecord = inventory.Host & {
  source_alias?: string
  jump_host_ids?: string[]
}

const hostLabel = (host: HostRecord) => (host.name || host.host || '').trim()

const buildDuplicateSessionName = (baseName: string, existingNames: string[]) => {
  const normalizedBase = baseName.trim() || 'session'
  const nameSet = new Set(existingNames.map(name => name.trim().toLowerCase()).filter(Boolean))
  const firstCandidate = `${normalizedBase}-copy`

  if (!nameSet.has(firstCandidate.toLowerCase())) {
    return firstCandidate
  }

  let index = 2
  while (nameSet.has(`${firstCandidate}-${index}`.toLowerCase())) {
    index += 1
  }

  return `${firstCandidate}-${index}`
}

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

type HostConnection = {
  target: string
  user: string
  port: number
  identity: string
}

const hostJumpChain = (host?: HostRecord | null) => (
  (host?.jump_host_ids || []).filter(Boolean).length > 0
    ? (host?.jump_host_ids || []).filter(Boolean)
    : (host?.bastion_id ? [host.bastion_id] : [])
)

const resolveHostConnection = (host: HostRecord, defaults: inventory.HostDefaults): HostConnection => ({
  target: host.host || '',
  user: host.user || defaults.user || '',
  port: host.port || defaults.port || 22,
  identity: host.identity_file || defaults.identity_file || '',
})

const targetSpec = (conn: HostConnection) => (
  conn.user ? `${conn.user}@${conn.target}` : conn.target
)

const jumpSpec = (conn: HostConnection) => (
  conn.port && conn.port !== 22 ? `${targetSpec(conn)}:${conn.port}` : targetSpec(conn)
)

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\"'\"'`)}'`

const joinArgs = (args: string[]) => args.filter(Boolean).join(' ')

const ensureSshTTY = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('ssh')) return trimmed
  if (/(\s|^)-t(\s|$)/.test(trimmed) || /(\s|^)-tt(\s|$)/.test(trimmed)) return trimmed
  return trimmed.replace(/^ssh\b/, 'ssh -t')
}

const formatWorkspaceForCd = (workspace: string) => {
  const trimmed = workspace.trim()
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return trimmed
  }
  return trimmed
}

const withWorkspace = (workspace: string, command: string, fallbackToShell: boolean) => {
  const normalizedWorkspace = workspace.trim()
  const normalizedCommand = command.trim()
  if (!normalizedWorkspace) return normalizedCommand
  const workspaceArg = formatWorkspaceForCd(normalizedWorkspace)
  if (normalizedCommand) return `cd ${workspaceArg} && ${normalizedCommand}`
  if (!fallbackToShell) return ''
  return `cd ${workspaceArg} && exec $SHELL -l`
}

const buildResolvedCommand = ({
  execEnv,
  hostCommand,
  workspace,
  startupCommand,
}: {
  execEnv: 'local' | 'ssh'
  hostCommand: string
  workspace: string
  startupCommand: string
}) => {
  const normalizedStartup = startupCommand.trim()
  const normalizedHostCommand = hostCommand.trim()

  if (execEnv === 'local') {
    return withWorkspace(workspace, normalizedStartup, true)
  }

  if (!normalizedHostCommand) {
    return ''
  }

  const remoteCommand = withWorkspace(workspace, normalizedStartup, true)
  if (!remoteCommand) {
    return normalizedHostCommand
  }

  const sshPrefix = ensureSshTTY(normalizedHostCommand)
  return `${sshPrefix} ${shellQuote(remoteCommand)}`
}

const resolveSessionCommandForSubmit = ({
  execEnv,
  command,
  hostCommand,
  workspace,
  profileDefaultCommand,
}: {
  execEnv: 'local' | 'ssh'
  command: string
  hostCommand: string
  workspace: string
  profileDefaultCommand: string
}) => {
  const trimmed = command.trim()
  if (execEnv === 'ssh') {
    if (trimmed.startsWith('ssh ')) {
      return trimmed
    }
    const startup = trimmed || profileDefaultCommand.trim()
    return buildResolvedCommand({
      execEnv,
      hostCommand,
      workspace,
      startupCommand: startup,
    })
  }
  return trimmed
}

const buildNestedProxyCommand = (hops: HostConnection[]): string => {
  const last = hops[hops.length - 1]
  const args = ['ssh']
  if (last.identity) args.push('-i', last.identity)
  if (last.port && last.port !== 22) args.push('-p', String(last.port))
  if (hops.length > 1) {
    args.push('-o', `ProxyCommand=${shellQuote(buildNestedProxyCommand(hops.slice(0, -1)))}`)
  }
  args.push('-W', '%h:%p', targetSpec(last))
  return joinArgs(args)
}

const buildSSHCommand = (
  host: HostRecord,
  defaults: inventory.HostDefaults,
  hostMap: Map<string, HostRecord>
) => {
  if (!host.host) return ''
  const targetConn = resolveHostConnection(host, defaults)
  const parts = ['ssh']
  if (targetConn.identity) {
    parts.push('-i', targetConn.identity)
  }
  if (targetConn.port && targetConn.port !== 22) {
    parts.push('-p', String(targetConn.port))
  }
  const chainIDs = hostJumpChain(host)
  if (chainIDs.length > 0) {
    const hops = chainIDs
      .map(id => hostMap.get(id))
      .filter((item): item is HostRecord => Boolean(item?.host))
      .map(item => resolveHostConnection(item, defaults))

    if (hops.length > 0) {
      const canUseProxyJump = hops.every(hop => !hop.identity)
      if (canUseProxyJump) {
        parts.push('-J', hops.map(jumpSpec).join(','))
      } else {
        parts.push('-o', `ProxyCommand=${shellQuote(buildNestedProxyCommand(hops))}`)
      }
    }
  }
  parts.push(targetSpec(targetConn))
  return joinArgs(parts)
}

const findHostIDForCommand = (
  command: string,
  inv: inventory.Inventory,
  hostMap: Map<string, HostRecord>
) => {
  const normalized = command.trim()
  if (!normalized) return ''

  for (const host of inv.hosts as HostRecord[]) {
    const base = buildSSHCommand(host, inv.defaults, hostMap)
    if (!base) continue
    if (base === normalized || normalized.startsWith(`${base} `)) {
      return host.id
    }
  }

  return ''
}

const findScriptIDForCommand = (command: string, scripts: ScriptConfig[]) => {
  const normalized = command.trim()
  if (!normalized) return ''
  const found = scripts.find(item => (item.command || '').trim() === normalized)
  return found?.id || ''
}

const buildSessionStartupPreview = (sess: SessionRecord) => {
  const command = (sess.command || '').trim()
  if (!command) return ''

  const isSSH = sess.run_mode === 'host' || Boolean(sess.host_id) || command.startsWith('ssh ')
  if (isSSH) {
    return command
  }

  const workspace = (sess.cwd || '').trim()
  if (!workspace) {
    return command
  }

  if (/^cd\s+.+&&\s+/.test(command)) {
    return command
  }

  return `cd ${formatWorkspaceForCd(workspace)} && ${command}`
}

function CommandText({
  command,
  className,
}: {
  command: string
  className?: string
}) {
  const lines = command.split(/\r?\n/)

  return (
    <div className={cn('min-w-0 overflow-hidden font-mono leading-relaxed', className)}>
      {lines.map((line, lineIndex) => {
        const parts = line.match(/\S+/g) ?? []

        if (parts.length === 0) {
          return (
            <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : undefined}>
              <span className="block h-[1lh]" aria-hidden="true" />
            </div>
          )
        }

        return (
          <div
            key={lineIndex}
            className={cn('flex min-w-0 flex-wrap items-start gap-x-[1ch]', lineIndex > 0 && 'mt-1')}
          >
            {parts.map((part, partIndex) => (
              <span key={`${lineIndex}-${partIndex}`} className="whitespace-nowrap">
                {part}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function RunModeOption({
  mode,
  labelKey,
  activeMode,
  onSelect,
  disabled = false,
}: {
  mode: string
  labelKey: string
  activeMode: string
  onSelect: (mode: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const selected = mode === activeMode

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-primary bg-primary/8 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]'
          : 'border-border bg-background hover:border-primary/30 hover:bg-muted/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {t(labelKey)}
        </span>
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-transparent text-transparent'
          }`}
          aria-hidden="true"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

const getAppMethod = (method: string) => {
  return (window as any)?.go?.main?.App?.[method]
}

const LAST_WORKSPACE_STORAGE_KEY = 'mole:lastWorkspaceCwd'

const readLastWorkspace = () => {
  if (typeof window === 'undefined') return ''
  try {
    return (localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

const saveLastWorkspace = (cwd: string) => {
  if (typeof window === 'undefined') return
  const trimmed = cwd.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(LAST_WORKSPACE_STORAGE_KEY, trimmed)
  } catch {
    // ignore storage failures
  }
}

const createSessionWithOptions = (
  profileID: string,
  name: string,
  backendID: string,
  command: string,
  cwd: string,
  runMode: string,
  hostID: string,
  codexConfigID: string,
  pluginConfigID: string,
  pluginData: Record<string, string>,
  den: string,
) => {
  const v2Method = getAppMethod('CreateSessionWithOptionsV2')
  if (typeof v2Method === 'function') {
    return v2Method({
      profile_id: profileID,
      name,
      backend_id: backendID,
      command,
      cwd,
      run_mode: runMode,
      host_id: hostID,
      codex_config_id: codexConfigID,
      plugin_config_id: pluginConfigID,
      plugin_data: pluginData,
      den,
    }) as Promise<void>
  }
  const method = getAppMethod('CreateSessionWithOptions')
  if (typeof method !== 'function') {
    return Promise.reject(new Error('CreateSessionWithOptions is unavailable'))
  }
  return method(profileID, name, command, runMode, hostID, codexConfigID, den, cwd) as Promise<void>
}

const updateSessionWithOptions = (
  sessionID: string,
  profileID: string,
  backendID: string,
  command: string,
  cwd: string,
  runMode: string,
  hostID: string,
  codexConfigID: string,
  pluginConfigID: string,
  pluginData: Record<string, string>,
  den: string,
) => {
  const v2Method = getAppMethod('UpdateSessionWithOptionsV2')
  if (typeof v2Method === 'function') {
    return v2Method({
      session_id: sessionID,
      profile_id: profileID,
      backend_id: backendID,
      command,
      cwd,
      run_mode: runMode,
      host_id: hostID,
      codex_config_id: codexConfigID,
      plugin_config_id: pluginConfigID,
      plugin_data: pluginData,
      den,
    }) as Promise<void>
  }
  const method = getAppMethod('UpdateSessionWithOptions')
  if (typeof method !== 'function') {
    return Promise.reject(new Error('UpdateSessionWithOptions is unavailable'))
  }
  return method(sessionID, profileID, command, runMode, hostID, codexConfigID, den, cwd) as Promise<void>
}

const pickDirectory = (initialPath: string) => {
  const method = getAppMethod('PickDirectory')
  if (typeof method !== 'function') {
    return Promise.reject(new Error('PickDirectory is unavailable'))
  }
  return method(initialPath) as Promise<string>
}

function Sessions({
  onNavigate,
  newSessionSignal,
  burrowRefreshSignal,
  onDiscard,
  onNewSessionSignalHandled,
}: {
  onNavigate: (tab: AppTab, ctx?: NavigateContext) => void
  newSessionSignal?: number
  burrowRefreshSignal?: number
  onDiscard?: () => void
  onNewSessionSignalHandled?: () => void
}) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingSession, setEditingSession] = useState<SessionRecord | null>(null)
  const [duplicateDraft, setDuplicateDraft] = useState<SessionDraft | null>(null)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SessionSortMode>('name')
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedDenFilter, setSelectedDenFilter] = useState<string>('')
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>('')
  const [inventoryCount, setInventoryCount] = useState(0)
  const [sessionAction, setSessionAction] = useState<{ id: string, kind: 'open' | 'kill' | 'restart' } | null>(null)
  const [showDenOrderModal, setShowDenOrderModal] = useState(false)
  const [denOrderDraft, setDenOrderDraft] = useState<SessionRecord[]>([])
  const [denActionBusy, setDenActionBusy] = useState<'open' | 'restart' | 'save-order' | null>(null)

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListSessions()
        .then(data => setSessions((data || []) as SessionRecord[]))
        .catch(err => setError(String(err)))
    }
  }, [])

  const loadMeta = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      GetInstalledTerminals()
        .then(t => setTerminals(t || []))
        .catch(() => {})

      GetDefaultTerminal()
        .then(term => setDefaultTerminal(term || ''))
        .catch(() => {})

      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(() => {})

      GetInventory()
        .then(data => setInventoryCount((data?.hosts || []).length))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta, burrowRefreshSignal])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh, burrowRefreshSignal])

  useEffect(() => {
    if (!newSessionSignal) return
    setShowNewModal(true)
    onNewSessionSignalHandled?.()
  }, [newSessionSignal])

  const showTimedInfo = (text: string, duration = 7000) => {
    setInfoMessage(text)
    setTimeout(() => setInfoMessage(''), duration)
  }

  const showAttachHint = (terminalID: string, wasRestarted = false) => {
    const needsManualPaste = ['warp', 'alacritty', 'kitty', 'rio', 'ghostty'].includes(terminalID)

    if (needsManualPaste) {
      showTimedInfo(
        wasRestarted
          ? t('burrows.info.restoredPaste')
          : t('burrows.info.clipboardPaste')
      )
      return
    }

    if (wasRestarted) {
      showTimedInfo(t('burrows.info.restored'))
    }
  }

  const handleOpenSession = async (sess: SessionRecord, terminalID?: string) => {
    const resolvedTerminal = terminalID || defaultTerminal
    const wasRestarted = !sess.alive

    if (typeof window !== 'undefined') {
      const detail: MoleOpenBurrowDetail = { profileColor: sess.profile_color || '' }
      window.dispatchEvent(new CustomEvent<MoleOpenBurrowDetail>(MOLE_OPEN_BURROW_EVENT, { detail }))
    }

    setSessionAction({ id: sess.id, kind: 'open' })
    setError('')
    try {
      if (!sess.alive) {
        await RestartSession(sess.id)
      }

      const profileChanged = terminalID
        ? await AttachSessionWithTerminal(sess.id, terminalID)
        : await AttachSession(sess.id)

      if (profileChanged) {
        showTimedInfo(t('burrows.info.profileChanged'), 10000)
      }

      showAttachHint(resolvedTerminal, wasRestarted)
      refresh()
    } catch (err) {
      const errorMsg = String(err)
      console.error('❌ Open burrow failed:', errorMsg)
      setError(errorMsg)
    } finally {
      setSessionAction(null)
    }
  }

  const handleKill = async (sess: SessionRecord) => {
    setSessionAction({ id: sess.id, kind: 'kill' })
    setError('')
    try {
      await KillSession(sess.id)
      if (!sess.alive) {
        showTimedInfo(t('burrows.info.offlineRemoved'))
      }
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  const handleRestart = async (sess: SessionRecord) => {
    setSessionAction({ id: sess.id, kind: 'restart' })
    setError('')
    try {
      await RestartSession(sess.id)
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  const openDen = async () => {
    if (!selectedDenFilter || selectedDenFilter === NO_DEN_FILTER_VALUE) return
    const method = getAppMethod('OpenDen')
    if (typeof method !== 'function') {
      setError('OpenDen is unavailable')
      return
    }

    setDenActionBusy('open')
    setError('')
    try {
      const result = await method(selectedDenFilter)
      refresh()

      const opened = Array.isArray(result?.opened) ? result.opened.length : 0
      const skipped = Array.isArray(result?.skipped) ? result.skipped.length : 0
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const pieces = [
        t('burrows.den.openSummary', { den: selectedDenFilter, opened, skipped, failed }),
      ]
      if (failed > 0) {
        const failedNames = result.failed.map((item: { name?: string }) => item.name || 'unknown').join(', ')
        pieces.push(t('burrows.den.openFailedList', { names: failedNames }))
      }
      showTimedInfo(pieces.join(' '), 9000)
    } catch (err) {
      setError(String(err))
    } finally {
      setDenActionBusy(null)
    }
  }

  const restartDen = async () => {
    if (!selectedDenFilter || selectedDenFilter === NO_DEN_FILTER_VALUE) return

    const denSessions = sessions.filter(s => (s.den || '').trim() === selectedDenFilter)
    if (denSessions.length === 0) return

    const getOrder = getAppMethod('GetDenOrder')
    let orderedIDs: string[] = []
    if (typeof getOrder === 'function') {
      try {
        orderedIDs = await getOrder(selectedDenFilter)
      } catch {
        orderedIDs = []
      }
    }

    const byID = new Map(denSessions.map(item => [item.id, item]))
    const orderedSessions: SessionRecord[] = []
    const seen = new Set<string>()
    orderedIDs.forEach(id => {
      const match = byID.get(id)
      if (!match) return
      orderedSessions.push(match)
      seen.add(id)
    })
    denSessions.forEach(item => {
      if (seen.has(item.id)) return
      orderedSessions.push(item)
    })

    setDenActionBusy('restart')
    setError('')
    try {
      const restarted: string[] = []
      const failed: Array<{ id: string; name: string; error: string }> = []

      for (const sess of orderedSessions) {
        try {
          await RestartSession(sess.id)
          restarted.push(sess.id)
        } catch (err) {
          failed.push({
            id: sess.id,
            name: sess.name || sess.id,
            error: String(err),
          })
        }
      }

      refresh()

      const pieces = [
        t('burrows.den.restartSummary', {
          den: selectedDenFilter,
          restarted: restarted.length,
          failed: failed.length,
        }),
      ]
      if (failed.length > 0) {
        pieces.push(t('burrows.den.restartFailedList', { names: failed.map(item => item.name).join(', ') }))
      }
      showTimedInfo(pieces.join(' '), 9000)
    } finally {
      setDenActionBusy(null)
    }
  }

  const openDenOrderEditor = async () => {
    if (!selectedDenFilter || selectedDenFilter === NO_DEN_FILTER_VALUE) return
    const method = getAppMethod('GetDenOrder')
    const denSessions = sessions.filter(s => (s.den || '').trim() === selectedDenFilter)
    if (denSessions.length === 0) return

    let orderedIDs: string[] = []
    if (typeof method === 'function') {
      try {
        orderedIDs = await method(selectedDenFilter)
      } catch {
        orderedIDs = []
      }
    }

    const byID = new Map(denSessions.map(item => [item.id, item]))
    const ordered: SessionRecord[] = []
    const seen = new Set<string>()
    orderedIDs.forEach(id => {
      const match = byID.get(id)
      if (!match) return
      ordered.push(match)
      seen.add(id)
    })
    denSessions.forEach(item => {
      if (seen.has(item.id)) return
      ordered.push(item)
    })

    setDenOrderDraft(ordered)
    setShowDenOrderModal(true)
  }

  const moveDenSession = (index: number, direction: -1 | 1) => {
    setDenOrderDraft(prev => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const saveDenOrder = async () => {
    if (!selectedDenFilter || selectedDenFilter === NO_DEN_FILTER_VALUE) return
    const method = getAppMethod('SaveDenOrder')
    if (typeof method !== 'function') {
      setError('SaveDenOrder is unavailable')
      return
    }

    setDenActionBusy('save-order')
    setError('')
    try {
      await method(selectedDenFilter, denOrderDraft.map(item => item.id))
      setShowDenOrderModal(false)
      showTimedInfo(t('burrows.den.orderSaved', { den: selectedDenFilter }))
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setDenActionBusy(null)
    }
  }

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])
  const denOptions = useMemo(() => {
    const denCount = new Map<string, { den: string; count: number }>()
    for (const s of sessions) {
      const den = (s.den || '').trim()
      const key = den || NO_DEN_FILTER_VALUE
      const current = denCount.get(key)
      if (current) {
        current.count += 1
      } else {
        denCount.set(key, { den, count: 1 })
      }
    }

    return Array.from(denCount.entries())
      .map(([key, meta]) => ({
        key,
        den: meta.den,
        count: meta.count,
      }))
      .sort((a, b) => {
        if (!a.den && b.den) return 1
        if (a.den && !b.den) return -1
        return compareAlpha(a.den, b.den)
      })
  }, [sessions])

  const sortedSessions = useMemo(() => {
    const base = [...sessions]
    switch (sortMode) {
      case 'name':
        return base.sort(compareSessionsByName)
      case 'profile':
        return base.sort(compareSessionsByProfile)
      case 'most_used':
      default:
        return base.sort(compareSessions)
    }
  }, [sessions, sortMode])

  const sessionsByDen = useMemo(() => {
    if (!selectedDenFilter) {
      return sortedSessions
    }

    return sortedSessions.filter(s => {
      const den = (s.den || '').trim()
      if (selectedDenFilter === NO_DEN_FILTER_VALUE) {
        return !den
      }
      return den === selectedDenFilter
    })
  }, [sortedSessions, selectedDenFilter])

  const profilesInUse = useMemo(() => {
    const usedIds = new Set(sessionsByDen.map(s => s.profile_id).filter(Boolean))
    return profiles
      .filter(p => usedIds.has(p.id))
      .sort((a, b) => compareAlpha(a.name || '', b.name || ''))
  }, [sessionsByDen, profiles])

  useEffect(() => {
    if (!selectedDenFilter) return
    if (!denOptions.some(option => option.key === selectedDenFilter)) {
      setSelectedDenFilter('')
    }
  }, [selectedDenFilter, denOptions])

  useEffect(() => {
    if (!selectedProfileFilter) return
    if (!profilesInUse.some(p => p.id === selectedProfileFilter)) {
      setSelectedProfileFilter('')
    }
  }, [selectedProfileFilter, profilesInUse])

  const filteredSessions = useMemo(() => {
    let result = sessionsByDen
    if (selectedProfileFilter) {
      result = result.filter(s => s.profile_id === selectedProfileFilter)
    }
    if (normalizedQuery) {
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
      result = result.filter(s => {
        const name = (s.name || '').toLowerCase()
        return tokens.every(token => name.includes(token))
      })
    }
    return result
  }, [sessionsByDen, selectedProfileFilter, normalizedQuery])

  const handleDuplicateSession = useCallback((sess: SessionRecord) => {
    setDuplicateDraft({
      profileID: sess.profile_id,
      backendID: sess.backend_id || '',
      runMode: normalizeRunMode(sess.run_mode, Boolean(sess.command)),
      hostID: sess.host_id || '',
      codexConfigID: sess.codex_config_id || '',
      pluginConfigID: sess.plugin_config_id || '',
      pluginData: sess.plugin_data || {},
      commandMode: sess.run_mode === 'custom' ? 'manual' : 'auto',
      command: sess.command || '',
      cwd: sess.cwd || '',
      den: sess.den || '',
      sessionName: buildDuplicateSessionName(
        sess.name || 'session',
        sessions.map(item => item.name || ''),
      ),
      sourceName: sess.name || '',
    })
  }, [sessions])

  return (
    <div className="min-w-0 h-full flex flex-col gap-4">
      <div className="shrink-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('burrows.title')}</h1>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {sessions.length > 0 && (
              <Select value={sortMode} onValueChange={value => setSortMode(value as SessionSortMode)}>
                <SelectTrigger className="h-9 w-full rounded-xl border-border/80 bg-background/80 sm:w-[148px]">
                  <SelectValue aria-label={t('burrows.sortedBy', { mode: t(SESSION_SORT_LABEL_KEYS[sortMode]) })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="most_used">{t('burrows.sort.mostUsed')}</SelectItem>
                  <SelectItem value="name">{t('burrows.sort.nameAZ')}</SelectItem>
                  <SelectItem value="profile">{t('burrows.sort.profile')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {sessions.length > 0 && (
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('burrows.searchPlaceholder')}
                  aria-label={t('burrows.searchAriaLabel')}
                  className="h-9 w-full pl-8 pr-8 sm:w-56"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t('burrows.clearSearch')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <Button onClick={() => setShowNewModal(true)} size="sm">
              <Plus className="w-4 h-4" />
              {t('burrows.newBurrow')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm flex items-start justify-between gap-2">
            <span className="flex-1">{error}</span>
            <Button onClick={() => setError('')} variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-destructive/20">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/30 rounded-lg text-foreground text-sm flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2 flex-1">
              <TerminalSquare className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span className="flex-1 leading-relaxed">{infoMessage}</span>
            </div>
            <Button onClick={() => setInfoMessage('')} variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20 rounded-full">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {sessions.length > 0 && (
          <>
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDenFilter('')}
                  aria-pressed={!selectedDenFilter}
                  className={`interactive-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    !selectedDenFilter
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  {t('burrows.den.all')}
                  <span className="text-[11px] opacity-80">{sessions.length}</span>
                </button>
                {denOptions.map(option => {
                  const isSelected = selectedDenFilter === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedDenFilter(isSelected ? '' : option.key)}
                      aria-pressed={isSelected}
                      className={`interactive-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      }`}
                    >
                      <span>{option.den || t('burrows.den.none')}</span>
                      <span className="text-[11px] opacity-80">{option.count}</span>
                    </button>
                  )
                })}
              </div>
              {selectedDenFilter && selectedDenFilter !== NO_DEN_FILTER_VALUE && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={openDen} size="sm" disabled={denActionBusy !== null} className="shadow-sm">
                    <Play className="w-3.5 h-3.5" />
                    {denActionBusy === 'open' ? t('burrows.den.opening') : t('burrows.den.open')}
                  </Button>
                  <Button onClick={restartDen} variant="secondary" size="sm" disabled={denActionBusy !== null}>
                    <RotateCw className="w-3.5 h-3.5" />
                    {denActionBusy === 'restart' ? t('burrows.den.restarting') : t('burrows.den.restart')}
                  </Button>
                  <Button onClick={openDenOrderEditor} variant="outline" size="sm" disabled={denActionBusy !== null}>
                    <ChevronDown className="w-3.5 h-3.5" />
                    {t('burrows.den.reorder')}
                  </Button>
                </div>
              )}
              {profilesInUse.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
                    {t('burrows.profileFilter')}
                  </span>
                  <Select
                    value={selectedProfileFilter || ALL_PROFILE_FILTER_VALUE}
                    onValueChange={value => setSelectedProfileFilter(value === ALL_PROFILE_FILTER_VALUE ? '' : value)}
                  >
                    <SelectTrigger className="h-8 w-full rounded-full border-border bg-background px-3 text-xs sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_PROFILE_FILTER_VALUE}>{t('burrows.all')}</SelectItem>
                      {profilesInUse.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name || t('common.none')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="mb-3 text-xs text-muted-foreground">
              {searchQuery || selectedProfileFilter || selectedDenFilter
                ? t('burrows.showing', { filtered: filteredSessions.length, total: sessions.length })
                : t('burrows.sortedBy', { mode: t(SESSION_SORT_LABEL_KEYS[sortMode]) })}
            </div>
          </>
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptySessionsState
          profileCount={profiles.length}
          hostCount={inventoryCount}
          onCreateSession={() => setShowNewModal(true)}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="app-scroll flex-1 min-h-0 overflow-auto pr-1">
          {filteredSessions.length === 0 ? (
            <div className="surface-panel rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              {selectedProfileFilter
                ? (searchQuery ? t('burrows.noMatchInProfileSearch', { query: searchQuery }) : t('burrows.noMatchInProfile'))
                : t('burrows.noMatch', { query: searchQuery })}
            </div>
          ) : (
            <div className="grid gap-3 pb-2">
              {filteredSessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  terminals={terminals}
                  onOpen={handleOpenSession}
                  onKill={handleKill}
                  onRestart={handleRestart}
                  onEdit={setEditingSession}
                  onDuplicate={handleDuplicateSession}
                  isWorking={sessionAction?.id === s.id}
                  currentAction={sessionAction?.id === s.id ? sessionAction.kind : null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showDenOrderModal && selectedDenFilter && (
        <ModalShell
          title={t('burrows.den.reorderTitle', { den: selectedDenFilter })}
          description={t('burrows.den.reorderDesc')}
          onClose={() => setShowDenOrderModal(false)}
          contentClassName="max-w-[620px]"
          footer={(
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowDenOrderModal(false)} variant="ghost">
                {t('common.cancel')}
              </Button>
              <Button onClick={saveDenOrder} disabled={denActionBusy === 'save-order'}>
                {denActionBusy === 'save-order' ? t('burrows.den.savingOrder') : t('common.save')}
              </Button>
            </div>
          )}
        >
          <div className="space-y-2">
            {denOrderDraft.map((item, index) => (
              <div key={item.id} className="surface-panel flex items-center gap-3 rounded-2xl border border-border bg-muted/10 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.profile_name || t('common.none')}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button onClick={() => moveDenSession(index, -1)} variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0" disabled={index === 0}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button onClick={() => moveDenSession(index, 1)} variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0" disabled={index === denOrderDraft.length - 1}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ModalShell>
      )}

      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); refresh() }}
          onNavigate={onNavigate}
          onDiscard={onDiscard}
        />
      )}

      {duplicateDraft && (
        <NewSessionModal
          initialDraft={duplicateDraft}
          onClose={() => setDuplicateDraft(null)}
          onCreated={() => { setDuplicateDraft(null); refresh() }}
          onNavigate={onNavigate}
          onDiscard={onDiscard}
        />
      )}

      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onUpdated={() => { setEditingSession(null); refresh() }}
        />
      )}
    </div>
  )
}

function SessionCard({
  session: s,
  terminals,
  onOpen,
  onKill,
  onRestart,
  onEdit,
  onDuplicate,
  isWorking,
  currentAction,
}: {
  session: SessionRecord
  terminals: terminal.TerminalApp[]
  onOpen: (session: SessionRecord, terminalID?: string) => void
  onKill: (session: SessionRecord) => void
  onRestart: (session: SessionRecord) => void
  onEdit: (session: SessionRecord) => void
  onDuplicate: (session: SessionRecord) => void
  isWorking: boolean
  currentAction: 'open' | 'kill' | 'restart' | null
}) {
  const { t } = useTranslation()
  const [confirmKill, setConfirmKill] = useState(false)
  const startupPreview = buildSessionStartupPreview(s)

  const statusColor = !s.alive
    ? 'bg-muted-foreground/70'
    : s.attached
      ? 'bg-green-500 dark:bg-green-400'
      : 'bg-yellow-500 dark:bg-yellow-400'
  const statusText = !s.alive ? t('burrows.status.offline') : (s.attached ? t('burrows.status.attached') : t('burrows.status.ready'))
  const primaryLabel = isWorking && currentAction === 'open'
    ? (!s.alive ? t('burrows.status.restoring') : t('burrows.status.opening'))
    : (!s.alive ? t('burrows.restoreBurrow') : t('burrows.openBurrow'))
  const destructiveLabel = isWorking && currentAction === 'kill'
    ? (!s.alive ? t('burrows.status.removing') : t('burrows.status.killing'))
    : (!s.alive ? t('burrows.remove') : t('burrows.destroy'))
  const restartLabel = isWorking && currentAction === 'restart'
    ? t('burrows.status.restarting')
    : t('burrows.restart')

  return (
    <div className="breathing-card surface-panel flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-all sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-foreground">{s.name}</div>
            {s.den ? (
              <span className="rounded-full border border-primary/15 bg-[hsl(var(--selected))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--selected-foreground))]">
                {s.den}
              </span>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {s.profile_name && (
              <span className="inline-flex items-center gap-1">
                {s.profile_color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.profile_color }}
                  />
                )}
                {s.profile_name}
                <span className="mx-1 text-muted-foreground/50">|</span>
              </span>
            )}
            {statusText}
            <span className="mx-1 text-muted-foreground/50">|</span>
            {s.alive ? t('burrows.windowCount', { count: s.windows }) : t('burrows.willRestore')}
          </div>
          {s.cwd && (
            <div className="mt-1 text-xs text-muted-foreground font-mono">
              {t('burrows.workspaceLabel', { path: s.cwd })}
            </div>
          )}
          {startupPreview && (
            <div
              className="mt-1.5 flex min-w-0 flex-wrap items-start gap-x-1 gap-y-0.5 text-xs leading-relaxed text-muted-foreground/70"
              title={t('burrows.autoRunsHint', { command: startupPreview })}
            >
              <span className="shrink-0 font-mono">{t('burrows.startup')}</span>
              <CommandText command={startupPreview} className="min-w-0 flex-1" />
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:self-center">
        <div className="flex">
          <Button
            onClick={() => onOpen(s)}
            size="sm"
            className="rounded-r-none pr-2 shadow-md"
            disabled={isWorking}
          >
            <Play className="w-3.5 h-3.5" />
            {primaryLabel}
          </Button>
          {terminals.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-primary-foreground/20 pl-1 pr-1.5 data-[state=open]:bg-primary/90"
                  disabled={isWorking}
                >
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t('burrows.openWith')}</DropdownMenuLabel>
                {terminals.map(term => (
                  <DropdownMenuItem key={term.ID} onSelect={() => onOpen(s, term.ID)}>
                    <TerminalSquare className="w-4 h-4 text-muted-foreground" />
                    <span>{term.Name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <DropdownMenu onOpenChange={(open: boolean) => { if (!open) setConfirmKill(false) }}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="w-9 px-0 data-[state=open]:border-border data-[state=open]:bg-popover data-[state=open]:text-popover-foreground data-[state=open]:shadow-lg data-[state=open]:backdrop-blur-sm"
              aria-label={t('burrows.moreActions')}
              disabled={isWorking}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{t('burrows.actions')}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onDuplicate(s)}>
              <Copy className="w-4 h-4 text-muted-foreground" />
              <span>{t('common.duplicate')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit(s)}>
              <Pencil className="w-4 h-4 text-muted-foreground" />
              <span>{t('common.edit')}</span>
            </DropdownMenuItem>
            {s.alive && (
              <DropdownMenuItem onSelect={() => onRestart(s)}>
                <RotateCw className="w-4 h-4 text-muted-foreground" />
                <span>{restartLabel}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {confirmKill ? (
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => {
                  setConfirmKill(false)
                  onKill(s)
                }}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{t('burrows.confirmDestroy')}</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={(e: Event) => {
                  e.preventDefault()
                  setConfirmKill(true)
                }}
              >
                <Trash2 className="w-4 h-4" />
                <span>{destructiveLabel}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function EmptySessionsState({
  profileCount,
  hostCount,
  onCreateSession,
  onNavigate,
}: {
  profileCount: number
  hostCount: number
  onCreateSession: () => void
  onNavigate: (tab: AppTab, ctx?: NavigateContext) => void
}) {
  const { t } = useTranslation()
  const checklist = [
    {
      key: 'profile',
      title: t('burrows.empty.profileTitle'),
      description: t('burrows.empty.profileDesc'),
      done: profileCount > 0,
      actionLabel: profileCount > 0 ? t('burrows.empty.manageProfiles') : t('burrows.empty.addProfile'),
      action: () => onNavigate('profiles'),
      icon: FolderGit2,
    },
    {
      key: 'host',
      title: t('burrows.empty.hostTitle'),
      description: t('burrows.empty.hostDesc'),
      done: hostCount > 0,
      actionLabel: hostCount > 0 ? t('burrows.empty.manageHosts') : t('burrows.empty.addHost'),
      action: () => onNavigate('hosts'),
      icon: Server,
    },
    {
      key: 'session',
      title: t('burrows.empty.sessionTitle'),
      description: t('burrows.empty.sessionDesc'),
      done: false,
      actionLabel: t('burrows.newBurrow'),
      action: onCreateSession,
      icon: Wrench,
    },
  ]

  return (
    <Card className="overflow-hidden border-primary/15">
      <CardHeader className="border-b border-border/70 bg-card/70">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TerminalSquare className="w-5 h-5 text-primary" />
          {t('burrows.empty.title')}
        </CardTitle>
        <CardDescription>
          {t('burrows.empty.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        {checklist.map((item, index) => {
          const Icon = item.icon
          return (
            <div
              key={item.key}
              className="flex items-start gap-4 rounded-lg border border-border bg-muted/15 p-4"
            >
              <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border ${item.done ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
                {item.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">0{index + 1}</span>
                  <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                  {item.done && <Badge variant="secondary" className="text-[10px]">{t('common.ready')}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Button onClick={item.action} variant={item.done ? 'secondary' : 'default'} size="sm" className="shrink-0">
                {item.actionLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function NewSessionModal({
  initialDraft,
  onClose,
  onCreated,
  onNavigate,
  onDiscard,
}: {
  initialDraft?: SessionDraft | null
  onClose: () => void
  onCreated: () => void
  onNavigate?: (tab: AppTab, ctx?: NavigateContext) => void
  onDiscard?: () => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(initialDraft?.profileID || '')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [scriptConfigs, setScriptConfigs] = useState<ScriptConfig[]>([])
  const [runtimeScriptPlatform, setRuntimeScriptPlatform] = useState<RuntimeScriptPlatform>('other')
  const [pluginConfigs, setPluginConfigs] = useState<pluginconfig.Config[]>([])
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedHostId, setSelectedHostId] = useState(initialDraft?.hostID || '')
  const [selectedCodexConfigId, setSelectedCodexConfigId] = useState(initialDraft?.codexConfigID || '')
  const [selectedPluginConfigId, setSelectedPluginConfigId] = useState(initialDraft?.pluginConfigID || '')
  const [pluginData, setPluginData] = useState<Record<string, string>>(initialDraft?.pluginData || {})
  const [runMode, setRunMode] = useState<string>(initialDraft?.runMode || 'shell')
  const [selectedBackend, setSelectedBackend] = useState<string>(initialDraft?.backendID || BACKEND_WSL_TMUX)
  const [execEnv, setExecEnv] = useState<'local' | 'ssh'>(initialDraft?.execEnv || 'local')
  const [commandMode, setCommandMode] = useState<'auto' | 'manual'>(initialDraft?.commandMode || (initialDraft?.command ? 'manual' : 'auto'))
  const [selectedScriptID, setSelectedScriptID] = useState(initialDraft?.scriptID || '')
  const [scriptFallback, setScriptFallback] = useState<{ command: string; mode: 'auto' | 'manual' } | null>(null)
  const [sessionName, setSessionName] = useState(initialDraft?.sessionName || '')
  const [command, setCommand] = useState(initialDraft?.command || '')
  const [cwd, setCwd] = useState(initialDraft?.cwd || readLastWorkspace())
  const [cwdTouched, setCwdTouched] = useState(Boolean(initialDraft?.cwd))
  const [den, setDen] = useState(initialDraft?.den || '')
  const [denSuggestions, setDenSuggestions] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [pickingCwd, setPickingCwd] = useState(false)
  const [error, setError] = useState('')
  const [denTouched, setDenTouched] = useState(Boolean(initialDraft?.den))

  // Restore draft from localStorage when modal opens
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mole:newSessionDraft')
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.profileID) setSelectedProfile(draft.profileID)
        if (draft.runMode) setRunMode(draft.runMode)
        if (draft.backendID) setSelectedBackend(draft.backendID)
        if (draft.execEnv) setExecEnv(draft.execEnv)
        if (draft.hostID) setSelectedHostId(draft.hostID)
        if (draft.codexConfigID) setSelectedCodexConfigId(draft.codexConfigID)
        if (draft.pluginConfigID) setSelectedPluginConfigId(draft.pluginConfigID)
        if (draft.pluginData) setPluginData(draft.pluginData)
        if (draft.commandMode === 'auto' || draft.commandMode === 'manual') {
          setCommandMode(draft.commandMode)
        } else if (typeof draft.command === 'string' && draft.command.trim()) {
          setCommandMode('manual')
        }
        if (draft.scriptID) setSelectedScriptID(draft.scriptID)
        if (typeof draft.command === 'string') setCommand(draft.command)
        if (draft.cwd) {
          setCwd(draft.cwd)
          setCwdTouched(true)
        }
        if (draft.sessionName) setSessionName(draft.sessionName)
        if (draft.den) {
          setDen(draft.den)
          setDenTouched(true)
        }
        localStorage.removeItem('mole:newSessionDraft')
      }
    } catch {}
  }, [])

  useEffect(() => {
    // Den intentionally has no profile-based default. Keep it empty unless the
    // user (or restored draft) explicitly provided a value.
    if (!denTouched && !initialDraft?.den && den !== '') {
      setDen('')
    }
  }, [selectedProfile, denTouched, initialDraft?.den, den])

  useEffect(() => {
    let cancelled = false
    void Environment()
      .then(info => {
        if (cancelled) return
        setRuntimeScriptPlatform(resolveRuntimeScriptPlatform(info?.platform))
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeScriptPlatform('other')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => {
          setProfiles(p || [])
        })
        .catch(err => setError(String(err)))

      ListSessions()
        .then(items => {
          if (!cwdTouched && !initialDraft?.cwd && !cwd.trim()) {
            const recentWorkspace = [...(items || [])]
              .filter(item => (item.cwd || '').trim())
              .sort((left, right) => {
                const leftTs = parseTimestamp(left.last_opened_at || left.created_at)
                const rightTs = parseTimestamp(right.last_opened_at || right.created_at)
                return rightTs - leftTs
              })[0]?.cwd || ''
            const fallbackWorkspace = readLastWorkspace()
            const nextWorkspace = recentWorkspace.trim() || fallbackWorkspace
            if (nextWorkspace) {
              setCwd(nextWorkspace)
            }
          }

          const counts = new Map<string, number>()
          ;(items || []).forEach(item => {
            const key = (item.den || '').trim()
            if (!key) return
            counts.set(key, (counts.get(key) || 0) + 1)
          })
          const suggestions = Array.from(counts.entries())
            .sort((a, b) => {
              if (b[1] !== a[1]) return b[1] - a[1]
              return compareAlpha(a[0], b[0])
            })
            .map(([name]) => name)
          setDenSuggestions(suggestions)
        })
        .catch(() => {})

      GetInventory()
        .then(data => setInv(data || EMPTY_INVENTORY))
        .catch(() => {})

      const listCodexConfigs = getAppMethod('ListCodexConfigs')
      if (typeof listCodexConfigs === 'function') {
        listCodexConfigs()
          .then((configs: codex.Config[]) => {
            setCodexConfigs(configs || [])
            if (configs && configs.length > 0) setSelectedCodexConfigId(configs[0].id)
          })
          .catch(() => {})
      }

      const listDockerConfigs = getAppMethod('ListDockerConfigs')
      if (typeof listDockerConfigs === 'function') {
        listDockerConfigs()
          .then((configs: docker.Config[]) => setDockerConfigs(configs || []))
          .catch(() => {})
      }

      const listScriptConfigs = getAppMethod('ListScriptConfigs')
      if (typeof listScriptConfigs === 'function') {
        listScriptConfigs()
          .then((configs: ScriptConfig[]) => setScriptConfigs(configs || []))
          .catch(() => {})
      }

      const listLaunchPlugins = getAppMethod('ListLaunchPlugins')
      if (typeof listLaunchPlugins === 'function') {
        listLaunchPlugins()
          .then((infos: session.PluginInfo[]) => setPlugins(infos || []))
          .catch(() => {})
      }

      const listPluginConfigs = getAppMethod('ListPluginConfigs')
      if (typeof listPluginConfigs === 'function') {
        listPluginConfigs('')
          .then((configs: pluginconfig.Config[]) => setPluginConfigs(configs || []))
          .catch(() => {})
      }
    }
  }, [cwd, cwdTouched, initialDraft?.cwd])

  const hostMap = useMemo(() => {
    const map = new Map<string, HostRecord>()
    ;(inv.hosts as HostRecord[]).forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareAlpha(profileLabel(a), profileLabel(b)))
  ), [profiles])

  const sortedHosts = useMemo(() => (
    [...(inv.hosts as HostRecord[])].sort((a, b) => compareAlpha(hostLabel(a), hostLabel(b)))
  ), [inv.hosts])

  const sortedCodexConfigs = useMemo(() => (
    [...codexConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [codexConfigs])

  const sortedDockerConfigs = useMemo(() => (
    [...dockerConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [dockerConfigs])
  const sortedScriptConfigs = useMemo(() => (
    [...scriptConfigs]
      .filter(cfg => scriptPlatformMatchesRuntime(cfg, runtimeScriptPlatform))
      .sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [runtimeScriptPlatform, scriptConfigs])

  useEffect(() => {
    if (!selectedScriptID) return
    if (!sortedScriptConfigs.some(cfg => cfg.id === selectedScriptID)) {
      setSelectedScriptID('')
    }
  }, [selectedScriptID, sortedScriptConfigs])

  const selectedProfileRecord = useMemo(
    () => profiles.find(p => p.id === selectedProfile) || null,
    [profiles, selectedProfile]
  )
  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''
  const currentPluginConfigs = useMemo(() => (
    pluginConfigs.filter(cfg => cfg.plugin_id === runMode).sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [pluginConfigs, runMode])
  const selectedPluginConfig = selectedPluginConfigId
    ? currentPluginConfigs.find(cfg => cfg.id === selectedPluginConfigId)
    : null

  useEffect(() => {
    // New session flow: when switching to SSH, preselect the first host once.
    if (execEnv === 'local') {
      setSelectedHostId('')
      return
    }

    if (execEnv === 'ssh') {
      if (selectedScriptID) {
        if (scriptFallback) {
          setCommand(scriptFallback.command)
          setCommandMode(scriptFallback.mode)
        } else {
          setCommandMode('auto')
        }
        setSelectedScriptID('')
        setScriptFallback(null)
      }
      if (!selectedHostId && inv.hosts.length > 0) {
        setSelectedHostId(inv.hosts[0].id)
      }
      return
    }
  }, [execEnv, inv.hosts, scriptFallback, selectedHostId, selectedScriptID])

  useEffect(() => {
    if (commandMode !== 'auto') return
    if (!(runMode === 'shell' || runMode === 'host' || runMode === 'custom')) return

    const startupCommand = (selectedProfileRecord?.default_command || '').trim()
    const nextCommand = buildResolvedCommand({
      execEnv,
      hostCommand,
      workspace: cwd,
      startupCommand,
    })
    setCommand(prev => (prev === nextCommand ? prev : nextCommand))
  }, [commandMode, runMode, selectedProfileRecord?.default_command, execEnv, hostCommand, cwd])

  // Keep old runMode effect for plugin modes (codex, docker, etc.)
  useEffect(() => {
    if (runMode === 'shell' || runMode === 'host' || runMode === 'custom') {
      // These are now handled by execEnv
      return
    }

    if (runMode === 'codex') {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedPluginConfigId('')
      setPluginData({})
      setCommand('')
      if (!selectedCodexConfigId && sortedCodexConfigs.length > 0) {
        setSelectedCodexConfigId(sortedCodexConfigs[0].id)
      }
    }

    if (runMode === 'docker') {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedPluginConfigId('')
      setPluginData({})
      setCommand('')
      if (!selectedCodexConfigId && sortedDockerConfigs.length > 0) {
        setSelectedCodexConfigId(sortedDockerConfigs[0].id)
      }
    }

    if (isExternalPluginMode(runMode)) {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedCodexConfigId('')
      setCommand('')
      if (!currentPluginConfigs.some(cfg => cfg.id === selectedPluginConfigId)) {
        setSelectedPluginConfigId(currentPluginConfigs[0]?.id || '')
      }
    }
  }, [runMode, inv.hosts, selectedHostId, selectedHost, hostCommand, inv.defaults, hostMap, selectedCodexConfigId, sortedCodexConfigs, sortedDockerConfigs, selectedPluginConfigId, currentPluginConfigs])

  const isDuplicating = Boolean(initialDraft)
  const modalTitle = isDuplicating
    ? `${t('burrows.modal.copyTitle')}${initialDraft?.sourceName ? `: ${initialDraft.sourceName}` : ''}`
    : t('burrows.modal.newTitle')
  const modalDescription = isDuplicating
    ? t('burrows.modal.copyDesc')
    : t('burrows.modal.newDesc')
  const submitLabel = creating
    ? (isDuplicating ? t('burrows.modal.creatingCopy') : t('burrows.modal.creating'))
    : (isDuplicating ? t('burrows.modal.createCopy') : t('burrows.modal.create'))

  const buildDraft = (): SessionDraft => ({
    profileID: selectedProfile,
    backendID: selectedBackend,
    runMode,
    hostID: selectedHostId,
    codexConfigID: selectedCodexConfigId,
    pluginConfigID: selectedPluginConfigId,
    pluginData,
    execEnv,
    commandMode,
    scriptID: selectedScriptID,
    command,
    cwd,
    sessionName,
    den,
  })

  const handleCreate = async () => {
    if (!selectedProfile || !sessionName.trim()) return
    if (execEnv === 'ssh' && !selectedHostId) {
      setError(t('burrows.modal.selectHostRequired'))
      return
    }
    if (runMode === 'codex' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectCodexRequired'))
      return
    }
    if (runMode === 'docker' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectDockerRequired'))
      return
    }
    if (isExternalPluginMode(runMode) && !selectedPluginConfigId) {
      setError(t('burrows.modal.selectPluginConfigRequired'))
      return
    }
    if (runMode === 'k8s_pod' && !String(pluginData.pod_query || '').trim()) {
      setError(t('burrows.modal.podQueryRequired'))
      return
    }
    setCreating(true)
    setError('')
    try {
      const persistedCommand = resolveSessionCommandForSubmit({
        execEnv,
        command,
        hostCommand,
        workspace: cwd,
        profileDefaultCommand: selectedProfileRecord?.default_command || '',
      })

      // Determine the effective run mode based on execEnv and command
      let effectiveRunMode = runMode
      let effectiveHostId = ''

      if (execEnv === 'ssh') {
        effectiveRunMode = 'host'
        effectiveHostId = selectedHostId
      } else {
        // execEnv === 'local'
        if (persistedCommand.trim()) {
          effectiveRunMode = 'custom'
        } else {
          effectiveRunMode = 'shell'
        }
      }

      await createSessionWithOptions(
        selectedProfile,
        sessionName.trim(),
        runtimeScriptPlatform === 'windows' ? selectedBackend : '',
        persistedCommand.trim(),
        cwd.trim(),
        effectiveRunMode,
        effectiveHostId,
        (runMode === 'codex' || runMode === 'docker') ? selectedCodexConfigId : '',
        isExternalPluginMode(runMode) ? selectedPluginConfigId : '',
        isExternalPluginMode(runMode) ? pluginData : {},
        den.trim(),
      )
      saveLastWorkspace(cwd.trim())
      onCreated()
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const handlePickWorkspace = async () => {
    setCwdTouched(true)
    setPickingCwd(true)
    try {
      const selected = await pickDirectory(cwd.trim())
      if (selected && selected.trim()) {
        const next = selected.trim()
        setCwd(next)
        saveLastWorkspace(next)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setPickingCwd(false)
    }
  }

  return (
    <ModalShell
      title={modalTitle}
      description={modalDescription}
      onClose={() => { onDiscard?.(); onClose() }}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={() => { onDiscard?.(); onClose() }} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !selectedProfile || !sessionName.trim()}
          >
            {submitLabel}
          </Button>
        </div>
      )}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.profile')}</label>

            {profiles.length === 0 ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground flex-1">
                  {t('burrows.modal.noProfiles')}{' '}
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        const draft = buildDraft()
                        localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                        onClose()
                        onNavigate('profiles', { returnToNewSession: true })
                      }}
                      className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                    >
                      {t('burrows.modal.createOne')}
                    </button>
                  )}
                </p>
                <Button
                  onClick={() => {
                    const draft = buildDraft()
                    localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                    onClose()
                    onNavigate?.('profiles', { returnToNewSession: true })
                  }}
                  variant="outline"
                  size="sm"
                  type="button"
                  className="shrink-0"
                  title={t('burrows.quickCreate.addProfile')}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('burrows.modal.selectProfile')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedProfiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => {
                    const draft = buildDraft()
                    localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                    onClose()
                    onNavigate?.('profiles', { returnToNewSession: true })
                  }}
                  variant="outline"
                  size="icon"
                  type="button"
                  className="h-9 w-9 shrink-0"
                  title={t('burrows.quickCreate.addProfile')}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.burrowName')}</label>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder={t('burrows.modal.namePlaceholder')}
              pattern="[a-zA-Z0-9_-]+"
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.nameHint')}</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">{t('burrows.modal.execEnv')}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <RunModeOption
                mode="local"
                labelKey="burrows.runMode.local"
                activeMode={execEnv}
                onSelect={(mode) => setExecEnv(mode as 'local' | 'ssh')}
              />
              <RunModeOption
                mode="ssh"
                labelKey="burrows.runMode.ssh"
                activeMode={execEnv}
                onSelect={(mode) => setExecEnv(mode as 'local' | 'ssh')}
                disabled={inv.hosts.length === 0}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {execEnv === 'local' ? t('burrows.runMode.localHint') : t('burrows.runMode.sshHint')}
            </div>
          </div>

          {runtimeScriptPlatform === 'windows' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.runtimeBackend')}</label>
              <Select value={selectedBackend} onValueChange={setSelectedBackend}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t('burrows.modal.runtimeBackend')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BACKEND_WSL_TMUX}>{t('burrows.modal.backendWslTmux')}</SelectItem>
                  <SelectItem value={BACKEND_POWERSHELL}>{t('burrows.modal.backendPowerShell')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedBackend === BACKEND_POWERSHELL
                  ? t('burrows.modal.backendPowerShellHint')
                  : t('burrows.modal.backendWslTmuxHint')}
              </p>
            </div>
          )}

          {execEnv === 'ssh' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.sshHost')}</label>
              {inv.hosts.length === 0 ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground flex-1">
                    {t('burrows.modal.noHosts')}{' '}
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          const draft = buildDraft()
                          localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                          onClose()
                          onNavigate?.('hosts', { returnToNewSession: true })
                        }}
                        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        {t('burrows.modal.addOne')}
                      </button>
                    )}
                  </p>
                  <Button
                    onClick={() => {
                      const draft = buildDraft()
                      localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                      onClose()
                      onNavigate?.('hosts', { returnToNewSession: true })
                    }}
                    variant="outline"
                    size="sm"
                    type="button"
                    className="shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedHostId || inv.hosts[0]?.id || ''}
                      onValueChange={value => {
                        setSelectedHostId(value)
                      }}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('burrows.modal.selectHost')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedHosts.map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.name || h.host}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => {
                      const draft = buildDraft()
                      localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                      onClose()
                      onNavigate?.('hosts', { returnToNewSession: true })
                    }}
                    variant="outline"
                    size="icon"
                    type="button"
                    className="h-9 w-9 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">{t('common.preview')}</div>
                  <CommandText command={hostCommand} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.workspace')}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={cwd}
                onChange={e => {
                  setCwdTouched(true)
                  setCwd(e.target.value)
                }}
                placeholder={t('burrows.modal.workspacePlaceholder')}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handlePickWorkspace}
                disabled={creating || pickingCwd}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                {t('burrows.modal.browse')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.workspaceHint')}</p>
          </div>

          <div>
            {execEnv === 'local' && (runMode === 'shell' || runMode === 'custom' || runMode === 'host') && (
              <div className="mb-3">
                <label className="mb-1 block text-sm text-muted-foreground">{t('burrows.modal.scriptPreset')}</label>
                {sortedScriptConfigs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('burrows.modal.scriptPresetEmpty')}</p>
                ) : (
                  <Select
                    value={selectedScriptID || '__none__'}
                    onValueChange={value => {
                      if (value === '__none__') {
                        if (scriptFallback) {
                          setCommand(scriptFallback.command)
                          setCommandMode(scriptFallback.mode)
                        } else {
                          setCommandMode('auto')
                        }
                        setScriptFallback(null)
                        setSelectedScriptID('')
                        return
                      }
                      if (!selectedScriptID) {
                        setScriptFallback({ command, mode: commandMode })
                      }
                      const selectedScript = sortedScriptConfigs.find(item => item.id === value)
                      setSelectedScriptID(value)
                      if (selectedScript?.command) {
                        setCommandMode('manual')
                        setCommand(selectedScript.command)
                      }
                    }}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('burrows.modal.scriptPresetPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('common.none')}</SelectItem>
                      {sortedScriptConfigs.map(cfg => (
                        <SelectItem key={cfg.id} value={cfg.id}>{cfg.name || cfg.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.command')}</label>
            <textarea
              value={command}
              onChange={e => {
                setCommandMode('manual')
                setSelectedScriptID('')
                setScriptFallback(null)
                setCommand(e.target.value)
              }}
              placeholder={execEnv === 'ssh' ? t('burrows.modal.commandSshPlaceholder') : t('burrows.modal.commandPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {t('burrows.modal.commandHint')}
            </div>
          </div>

          {runMode === 'codex' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.codexConfig')}</label>
              {codexConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noCodex')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectCodex')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCodexConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    {t('burrows.modal.launchPreview')}
                  </div>
                  <div className="font-mono">codex</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'docker' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.dockerConfig')}</label>
              {dockerConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noDocker')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectDocker')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedDockerConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (() => {
                const selectedDockerCfg = dockerConfigs.find(c => c.id === selectedCodexConfigId)
                return selectedDockerCfg ? (
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                      <Box className="h-3.5 w-3.5" />
                      {t('burrows.modal.launchPreview')}
                    </div>
                    <div className="font-mono">{['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', selectedDockerCfg.image].join(' ')}</div>
                  </div>
                ) : null
              })()}
	            </div>
	          )}

	          {isExternalPluginMode(runMode) && (
	            <div>
	              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.pluginConfig')}</label>
	              {currentPluginConfigs.length === 0 ? (
	                <p className="text-sm text-muted-foreground">{t('burrows.modal.noPluginConfigs')}</p>
	              ) : (
	                <Select value={selectedPluginConfigId} onValueChange={setSelectedPluginConfigId}>
	                  <SelectTrigger className="bg-background">
	                    <SelectValue placeholder={t('burrows.modal.selectPluginConfig')} />
	                  </SelectTrigger>
	                  <SelectContent>
	                    {currentPluginConfigs.map(cfg => (
	                      <SelectItem key={cfg.id} value={cfg.id}>
	                        {cfg.name || cfg.id}
	                      </SelectItem>
	                    ))}
	                  </SelectContent>
	                </Select>
	              )}
	              {runMode === 'k8s_pod' && (
	                <div className="mt-3">
	                  <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.podQuery')}</label>
	                  <input
	                    type="text"
	                    value={pluginData.pod_query || ''}
	                    onChange={e => setPluginData(prev => ({ ...prev, pod_query: e.target.value }))}
	                    placeholder={t('burrows.modal.podQueryPlaceholder')}
	                    className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
	                  />
	                </div>
	              )}
	              {selectedPluginConfig && (
	                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
	                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
	                    <TerminalSquare className="h-3.5 w-3.5" />
	                    {t('burrows.modal.launchPreview')}
	                  </div>
	                  <div className="mb-1 font-mono">{pluginConfigSummary(runMode, selectedPluginConfig)}</div>
	                  <div className="font-mono text-muted-foreground/80">{buildPluginCommandPreview(runMode, selectedPluginConfig, pluginData)}</div>
	                </div>
	              )}
	            </div>
	          )}


          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.den')}</label>
            <input
              type="text"
              value={den}
              onChange={e => {
                setDenTouched(true)
                setDen(e.target.value)
              }}
              placeholder={t('burrows.modal.denPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.denHint')}</p>
            {denSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {denSuggestions.map(item => {
                  const selected = den.trim() === item
                  if (selected) {
                    return (
                      <div
                        key={item}
                        className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setDenTouched(true)
                            setDen('')
                          }}
                          className="rounded-full p-0.5 text-primary/80 hover:bg-primary/15 hover:text-primary"
                          aria-label={t('common.clear')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setDenTouched(true)
                        setDen(item)
                      }}
                      className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
      </div>
    </ModalShell>
  )
}

function EditSessionModal({
  session: initialSession,
  onClose,
  onUpdated,
}: {
  session: SessionRecord
  onClose: () => void
  onUpdated: () => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(initialSession.profile_id)
  const [command, setCommand] = useState(initialSession.command || '')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [scriptConfigs, setScriptConfigs] = useState<ScriptConfig[]>([])
  const [runtimeScriptPlatform, setRuntimeScriptPlatform] = useState<RuntimeScriptPlatform>('other')
  const [pluginConfigs, setPluginConfigs] = useState<pluginconfig.Config[]>([])
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedHostId, setSelectedHostId] = useState('')
  const [selectedCodexConfigId, setSelectedCodexConfigId] = useState(initialSession.codex_config_id || '')
  const [selectedPluginConfigId, setSelectedPluginConfigId] = useState(initialSession.plugin_config_id || '')
  const [pluginData, setPluginData] = useState<Record<string, string>>(initialSession.plugin_data || {})
  const [selectedBackend, setSelectedBackend] = useState<string>(initialSession.backend_id || BACKEND_WSL_TMUX)
  const [runMode, setRunMode] = useState<string>(
    normalizeRunMode(initialSession.run_mode, Boolean(initialSession.command))
  )
  const [commandMode, setCommandMode] = useState<'auto' | 'manual'>(
    initialSession.run_mode === 'custom' ? 'manual' : 'auto'
  )
  const [selectedScriptID, setSelectedScriptID] = useState('')
  const [scriptFallback, setScriptFallback] = useState<{ command: string; mode: 'auto' | 'manual' } | null>(null)
  const [execEnv, setExecEnv] = useState<'local' | 'ssh'>(
    initialSession.run_mode === 'host' || initialSession.host_id ? 'ssh' : 'local'
  )
  const [cwd, setCwd] = useState(initialSession.cwd || '')
  const [den, setDen] = useState(initialSession.den || '')
  const [pickingCwd, setPickingCwd] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Environment()
      .then(info => {
        if (cancelled) return
        setRuntimeScriptPlatform(resolveRuntimeScriptPlatform(info?.platform))
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeScriptPlatform('other')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))

      GetInventory()
        .then(data => {
          setInv(data || EMPTY_INVENTORY)
          setHydrated(true)
        })
        .catch(() => setHydrated(true))

      const listCodexConfigs = getAppMethod('ListCodexConfigs')
      if (typeof listCodexConfigs === 'function') {
        listCodexConfigs()
          .then((configs: codex.Config[]) => setCodexConfigs(configs || []))
          .catch(() => {})
      }

      const listLaunchPlugins = getAppMethod('ListLaunchPlugins')
      if (typeof listLaunchPlugins === 'function') {
        listLaunchPlugins()
          .then((infos: session.PluginInfo[]) => setPlugins(infos || []))
          .catch(() => {})
      }

      const listDockerConfigs = getAppMethod('ListDockerConfigs')
      if (typeof listDockerConfigs === 'function') {
        listDockerConfigs()
          .then((configs: docker.Config[]) => setDockerConfigs(configs || []))
          .catch(() => {})
      }

      const listScriptConfigs = getAppMethod('ListScriptConfigs')
      if (typeof listScriptConfigs === 'function') {
        listScriptConfigs()
          .then((configs: ScriptConfig[]) => setScriptConfigs(configs || []))
          .catch(() => {})
      }

      const listPluginConfigs = getAppMethod('ListPluginConfigs')
      if (typeof listPluginConfigs === 'function') {
        listPluginConfigs('')
          .then((configs: pluginconfig.Config[]) => setPluginConfigs(configs || []))
          .catch(() => {})
      }
    }
  }, [])

  const hostMap = useMemo(() => {
    const map = new Map<string, HostRecord>()
    ;(inv.hosts as HostRecord[]).forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareAlpha(profileLabel(a), profileLabel(b)))
  ), [profiles])

  const sortedHosts = useMemo(() => (
    [...(inv.hosts as HostRecord[])].sort((a, b) => compareAlpha(hostLabel(a), hostLabel(b)))
  ), [inv.hosts])

  const sortedCodexConfigs = useMemo(() => (
    [...codexConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [codexConfigs])

  const sortedDockerConfigs = useMemo(() => (
    [...dockerConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [dockerConfigs])
  const sortedScriptConfigs = useMemo(() => (
    [...scriptConfigs]
      .filter(cfg => scriptPlatformMatchesRuntime(cfg, runtimeScriptPlatform))
      .sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [runtimeScriptPlatform, scriptConfigs])

  useEffect(() => {
    if (!selectedScriptID) return
    if (!sortedScriptConfigs.some(cfg => cfg.id === selectedScriptID)) {
      setSelectedScriptID('')
    }
  }, [selectedScriptID, sortedScriptConfigs])

  const selectedProfileRecord = useMemo(
    () => profiles.find(p => p.id === selectedProfile) || null,
    [profiles, selectedProfile]
  )
  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''
  const currentPluginConfigs = useMemo(() => (
    pluginConfigs.filter(cfg => cfg.plugin_id === runMode).sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [pluginConfigs, runMode])
  const selectedPluginConfig = selectedPluginConfigId
    ? currentPluginConfigs.find(cfg => cfg.id === selectedPluginConfigId)
    : null

  useEffect(() => {
    if (!hydrated) return

    if (initialSession.run_mode === 'host' && initialSession.host_id) {
      setRunMode('host')
      setExecEnv('ssh')
      setSelectedHostId(initialSession.host_id)
      const host = hostMap.get(initialSession.host_id)
      setCommandMode('auto')
      setSelectedScriptID('')
      setCommand((initialSession.command || '').trim() || (host ? buildSSHCommand(host, inv.defaults, hostMap) : ''))
      return
    }

    if (initialSession.run_mode === 'codex' && initialSession.codex_config_id) {
      setRunMode('codex')
      setExecEnv('local')
      setSelectedCodexConfigId(initialSession.codex_config_id)
      setCommandMode('manual')
      setSelectedScriptID('')
      setCommand('')
      return
    }

    if (initialSession.run_mode && isExternalPluginMode(initialSession.run_mode)) {
      setRunMode(initialSession.run_mode)
      setExecEnv('local')
      setSelectedPluginConfigId(initialSession.plugin_config_id || '')
      setPluginData(initialSession.plugin_data || {})
      setCommandMode('manual')
      setSelectedScriptID('')
      setCommand('')
      return
    }

    const matchingHostID = findHostIDForCommand(initialSession.command || '', inv, hostMap)
    if (matchingHostID) {
      setRunMode('host')
      setExecEnv('ssh')
      setSelectedHostId(matchingHostID)
      setCommandMode('auto')
      setSelectedScriptID('')
      setCommand(initialSession.command || '')
      return
    }

    if ((initialSession.command || '').trim()) {
      setRunMode('custom')
      setExecEnv('local')
      setCommandMode('manual')
      setSelectedScriptID(findScriptIDForCommand(initialSession.command || '', scriptConfigs))
      setCommand(initialSession.command || '')
      return
    }

    setRunMode('shell')
    setExecEnv('local')
    setCommandMode('auto')
    setSelectedScriptID('')
    setCommand('')
  }, [hydrated, initialSession.command, initialSession.host_id, initialSession.run_mode, inv, hostMap, scriptConfigs])

  useEffect(() => {
    // Edit flow: keep the stored host selection; do not auto-pick the first
    // inventory host because that can silently override the saved host.
    if (execEnv === 'local') {
      setSelectedHostId('')
      return
    }
    if (execEnv === 'ssh' && selectedScriptID) {
      if (scriptFallback) {
        setCommand(scriptFallback.command)
        setCommandMode(scriptFallback.mode)
      } else {
        setCommandMode('auto')
      }
      setSelectedScriptID('')
      setScriptFallback(null)
    }
  }, [execEnv, scriptFallback, selectedScriptID])

  useEffect(() => {
    if (commandMode !== 'auto') return
    if (!(runMode === 'shell' || runMode === 'host' || runMode === 'custom')) return

    const startupCommand = (selectedProfileRecord?.default_command || '').trim()
    const nextCommand = buildResolvedCommand({
      execEnv,
      hostCommand,
      workspace: cwd,
      startupCommand,
    })
    setCommand(prev => (prev === nextCommand ? prev : nextCommand))
  }, [commandMode, runMode, selectedProfileRecord?.default_command, execEnv, hostCommand, cwd])

  // Keep old runMode effect for plugin modes (codex, docker, etc.)
  useEffect(() => {
    if (runMode === 'shell' || runMode === 'host' || runMode === 'custom') {
      // These are now handled by execEnv
      return
    }

    if (runMode === 'codex') {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedPluginConfigId('')
      setPluginData({})
      setCommand('')
      if (!selectedCodexConfigId && sortedCodexConfigs.length > 0) {
        setSelectedCodexConfigId(sortedCodexConfigs[0].id)
      }
    }

    if (runMode === 'docker') {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedPluginConfigId('')
      setPluginData({})
      setCommand('')
      if (!selectedCodexConfigId && sortedDockerConfigs.length > 0) {
        setSelectedCodexConfigId(sortedDockerConfigs[0].id)
      }
    }

    if (isExternalPluginMode(runMode)) {
      setSelectedHostId('')
      setSelectedScriptID('')
      setScriptFallback(null)
      setSelectedCodexConfigId('')
      setCommand('')
      if (!currentPluginConfigs.some(cfg => cfg.id === selectedPluginConfigId)) {
        setSelectedPluginConfigId(currentPluginConfigs[0]?.id || '')
      }
    }
  }, [runMode, selectedHostId, selectedHost, hostCommand, inv.hosts, inv.defaults, hostMap, selectedCodexConfigId, sortedCodexConfigs, sortedDockerConfigs, selectedPluginConfigId, currentPluginConfigs])

  const handleUpdate = async () => {
    if (!selectedProfile) return
    if (execEnv === 'ssh' && !selectedHostId) {
      setError(t('burrows.modal.selectHostRequiredEdit'))
      return
    }
    if (runMode === 'codex' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectCodexRequiredEdit'))
      return
    }
    if (runMode === 'docker' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectDockerRequiredEdit'))
      return
    }
    if (isExternalPluginMode(runMode) && !selectedPluginConfigId) {
      setError(t('burrows.modal.selectPluginConfigRequiredEdit'))
      return
    }
    if (runMode === 'k8s_pod' && !String(pluginData.pod_query || '').trim()) {
      setError(t('burrows.modal.podQueryRequired'))
      return
    }
    setUpdating(true)
    setError('')
    try {
      // Determine the effective run mode based on execEnv and command
      let effectiveRunMode = runMode
      let effectiveHostId = ''

      if (execEnv === 'ssh') {
        effectiveRunMode = 'host'
        effectiveHostId = selectedHostId
      } else {
        // execEnv === 'local'
        if (command.trim()) {
          effectiveRunMode = 'custom'
        } else {
          effectiveRunMode = 'shell'
        }
      }

      await updateSessionWithOptions(
        initialSession.id,
        selectedProfile,
        runtimeScriptPlatform === 'windows' ? selectedBackend : '',
        command.trim(),
        cwd.trim(),
        effectiveRunMode,
        effectiveHostId,
        (runMode === 'codex' || runMode === 'docker') ? selectedCodexConfigId : '',
        isExternalPluginMode(runMode) ? selectedPluginConfigId : '',
        isExternalPluginMode(runMode) ? pluginData : {},
        den.trim(),
      )
      saveLastWorkspace(cwd.trim())
      onUpdated()
    } catch (err) {
      setError(String(err))
    } finally {
      setUpdating(false)
    }
  }

  const handlePickWorkspace = async () => {
    setPickingCwd(true)
    try {
      const selected = await pickDirectory(cwd.trim())
      if (selected && selected.trim()) {
        const next = selected.trim()
        setCwd(next)
        saveLastWorkspace(next)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setPickingCwd(false)
    }
  }

  return (
    <ModalShell
      title={t('burrows.edit.title', { name: initialSession.name })}
      description={t('burrows.edit.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updating || !selectedProfile}
          >
            {updating ? t('burrows.edit.saving') : t('burrows.edit.saveRestart')}
          </Button>
        </div>
      )}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.profile')}</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('burrows.edit.loadingProfiles')}</p>
            ) : (
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t('burrows.modal.selectProfile')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">{t('burrows.modal.execEnv')}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <RunModeOption
                mode="local"
                labelKey="burrows.runMode.local"
                activeMode={execEnv}
                onSelect={(mode) => setExecEnv(mode as 'local' | 'ssh')}
              />
              <RunModeOption
                mode="ssh"
                labelKey="burrows.runMode.ssh"
                activeMode={execEnv}
                onSelect={(mode) => setExecEnv(mode as 'local' | 'ssh')}
                disabled={inv.hosts.length === 0}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {execEnv === 'local' ? t('burrows.runMode.localHint') : t('burrows.runMode.sshHint')}
            </div>
          </div>

          {runtimeScriptPlatform === 'windows' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.runtimeBackend')}</label>
              <Select value={selectedBackend} onValueChange={setSelectedBackend}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t('burrows.modal.runtimeBackend')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BACKEND_WSL_TMUX}>{t('burrows.modal.backendWslTmux')}</SelectItem>
                  <SelectItem value={BACKEND_POWERSHELL}>{t('burrows.modal.backendPowerShell')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedBackend === BACKEND_POWERSHELL
                  ? t('burrows.modal.backendPowerShellHint')
                  : t('burrows.modal.backendWslTmuxHint')}
              </p>
            </div>
          )}

          {execEnv === 'ssh' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.sshHost')}</label>
              {inv.hosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.edit.noHostsInline')}</p>
              ) : (
                <Select
                  value={selectedHostId || ''}
                  onValueChange={value => {
                    setSelectedHostId(value)
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectHost')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedHosts.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name || h.host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">{t('common.preview')}</div>
                  <CommandText command={hostCommand} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.workspace')}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={cwd}
                onChange={e => setCwd(e.target.value)}
                placeholder={t('burrows.modal.workspacePlaceholder')}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handlePickWorkspace}
                disabled={updating || pickingCwd}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                {t('burrows.modal.browse')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.workspaceHint')}</p>
          </div>

          <div>
            {execEnv === 'local' && (runMode === 'shell' || runMode === 'custom' || runMode === 'host') && (
              <div className="mb-3">
                <label className="mb-1 block text-sm text-muted-foreground">{t('burrows.modal.scriptPreset')}</label>
                {sortedScriptConfigs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('burrows.modal.scriptPresetEmpty')}</p>
                ) : (
                  <Select
                    value={selectedScriptID || '__none__'}
                    onValueChange={value => {
                      if (value === '__none__') {
                        if (scriptFallback) {
                          setCommand(scriptFallback.command)
                          setCommandMode(scriptFallback.mode)
                        } else {
                          setCommandMode('auto')
                        }
                        setScriptFallback(null)
                        setSelectedScriptID('')
                        return
                      }
                      if (!selectedScriptID) {
                        setScriptFallback({ command, mode: commandMode })
                      }
                      const selectedScript = sortedScriptConfigs.find(item => item.id === value)
                      setSelectedScriptID(value)
                      if (selectedScript?.command) {
                        setCommandMode('manual')
                        setCommand(selectedScript.command)
                      }
                    }}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('burrows.modal.scriptPresetPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('common.none')}</SelectItem>
                      {sortedScriptConfigs.map(cfg => (
                        <SelectItem key={cfg.id} value={cfg.id}>{cfg.name || cfg.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.command')}</label>
            <textarea
              value={command}
              onChange={e => {
                setCommandMode('manual')
                setSelectedScriptID('')
                setScriptFallback(null)
                setCommand(e.target.value)
              }}
              placeholder={execEnv === 'ssh' ? t('burrows.modal.commandSshPlaceholder') : t('burrows.modal.commandPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {t('burrows.modal.commandHint')}
            </div>
          </div>

          {runMode === 'codex' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.codexConfig')}</label>
              {codexConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noCodex')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectCodex')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCodexConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    {t('burrows.modal.launchPreview')}
                  </div>
                  <div className="font-mono">codex</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'docker' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.dockerConfig')}</label>
              {dockerConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noDocker')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectDocker')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedDockerConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (() => {
                const selectedDockerCfg = dockerConfigs.find(c => c.id === selectedCodexConfigId)
                return selectedDockerCfg ? (
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                      <Box className="h-3.5 w-3.5" />
                      {t('burrows.modal.launchPreview')}
                    </div>
                    <div className="font-mono">{['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', selectedDockerCfg.image].join(' ')}</div>
                  </div>
                ) : null
              })()}
	            </div>
	          )}

	          {isExternalPluginMode(runMode) && (
	            <div>
	              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.pluginConfig')}</label>
	              {currentPluginConfigs.length === 0 ? (
	                <p className="text-sm text-muted-foreground">{t('burrows.modal.noPluginConfigs')}</p>
	              ) : (
	                <Select value={selectedPluginConfigId} onValueChange={setSelectedPluginConfigId}>
	                  <SelectTrigger className="bg-background">
	                    <SelectValue placeholder={t('burrows.modal.selectPluginConfig')} />
	                  </SelectTrigger>
	                  <SelectContent>
	                    {currentPluginConfigs.map(cfg => (
	                      <SelectItem key={cfg.id} value={cfg.id}>
	                        {cfg.name || cfg.id}
	                      </SelectItem>
	                    ))}
	                  </SelectContent>
	                </Select>
	              )}
	              {runMode === 'k8s_pod' && (
	                <div className="mt-3">
	                  <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.podQuery')}</label>
	                  <input
	                    type="text"
	                    value={pluginData.pod_query || ''}
	                    onChange={e => setPluginData(prev => ({ ...prev, pod_query: e.target.value }))}
	                    placeholder={t('burrows.modal.podQueryPlaceholder')}
	                    className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
	                  />
	                </div>
	              )}
	              {selectedPluginConfig && (
	                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
	                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
	                    <TerminalSquare className="h-3.5 w-3.5" />
	                    {t('burrows.modal.launchPreview')}
	                  </div>
	                  <div className="mb-1 font-mono">{pluginConfigSummary(runMode, selectedPluginConfig)}</div>
	                  <div className="font-mono text-muted-foreground/80">{buildPluginCommandPreview(runMode, selectedPluginConfig, pluginData)}</div>
	                </div>
	              )}
	            </div>
	          )}


	          <div>
	            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.den')}</label>
            <input
              type="text"
              value={den}
              onChange={e => setDen(e.target.value)}
              placeholder={t('burrows.modal.denPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.denHint')}</p>
          </div>
      </div>
    </ModalShell>
  )
}

export default Sessions

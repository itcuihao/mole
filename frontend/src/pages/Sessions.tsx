import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ListSessions, AttachSession, AttachSessionWithTerminal, KillSession, CreateSession, UpdateSession, RestartSession, ListProfiles, GetInstalledTerminals, GetDefaultTerminal, GetInventory } from '../../wailsjs/go/main/App'
import { session, profile, terminal, inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Play, Plus, TerminalSquare, Pencil, Trash2, X, ChevronDown, FolderGit2, Server, Wrench, CheckCircle2, ChevronRight } from "lucide-react"
import type { AppTab } from '../App'

type RunMode = 'shell' | 'host' | 'custom'

const RUN_MODE_LABELS: Record<RunMode, string> = {
  shell: 'Shell',
  host: 'SSH Host',
  custom: 'Command',
}

const RUN_MODE_HINTS: Record<RunMode, string> = {
  shell: 'Just open a terminal with this profile.',
  host: 'Pick a saved host and Mole will build the SSH command.',
  custom: 'Run a command as soon as the session starts.',
}

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

const buildSSHCommand = (
  host: inventory.Host,
  defaults: inventory.HostDefaults,
  hostMap: Map<string, inventory.Host>
) => {
  if (!host.host) return ''
  const user = host.user || defaults.user
  const port = host.port || defaults.port
  const identity = host.identity_file || defaults.identity_file
  const bastion = host.bastion_id ? hostMap.get(host.bastion_id) : null

  const parts = ['ssh']
  if (identity) {
    parts.push('-i', identity)
  }
  if (port && port !== 22) {
    parts.push('-p', String(port))
  }
  if (bastion && bastion.host) {
    const bastionUser = bastion.user || defaults.user
    const bastionTarget = `${bastionUser ? `${bastionUser}@` : ''}${bastion.host}`
    parts.push('-J', bastionTarget)
  }
  parts.push(`${user ? `${user}@` : ''}${host.host}`)
  return parts.join(' ')
}

const findHostIDForCommand = (
  command: string,
  inv: inventory.Inventory,
  hostMap: Map<string, inventory.Host>
) => {
  const normalized = command.trim()
  if (!normalized) return ''

  for (const host of inv.hosts) {
    if (buildSSHCommand(host, inv.defaults, hostMap) === normalized) {
      return host.id
    }
  }

  return ''
}

function RunModeOption({
  mode,
  activeMode,
  onSelect,
  disabled = false,
}: {
  mode: RunMode
  activeMode: RunMode
  onSelect: (mode: RunMode) => void
  disabled?: boolean
}) {
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
          {RUN_MODE_LABELS[mode]}
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

function Sessions({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void
}) {
  const [sessions, setSessions] = useState<session.SessionStatus[]>([])
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingSession, setEditingSession] = useState<session.SessionStatus | null>(null)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [profileCount, setProfileCount] = useState(0)
  const [inventoryCount, setInventoryCount] = useState(0)
  const [sessionAction, setSessionAction] = useState<{ id: string, kind: 'open' | 'kill' } | null>(null)

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListSessions()
        .then(setSessions)
        .catch(err => setError(String(err)))
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      GetInstalledTerminals()
        .then(t => setTerminals(t || []))
        .catch(() => {})

      GetDefaultTerminal()
        .then(term => setDefaultTerminal(term || ''))
        .catch(() => {})

      ListProfiles()
        .then(p => setProfileCount((p || []).length))
        .catch(() => {})

      GetInventory()
        .then(data => setInventoryCount((data?.hosts || []).length))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const showTimedInfo = (text: string, duration = 7000) => {
    setInfoMessage(text)
    setTimeout(() => setInfoMessage(''), duration)
  }

  const showAttachHint = (terminalID: string, wasRestarted = false) => {
    const needsManualPaste = ['warp', 'alacritty', 'kitty', 'rio', 'ghostty'].includes(terminalID)

    if (needsManualPaste) {
      showTimedInfo(
        wasRestarted
          ? 'Session restored and terminal opened. Command copied to clipboard. Press Cmd+V, then Enter.'
          : 'Terminal opened. Command copied to clipboard. Press Cmd+V, then Enter.'
      )
      return
    }

    if (wasRestarted) {
      showTimedInfo('Session restored and opened.')
    }
  }

  const handleOpenSession = async (sess: session.SessionStatus, terminalID?: string) => {
    const resolvedTerminal = terminalID || defaultTerminal
    const wasRestarted = !sess.alive

    setSessionAction({ id: sess.id, kind: 'open' })
    setError('')
    try {
      if (!sess.alive) {
        await RestartSession(sess.id)
      }

      if (terminalID) {
        await AttachSessionWithTerminal(sess.tmux_session_name, terminalID)
      } else {
        await AttachSession(sess.tmux_session_name)
      }

      showAttachHint(resolvedTerminal, wasRestarted)
      refresh()
    } catch (err) {
      const errorMsg = String(err)
      console.error('❌ Open session failed:', errorMsg)
      setError(errorMsg)
    } finally {
      setSessionAction(null)
    }
  }

  const handleKill = async (sess: session.SessionStatus) => {
    setSessionAction({ id: sess.id, kind: 'kill' })
    setError('')
    try {
      await KillSession(sess.tmux_session_name)
      if (!sess.alive) {
        showTimedInfo('Offline session removed.')
      }
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
        <Button onClick={() => setShowNewModal(true)} size="sm">
          <Plus className="w-4 h-4" />
          New Session
        </Button>
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

      {sessions.length === 0 ? (
        <EmptySessionsState
          profileCount={profileCount}
          hostCount={inventoryCount}
          onCreateSession={() => setShowNewModal(true)}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="grid gap-3">
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              terminals={terminals}
              onOpen={handleOpenSession}
              onKill={handleKill}
              onEdit={setEditingSession}
              isWorking={sessionAction?.id === s.id}
              currentAction={sessionAction?.id === s.id ? sessionAction.kind : null}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); refresh() }}
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
  onEdit,
  isWorking,
  currentAction,
}: {
  session: session.SessionStatus
  terminals: terminal.TerminalApp[]
  onOpen: (session: session.SessionStatus, terminalID?: string) => void
  onKill: (session: session.SessionStatus) => void
  onEdit: (session: session.SessionStatus) => void
  isWorking: boolean
  currentAction: 'open' | 'kill' | null
}) {
  const [showTerminalMenu, setShowTerminalMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowTerminalMenu(false)
      }
    }
    if (showTerminalMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTerminalMenu])

  const statusColor = !s.alive
    ? 'bg-muted-foreground/70'
    : s.attached
      ? 'bg-green-500 dark:bg-green-400'
      : 'bg-yellow-500 dark:bg-yellow-400'
  const statusText = !s.alive ? 'offline' : (s.attached ? 'attached' : 'ready')
  const primaryLabel = isWorking && currentAction === 'open'
    ? (!s.alive ? 'Restoring...' : 'Opening...')
    : (!s.alive ? 'Restore & Attach' : 'Attach')
  const destructiveLabel = isWorking && currentAction === 'kill'
    ? (!s.alive ? 'Removing...' : 'Killing...')
    : (!s.alive ? 'Remove' : 'Kill')

  const handleTerminalSelect = (terminalID: string) => {
    setShowTerminalMenu(false)
    onOpen(s, terminalID)
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border hover:border-primary/30 transition-all">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{s.name}</div>
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
            {s.alive ? `${s.windows} window${s.windows !== 1 ? 's' : ''}` : 'will restore on open'}
          </div>
          {s.command && (
            <div className="text-xs text-muted-foreground/70 font-mono mt-1.5 truncate" title={`Auto-runs on first attach: ${s.command}`}>
              startup: {s.command}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative" ref={menuRef}>
          <div className="flex">
            <Button
              onClick={() => onOpen(s)}
              size="sm"
              className="rounded-r-none pr-2"
              disabled={isWorking}
            >
              <Play className="w-3.5 h-3.5" />
              {primaryLabel}
            </Button>
            {terminals.length > 0 && (
              <Button
                onClick={() => setShowTerminalMenu(!showTerminalMenu)}
                size="sm"
                className="rounded-l-none pl-1 pr-1.5 border-l border-primary-foreground/20"
                disabled={isWorking}
              >
                <ChevronDown className="w-3 h-3" />
              </Button>
            )}
          </div>
          {showTerminalMenu && terminals.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 py-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Open with
              </div>
              {terminals.map(term => (
                <button
                  key={term.ID}
                  onClick={() => handleTerminalSelect(term.ID)}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <TerminalSquare className="w-4 h-4 text-muted-foreground" />
                  <span>{term.Name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => onEdit(s)} variant="secondary" size="sm" disabled={isWorking}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
        <Button onClick={() => onKill(s)} variant="destructive" size="sm" disabled={isWorking}>
          <Trash2 className="w-3.5 h-3.5" />
          {destructiveLabel}
        </Button>
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
  onNavigate: (tab: AppTab) => void
}) {
  const checklist = [
    {
      key: 'profile',
      title: 'Create a profile',
      description: 'Profiles hold environment variables and secrets for a session.',
      done: profileCount > 0,
      actionLabel: profileCount > 0 ? 'Manage Profiles' : 'Add Profile',
      action: () => onNavigate('profiles'),
      icon: FolderGit2,
    },
    {
      key: 'host',
      title: 'Add a host',
      description: 'Optional, but useful when you want Mole to generate SSH startup commands.',
      done: hostCount > 0,
      actionLabel: hostCount > 0 ? 'Manage Hosts' : 'Add Host',
      action: () => onNavigate('hosts'),
      icon: Server,
    },
    {
      key: 'session',
      title: 'Start a session',
      description: 'Choose a profile, then run a local shell, a saved host command, or a custom command.',
      done: false,
      actionLabel: 'New Session',
      action: onCreateSession,
      icon: Wrench,
    },
  ]

  return (
    <Card className="overflow-hidden border-primary/15">
      <CardHeader className="border-b border-border/70 bg-card/70">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TerminalSquare className="w-5 h-5 text-primary" />
          Session Setup
        </CardTitle>
        <CardDescription>
          Mole works best when you move through setup in a clear order instead of guessing which tab comes first.
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
                  {item.done && <Badge variant="secondary" className="text-[10px]">Ready</Badge>}
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
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [selectedHostId, setSelectedHostId] = useState('')
  const [runMode, setRunMode] = useState<RunMode>('shell')
  const [sessionName, setSessionName] = useState('')
  const [command, setCommand] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => {
          setProfiles(p || [])
          if (p && p.length > 0) setSelectedProfile(p[0].id)
        })
        .catch(err => setError(String(err)))

      GetInventory()
        .then(data => setInv(data || EMPTY_INVENTORY))
        .catch(() => {})
    }
  }, [])

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''

  useEffect(() => {
    if (runMode === 'shell') {
      setSelectedHostId('')
      setCommand('')
      return
    }

    if (runMode === 'host') {
      if (!selectedHostId && inv.hosts.length > 0) {
        const firstHost = inv.hosts[0]
        setSelectedHostId(firstHost.id)
        const nextCommand = buildSSHCommand(firstHost, inv.defaults, hostMap)
        setCommand(nextCommand)
      } else if (selectedHost && hostCommand) {
        setCommand(hostCommand)
      }
      return
    }

    if (runMode === 'custom') {
      setSelectedHostId('')
    }
  }, [runMode, inv.hosts, selectedHostId, selectedHost, hostCommand, inv.defaults, hostMap])

  const handleCreate = async () => {
    if (!selectedProfile || !sessionName.trim()) return
    setCreating(true)
    setError('')
    try {
      await CreateSession(selectedProfile, sessionName.trim(), command.trim())
      onCreated()
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <ModalShell
      title="New Session"
      description="Choose a profile and how this session should start."
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !selectedProfile || !sessionName.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
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
            <label className="block text-sm text-muted-foreground mb-1">Profile</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profiles yet. Create one in the Profiles tab first.</p>
            ) : (
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Start With</label>
            <div className="grid gap-2 sm:grid-cols-3">
              <RunModeOption mode="shell" activeMode={runMode} onSelect={setRunMode} />
              <RunModeOption mode="host" activeMode={runMode} onSelect={setRunMode} disabled={inv.hosts.length === 0} />
              <RunModeOption mode="custom" activeMode={runMode} onSelect={setRunMode} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {RUN_MODE_HINTS[runMode]}
            </div>
          </div>

          {runMode === 'host' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">SSH Host</label>
              {inv.hosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hosts yet. Add one in the Hosts tab first.</p>
              ) : (
                <Select
                  value={selectedHostId || inv.hosts[0]?.id || ''}
                  onValueChange={value => {
                    setSelectedHostId(value)
                    const host = value ? hostMap.get(value) : null
                    const nextCommand = host ? buildSSHCommand(host, inv.defaults, hostMap) : ''
                    setCommand(nextCommand)
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a saved host" />
                  </SelectTrigger>
                  <SelectContent>
                    {inv.hosts.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name || h.host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Preview</div>
                  <div className="font-mono break-all">{hostCommand}</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'custom' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Command</label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="e.g., claude&#10;or: npm run dev&#10;or: ssh -J jumphost deploy@target"
                rows={3}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Session Name</label>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g., work-claude"
              pattern="[a-zA-Z0-9_-]+"
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Letters, digits, underscores, dashes only</p>
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
  session: session.SessionStatus
  onClose: () => void
  onUpdated: () => void
}) {
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(initialSession.profile_id)
  const [command, setCommand] = useState(initialSession.command || '')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [selectedHostId, setSelectedHostId] = useState('')
  const [runMode, setRunMode] = useState<RunMode>(initialSession.command ? 'custom' : 'shell')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)

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
    }
  }, [])

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''

  useEffect(() => {
    if (!hydrated) return

    const matchingHostID = findHostIDForCommand(initialSession.command || '', inv, hostMap)
    if (matchingHostID) {
      setRunMode('host')
      setSelectedHostId(matchingHostID)
      setCommand(initialSession.command || '')
      return
    }

    if ((initialSession.command || '').trim()) {
      setRunMode('custom')
      setCommand(initialSession.command || '')
      return
    }

    setRunMode('shell')
    setCommand('')
  }, [hydrated, initialSession.command, inv, hostMap])

  useEffect(() => {
    if (runMode === 'shell') {
      setSelectedHostId('')
      setCommand('')
      return
    }

    if (runMode === 'host') {
      if (!selectedHostId && inv.hosts.length > 0) {
        const firstHost = inv.hosts[0]
        setSelectedHostId(firstHost.id)
        setCommand(buildSSHCommand(firstHost, inv.defaults, hostMap))
        return
      }

      if (selectedHost && hostCommand) {
        setCommand(hostCommand)
      }
      return
    }

    if (runMode === 'custom') {
      setSelectedHostId('')
    }
  }, [runMode, selectedHostId, selectedHost, hostCommand, inv.hosts, inv.defaults, hostMap])

  const handleUpdate = async () => {
    if (!selectedProfile) return
    setUpdating(true)
    setError('')
    try {
      await UpdateSession(initialSession.id, selectedProfile, command.trim())
      onUpdated()
    } catch (err) {
      setError(String(err))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <ModalShell
      title={`Edit Session: ${initialSession.name}`}
      description="Saving will restart this tmux session."
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updating || !selectedProfile}
          >
            {updating ? 'Saving...' : 'Save & Restart'}
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
            <label className="block text-sm text-muted-foreground mb-1">Profile</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading profiles...</p>
            ) : (
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Start With</label>
            <div className="grid gap-2 sm:grid-cols-3">
              <RunModeOption mode="shell" activeMode={runMode} onSelect={setRunMode} />
              <RunModeOption mode="host" activeMode={runMode} onSelect={setRunMode} disabled={inv.hosts.length === 0} />
              <RunModeOption mode="custom" activeMode={runMode} onSelect={setRunMode} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {RUN_MODE_HINTS[runMode]}
            </div>
          </div>

          {runMode === 'host' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">SSH Host</label>
              {inv.hosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hosts yet. Add one in the Hosts tab first.</p>
              ) : (
                <Select
                  value={selectedHostId || ''}
                  onValueChange={value => {
                    setSelectedHostId(value)
                    const host = hostMap.get(value)
                    const nextCommand = host ? buildSSHCommand(host, inv.defaults, hostMap) : ''
                    setCommand(nextCommand)
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a saved host" />
                  </SelectTrigger>
                  <SelectContent>
                    {inv.hosts.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name || h.host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Preview</div>
                  <div className="font-mono break-all">{hostCommand}</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'custom' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Command</label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="e.g., claude&#10;or: npm run dev&#10;or: ssh -J jumphost deploy@target"
                rows={3}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
              />
            </div>
          )}
      </div>
    </ModalShell>
  )
}

export default Sessions

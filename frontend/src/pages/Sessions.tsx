import { useState, useEffect, useCallback, useRef } from 'react'
import { ListSessions, AttachSession, AttachSessionWithTerminal, KillSession, CreateSession, UpdateSession, ListProfiles, GetInstalledTerminals, GetDefaultTerminal } from '../../wailsjs/go/main/App'
import { session, profile, terminal } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Play, Square, Edit2, Plus, Terminal as TerminalIcon, Pencil, Trash2, X, ChevronDown } from "lucide-react"

const TERMINAL_ICONS: Record<string, string> = {
  'terminal': '🖥️',
  'iterm2': '🔷',
  'ghostty': '👻',
  'rio': '🌊',
  'alacritty': '⚡',
  'warp': '🚀',
  'kitty': '🐱',
}

function Sessions() {
  const [sessions, setSessions] = useState<session.SessionStatus[]>([])
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingSession, setEditingSession] = useState<session.SessionStatus | null>(null)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

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
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleAttach = async (tmuxName: string) => {
    try {
      await AttachSession(tmuxName)
      // Use default terminal for hint check
      showAttachHint(defaultTerminal)
    } catch (err) {
      const errorMsg = String(err)
      console.error('❌ Attach failed:', errorMsg)
      setError(errorMsg)
    }
  }

  const handleAttachWithTerminal = async (tmuxName: string, terminalID: string) => {
    try {
      await AttachSessionWithTerminal(tmuxName, terminalID)
      showAttachHint(terminalID)
    } catch (err) {
      const errorMsg = String(err)
      console.error('❌ AttachWithTerminal failed:', errorMsg)
      setError(errorMsg)
    }
  }

  const showAttachHint = (terminalID: string) => {
    // Terminals that need manual paste (auto-paste failed or not supported)
    const needsManualPaste = ['warp', 'alacritty', 'kitty', 'rio', 'ghostty'].includes(terminalID)

    if (needsManualPaste) {
      setInfoMessage('✨ Terminal opened! Command copied to clipboard — Press Cmd+V to paste, then Enter.')
      setTimeout(() => setInfoMessage(''), 7000)
    }
  }

  const handleKill = async (tmuxName: string) => {
    try {
      await KillSession(tmuxName)
      refresh()
    } catch (err) {
      setError(String(err))
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
            <span className="text-lg mt-0.5">💡</span>
            <span className="flex-1 leading-relaxed">{infoMessage}</span>
          </div>
          <Button onClick={() => setInfoMessage('')} variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20 rounded-full">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No active sessions. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              terminals={terminals}
              onAttach={handleAttach}
              onAttachWithTerminal={handleAttachWithTerminal}
              onKill={handleKill}
              onEdit={setEditingSession}
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
  onAttach,
  onAttachWithTerminal,
  onKill,
  onEdit,
}: {
  session: session.SessionStatus
  terminals: terminal.TerminalApp[]
  onAttach: (name: string) => void
  onAttachWithTerminal: (name: string, terminalID: string) => void
  onKill: (name: string) => void
  onEdit: (session: session.SessionStatus) => void
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

  const statusColor = s.attached
    ? 'bg-green-500 dark:bg-green-400'
    : 'bg-yellow-500 dark:bg-yellow-400'
  const statusText = s.attached ? 'attached' : 'detached'

  const handleTerminalSelect = (terminalID: string) => {
    setShowTerminalMenu(false)
    onAttachWithTerminal(s.tmux_session_name, terminalID)
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
            {s.windows} window{s.windows !== 1 ? 's' : ''}
          </div>
          {s.command && (
            <div className="text-xs text-muted-foreground/70 font-mono mt-1.5 truncate" title={`Auto-runs on first attach: ${s.command}`}>
              ⚡ {s.command}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onEdit(s)} variant="secondary" size="sm">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
        <div className="relative" ref={menuRef}>
          <div className="flex">
            <Button
              onClick={() => onAttach(s.tmux_session_name)}
              size="sm"
              className="rounded-r-none pr-2"
            >
              <Play className="w-3.5 h-3.5" />
              Attach
            </Button>
            {terminals.length > 0 && (
              <Button
                onClick={() => setShowTerminalMenu(!showTerminalMenu)}
                size="sm"
                className="rounded-l-none pl-1 pr-1.5 border-l border-primary-foreground/20"
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
                  <span className="text-base">{TERMINAL_ICONS[term.ID] || '📟'}</span>
                  <span>{term.Name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => onKill(s.tmux_session_name)} variant="destructive" size="sm">
          <Trash2 className="w-3.5 h-3.5" />
          Kill
        </Button>
      </div>
    </div>
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
    }
  }, [])

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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-96 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">New Session</h2>

        {error && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm">
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

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Startup Command (Optional)</label>
            <textarea
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g., ssh -J jumphost.com user@target-host&#10;or: claude&#10;or: ./scripts/setup.sh&#10;Leave empty for default shell"
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
            />
            <p className="text-xs text-muted-foreground mt-1">Command to run with the profile's environment. Multi-line supported.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
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
      </div>
    </div>
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
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))
    }
  }, [])

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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-96 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-4">Edit Session: {initialSession.name}</h2>

        {error && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="mb-3 p-2 bg-warning/10 border border-warning/50 rounded text-warning-foreground text-sm">
          Note: Updating will restart the tmux session
        </div>

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
            <label className="block text-sm text-muted-foreground mb-1">Startup Command (Optional)</label>
            <textarea
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g., ssh -J jumphost.com user@target-host&#10;or: claude&#10;or: ./scripts/setup.sh&#10;Leave empty for default shell"
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
            />
            <p className="text-xs text-muted-foreground mt-1">Command to run with the profile's environment. Multi-line supported.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updating || !selectedProfile}
          >
            {updating ? 'Updating...' : 'Update & Restart'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Sessions

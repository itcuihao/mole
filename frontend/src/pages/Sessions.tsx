import { useState, useEffect, useCallback } from 'react'
import { ListSessions, AttachSession, KillSession, CreateSession, UpdateSession, ListProfiles } from '../../wailsjs/go/main/App'
import { session, profile } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Play, Square, Edit2, Plus, Terminal as TerminalIcon } from "lucide-react"

function Sessions() {
  const [sessions, setSessions] = useState<session.SessionStatus[]>([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingSession, setEditingSession] = useState<session.SessionStatus | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListSessions()
        .then(setSessions)
        .catch(err => setError(String(err)))
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
    } catch (err) {
      setError(String(err))
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
        <h1 className="text-xl font-semibold">Sessions</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
        >
          + New Session
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-300">x</button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No active sessions. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onAttach={handleAttach}
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
  onAttach,
  onKill,
  onEdit,
}: {
  session: session.SessionStatus
  onAttach: (name: string) => void
  onKill: (name: string) => void
  onEdit: (session: session.SessionStatus) => void
}) {
  const statusColor = s.attached ? 'bg-green-500' : 'bg-yellow-500'
  const statusText = s.attached ? 'attached' : 'detached'

  return (
    <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
        <div>
          <div className="font-medium">{s.name}</div>
          <div className="text-sm text-gray-400">
            {s.profile_name && (
              <span className="inline-flex items-center gap-1">
                {s.profile_color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.profile_color }}
                  />
                )}
                {s.profile_name}
                <span className="mx-1 text-gray-600">|</span>
              </span>
            )}
            {statusText}
            <span className="mx-1 text-gray-600">|</span>
            {s.windows} window{s.windows !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onEdit(s)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onAttach(s.tmux_session_name)}
          className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-sm transition-colors"
        >
          Attach
        </button>
        <button
          onClick={() => onKill(s.tmux_session_name)}
          className="px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-sm transition-colors"
        >
          Kill
        </button>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">New Session</h2>

        {error && (
          <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Profile</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-gray-500">No profiles yet. Create one in the Profiles tab first.</p>
            ) : (
              <select
                value={selectedProfile}
                onChange={e => setSelectedProfile(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Session Name</label>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g., work-claude"
              pattern="[a-zA-Z0-9_-]+"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">Letters, digits, underscores, dashes only</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Startup Command (Optional)</label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g., claude, python, or leave empty for shell"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">Command to run with the profile's environment</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedProfile || !sessionName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Edit Session: {initialSession.name}</h2>

        {error && (
          <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-200 text-sm">
          Note: Updating will restart the tmux session
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Profile</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-gray-500">Loading profiles...</p>
            ) : (
              <select
                value={selectedProfile}
                onChange={e => setSelectedProfile(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Startup Command (Optional)</label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g., claude, python, or leave empty for shell"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">Command to run with the profile's environment</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating || !selectedProfile}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {updating ? 'Updating...' : 'Update & Restart'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sessions

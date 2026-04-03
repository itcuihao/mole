import { useState, useEffect, useCallback } from 'react'
import { ListProfiles, SaveProfile, DeleteProfile } from '../../wailsjs/go/main/App'
import { profile } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Upload, X, Check } from "lucide-react"

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

function Profiles() {
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [editingProfile, setEditingProfile] = useState<profile.Profile | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleNew = () => {
    setEditingProfile(new profile.Profile({
      id: '',
      name: '',
      description: '',
      color: PRESET_COLORS[0],
      env_vars: {},
      secret_keys: [],
    }))
    setIsNew(true)
  }

  const handleEdit = (p: profile.Profile) => {
    setEditingProfile(p)
    setIsNew(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await DeleteProfile(id)
      refresh()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleSave = () => {
    setEditingProfile(null)
    refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">Profiles</h1>
        <Button onClick={handleNew} size="sm">
          <Plus className="w-4 h-4" />
          Add Profile
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

      {editingProfile ? (
        <ProfileForm
          profile={editingProfile}
          isNew={isNew}
          onSave={handleSave}
          onCancel={() => setEditingProfile(null)}
        />
      ) : profiles.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No profiles yet. Create one to configure environment variables.
        </div>
      ) : (
        <div className="grid gap-3">
          {profiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileCard({
  profile: p,
  onEdit,
  onDelete,
}: {
  profile: profile.Profile
  onEdit: (p: profile.Profile) => void
  onDelete: (id: string) => void
}) {
  const envCount = Object.keys(p.env_vars || {}).length
  const secretCount = (p.secret_keys || []).length

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border hover:border-primary/30 transition-all">
      <div className="flex items-center gap-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: p.color || '#6B7280' }}
        />
        <div>
          <div className="font-medium text-foreground">{p.name}</div>
          <div className="text-sm text-muted-foreground">
            {p.description && <span>{p.description} | </span>}
            {envCount} var{envCount !== 1 ? 's' : ''}
            {secretCount > 0 && `, ${secretCount} secret${secretCount !== 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onEdit(p)} variant="secondary" size="sm">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
        <Button onClick={() => onDelete(p.id)} variant="destructive" size="sm">
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}

interface EnvEntry {
  key: string
  value: string
  isSecret: boolean
}

function ProfileForm({
  profile: initial,
  isNew,
  onSave,
  onCancel,
}: {
  profile: profile.Profile
  isNew: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [color, setColor] = useState(initial.color || PRESET_COLORS[0])
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(() => {
    const entries: EnvEntry[] = []
    const secretKeys = new Set(initial.secret_keys || [])
    for (const [key, value] of Object.entries(initial.env_vars || {})) {
      entries.push({ key, value, isSecret: false })
    }
    for (const key of secretKeys) {
      if (!entries.find(e => e.key === key)) {
        entries.push({ key, value: '', isSecret: true })
      }
    }
    return entries
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showBulkImport, setShowBulkImport] = useState(false)

  const addEntry = () => {
    setEnvEntries([...envEntries, { key: '', value: '', isSecret: false }])
  }

  const removeEntry = (idx: number) => {
    setEnvEntries(envEntries.filter((_, i) => i !== idx))
  }

  const updateEntry = (idx: number, field: keyof EnvEntry, value: string | boolean) => {
    const updated = [...envEntries]
    updated[idx] = { ...updated[idx], [field]: value }
    setEnvEntries(updated)
  }

  const handleBulkImport = (text: string) => {
    const newEntries: EnvEntry[] = []
    const lines = text.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Try JSON format: {"KEY": "value", ...}
      if (trimmed.startsWith('{')) {
        try {
          const obj = JSON.parse(trimmed)
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              newEntries.push({ key, value, isSecret: false })
            }
          }
          continue
        } catch {
          // Not JSON, try other formats
        }
      }

      // Try export format: export KEY=value or export KEY="value"
      const exportMatch = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (exportMatch) {
        const key = exportMatch[1]
        let value = exportMatch[2]
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        newEntries.push({ key, value, isSecret: false })
        continue
      }

      // Try simple format: KEY=value or KEY="value"
      const simpleMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (simpleMatch) {
        const key = simpleMatch[1]
        let value = simpleMatch[2]
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        newEntries.push({ key, value, isSecret: false })
      }
    }

    // Merge with existing entries (avoid duplicates)
    const existingKeys = new Set(envEntries.map(e => e.key))
    const merged = [...envEntries]
    for (const entry of newEntries) {
      if (!existingKeys.has(entry.key)) {
        merged.push(entry)
      }
    }

    setEnvEntries(merged)
    setShowBulkImport(false)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    try {
      const envVars: Record<string, string> = {}
      const secretKeys: string[] = []
      const secrets: Record<string, string> = {}

      for (const entry of envEntries) {
        if (!entry.key.trim()) continue
        if (entry.isSecret) {
          secretKeys.push(entry.key)
          if (entry.value) {
            secrets[entry.key] = entry.value
          }
        } else {
          envVars[entry.key] = entry.value
        }
      }

      const p = new profile.Profile({
        id: initial.id,
        name: name.trim(),
        description: description.trim(),
        color,
        env_vars: envVars,
        secret_keys: secretKeys,
      })

      await SaveProfile(p, secrets)
      onSave()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {isNew ? 'New Profile' : 'Edit Profile'}
      </h2>

      {error && (
        <div className="mb-3 p-2 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Maxx Proxy"
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">Color</label>
          <div className="flex gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full border-2 transition-all relative flex items-center justify-center border-border hover:scale-105"
                style={{ backgroundColor: c }}
                title={c}
              >
                {color === c && (
                  <Check className="w-4 h-4 text-white drop-shadow-md" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-muted-foreground">Environment Variables</label>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowBulkImport(true)}
                variant="ghost"
                size="sm"
              >
                <Upload className="w-3.5 h-3.5" />
                Bulk Import
              </Button>
              <Button
                onClick={addEntry}
                variant="ghost"
                size="sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Variable
              </Button>
            </div>
          </div>

          {envEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No variables. Click "Add Variable" to add one.</p>
          ) : (
            <div className="space-y-2">
              {envEntries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={e => updateEntry(idx, 'key', e.target.value)}
                    placeholder="KEY"
                    className="flex-1 px-3 py-1.5 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type={entry.isSecret ? 'password' : 'text'}
                    value={entry.value}
                    onChange={e => updateEntry(idx, 'value', e.target.value)}
                    placeholder={entry.isSecret ? '(stored in Keychain)' : 'value'}
                    className="flex-1 px-3 py-1.5 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={entry.isSecret}
                      onChange={e => updateEntry(idx, 'isSecret', e.target.checked)}
                      className="rounded"
                    />
                    Secret
                  </label>
                  <Button
                    onClick={() => removeEntry(idx)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {showBulkImport && (
        <BulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </div>
  )
}

function BulkImportModal({
  onImport,
  onClose,
}: {
  onImport: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-96 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground mb-3">Bulk Import Variables</h3>

        <div className="mb-3 text-sm text-muted-foreground">
          <p className="mb-2">Supported formats:</p>
          <div className="bg-muted p-2 rounded text-xs font-mono space-y-1 text-foreground">
            <div>export KEY=value</div>
            <div>KEY=value</div>
            <div>KEY="quoted value"</div>
            <div>{`{"KEY": "value", "KEY2": "value2"}`}</div>
          </div>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste your environment variables here..."
          rows={8}
          className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono resize placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={() => onImport(text)}
            disabled={!text.trim()}
          >
            Import
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Profiles

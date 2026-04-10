import { useState, useEffect, useCallback, useMemo } from 'react'
import { ListProfiles, SaveProfile, DeleteProfile } from '../../wailsjs/go/main/App'
import { profile } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/ui/modal-shell"
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Upload, X, Check, Copy } from "lucide-react"

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

const ENV_VAR_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const ENV_VAR_KEY_RULES = 'Use letters, digits, and underscores, and do not start with a digit.'
const ENV_VAR_KEY_DUPLICATE = 'Variable names must be unique within a profile.'
const ENV_VAR_KEY_HINT = 'Recommended: UPPER_SNAKE_CASE. Lowercase is allowed and Mole preserves case.'

const normalizeEnvKey = (key: string) => key.trim()

const compareByLabel = (left: string, right: string) => (
  left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
)

function Profiles({
  refreshSignal,
}: {
  refreshSignal?: number
}) {
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [editingProfile, setEditingProfile] = useState<profile.Profile | null>(null)
  const [viewingProfile, setViewingProfile] = useState<profile.Profile | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh, refreshSignal])

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

  const handleView = (p: profile.Profile) => {
    setViewingProfile(p)
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

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareByLabel(a.name || '', b.name || ''))
  ), [profiles])

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

      {profiles.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No profiles yet. Create one to configure environment variables.
        </div>
      ) : (
        <div className="grid gap-3">
          {sortedProfiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {editingProfile && (
        <ProfileForm
          profile={editingProfile}
          isNew={isNew}
          onSave={handleSave}
          onCancel={() => setEditingProfile(null)}
        />
      )}

      {viewingProfile && (
        <ViewProfileModal
          profile={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}
    </div>
  )
}

function ProfileCard({
  profile: p,
  onView,
  onEdit,
  onDelete,
}: {
  profile: profile.Profile
  onView: (p: profile.Profile) => void
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
        <Button onClick={() => onView(p)} variant="outline" size="sm" title="View and copy environment variables">
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
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

    // Load all env vars (secrets are now also in env_vars)
    for (const [key, value] of Object.entries(initial.env_vars || {})) {
      entries.push({
        key,
        value,
        isSecret: secretKeys.has(key) // Mark as secret if in secret_keys list
      })
    }

    return entries
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showBulkImport, setShowBulkImport] = useState(false)
  const envEntryIssues = useMemo(() => {
    const issues = new Map<number, string[]>()
    const indexesByKey = new Map<string, number[]>()

    envEntries.forEach((entry, idx) => {
      const key = normalizeEnvKey(entry.key)
      if (!key) return

      if (!ENV_VAR_KEY_PATTERN.test(key)) {
        issues.set(idx, [ENV_VAR_KEY_RULES])
      }

      const indexes = indexesByKey.get(key) ?? []
      indexes.push(idx)
      indexesByKey.set(key, indexes)
    })

    indexesByKey.forEach((indexes) => {
      if (indexes.length < 2) return

      indexes.forEach((index) => {
        const messages = issues.get(index) ?? []
        issues.set(index, [...messages, ENV_VAR_KEY_DUPLICATE])
      })
    })

    return issues
  }, [envEntries])

  const addEntry = () => {
    setError('')
    setEnvEntries([...envEntries, { key: '', value: '', isSecret: false }])
  }

  const removeEntry = (idx: number) => {
    setError('')
    setEnvEntries(envEntries.filter((_, i) => i !== idx))
  }

  const updateEntry = (idx: number, field: keyof EnvEntry, value: string | boolean) => {
    setError('')
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
    const existingKeys = new Set(
      envEntries
        .map(entry => normalizeEnvKey(entry.key))
        .filter(Boolean)
    )
    const merged = [...envEntries]
    for (const entry of newEntries) {
      const key = normalizeEnvKey(entry.key)
      if (!key || existingKeys.has(key)) continue

      existingKeys.add(key)
      merged.push({ ...entry, key })
    }

    setError('')
    setEnvEntries(merged)
    setShowBulkImport(false)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return

    if (envEntryIssues.size > 0) {
      setError('Fix invalid or duplicate variable names before saving.')
      return
    }

    setError('')
    setSaving(true)

    try {
      const envVars: Record<string, string> = {}
      const secretKeys: string[] = []
      const secrets: Record<string, string> = {}

      for (const entry of envEntries) {
        const key = normalizeEnvKey(entry.key)
        if (!key) continue

        if (entry.isSecret) {
          secretKeys.push(key)
          if (entry.value) {
            secrets[key] = entry.value
          }
        } else {
          envVars[key] = entry.value
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
    <>
      <ModalShell
        title={isNew ? 'New Profile' : `Edit Profile: ${initial.name}`}
        description="Profiles hold environment variables and secret flags used when sessions start."
        onClose={onCancel}
        contentClassName="max-w-[920px]"
        footer={(
          <div className="flex justify-end gap-2">
            <Button onClick={onCancel} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || envEntryIssues.size > 0}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Maxx Proxy"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring ${
                    color === c ? 'border-foreground shadow-sm' : 'border-border'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && (
                    <Check className="h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">Environment Variables</label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mark sensitive keys as secret so the UI treats them differently.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ENV_VAR_KEY_HINT}
                </p>
              </div>
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
                  variant="secondary"
                  size="sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Variable
                </Button>
              </div>
            </div>

            {envEntries.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No variables yet. Add one or import a block.</p>
            ) : (
              <div className="space-y-2">
                {envEntries.map((entry, idx) => {
                  const issueMessages = envEntryIssues.get(idx) ?? []
                  const hasIssues = issueMessages.length > 0

                  return (
                    <div key={idx} className="space-y-2">
                      <div className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                        <input
                          type="text"
                          value={entry.key}
                          onChange={e => updateEntry(idx, 'key', e.target.value)}
                          placeholder="OPENAI_API_KEY"
                          className={cn(
                            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring',
                            hasIssues && 'border-destructive/60 focus:ring-destructive'
                          )}
                        />
                        <input
                          type={entry.isSecret ? 'password' : 'text'}
                          value={entry.value}
                          onChange={e => updateEntry(idx, 'value', e.target.value)}
                          placeholder={entry.isSecret ? 'secret value (hidden)' : 'value'}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-xs text-muted-foreground">
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
                          className="h-11 w-11 p-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {hasIssues && (
                        <p className="px-1 text-xs text-destructive">
                          {issueMessages.join(' ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ModalShell>

      {showBulkImport && (
        <BulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </>
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
    <ModalShell
      title="Bulk Import Variables"
      description="Paste export lines, simple KEY=value pairs, or a JSON object."
      onClose={onClose}
      overlayClassName="z-[60]"
      contentClassName="max-w-[520px]"
      footer={(
        <div className="flex justify-end gap-2">
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
      )}
    >
      <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <p className="mb-2">Supported formats:</p>
        <div className="space-y-1 rounded-md bg-background px-3 py-2 font-mono text-xs text-foreground">
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
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </ModalShell>
  )
}

function ViewProfileModal({
  profile: p,
  onClose,
}: {
  profile: profile.Profile
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  // Generate export format text
  const generateExportText = () => {
    const lines: string[] = []
    lines.push(`# Profile: ${p.name}`)
    if (p.description) {
      lines.push(`# ${p.description}`)
    }
    lines.push('')

    // Add all env vars (secrets are also in env_vars now)
    for (const [key, value] of Object.entries(p.env_vars || {})) {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''")
      lines.push(`export ${key}='${escapedValue}'`)
    }

    return lines.join('\n')
  }

  const handleCopy = () => {
    const text = generateExportText()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const envCount = Object.keys(p.env_vars || {}).length
  const secretCount = (p.secret_keys || []).length

  return (
    <ModalShell
      title={p.name}
      description={p.description || 'Review and copy environment variables from this profile.'}
      onClose={onClose}
      contentClassName="max-w-[920px]"
      headerSlot={(
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: p.color || '#6B7280' }}
          />
          <span>
            {envCount} variable{envCount !== 1 ? 's' : ''}
            {secretCount > 0 && `, including ${secretCount} secret${secretCount !== 1 ? 's' : ''}`}
          </span>
        </div>
      )}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      )}
    >
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-foreground">Environment Variables</label>
          <Button onClick={handleCopy} size="sm" variant="outline">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy All
              </>
            )}
          </Button>
        </div>

        <div className="max-h-[26rem] space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 font-mono text-xs text-foreground">
          <div className="text-muted-foreground"># Profile: {p.name}</div>
          {p.description && <div className="text-muted-foreground"># {p.description}</div>}
          <div></div>
          {Object.entries(p.env_vars || {}).map(([key, value]) => {
            const isSecret = (p.secret_keys || []).includes(key)
            return (
              <div key={key} className={isSecret ? 'text-primary' : ''}>
                export {key}='{value}'
              </div>
            )
          })}
        </div>
      </div>
    </ModalShell>
  )
}

export default Profiles

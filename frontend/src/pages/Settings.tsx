import { useState, useEffect } from 'react'
import { GetInstalledTerminals, GetDefaultTerminal, SetDefaultTerminal } from '../../wailsjs/go/main/App'
import { codex, terminal } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Check, Copy, Download, KeyRound, Pencil, Plus, Terminal as TerminalIcon, Trash2, TriangleAlert, Upload } from "lucide-react"

const getAppMethod = (method: string) => {
  return (window as any)?.go?.main?.App?.[method]
}

function Settings({
  onBurrowImported,
}: {
  onBurrowImported?: () => void
}) {
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [burrowBuffer, setBurrowBuffer] = useState('')
  const [burrowBusy, setBurrowBusy] = useState<'export' | 'import' | null>(null)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [codexModal, setCodexModal] = useState<{ mode: 'new' | 'edit', config?: codex.Config } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [installed, current] = await Promise.all([
        GetInstalledTerminals(),
        GetDefaultTerminal()
      ])
      setTerminals(installed || [])
      // Convert empty string from backend to "auto" for UI
      setDefaultTerminal(current === '' ? 'auto' : current)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    }
  }

  const loadCodexConfigs = async () => {
    const method = getAppMethod('ListCodexConfigs')
    if (typeof method !== 'function') {
      return
    }
    try {
      const configs = await method()
      setCodexConfigs(configs || [])
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    }
  }

  useEffect(() => {
    loadCodexConfigs()
  }, [])

  const handleSave = async (terminalID: string) => {
    setSaving(true)
    setMessage(null)
    try {
      // Convert "auto" to empty string for backend
      const value = terminalID === 'auto' ? '' : terminalID
      await SetDefaultTerminal(value)
      setDefaultTerminal(terminalID)
      setMessage({ type: 'success', text: 'Default terminal updated' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleExportBurrow = async () => {
    const method = getAppMethod('ExportBurrow')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: 'Burrow export is unavailable' })
      return
    }

    setBurrowBusy('export')
    setMessage(null)
    try {
      const raw = await method()
      setBurrowBuffer(String(raw || ''))
      setShowExportModal(true)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  const handleImportBurrow = async () => {
    const method = getAppMethod('ImportBurrow')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: 'Burrow import is unavailable' })
      return
    }

    setBurrowBusy('import')
    setMessage(null)
    try {
      await method(burrowBuffer)
      setShowImportModal(false)
      setBurrowBuffer('')
      onBurrowImported?.()
      setMessage({ type: 'success', text: 'Burrow imported. Profiles, hosts, and session definitions were replaced.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground mb-6">Settings</h1>

      {message && (
        <div className={`mb-4 p-3 rounded border text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
            : 'bg-destructive/10 border-destructive/50 text-destructive'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Default Terminal</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which terminal application to use when attaching to burrows
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Terminal Application</label>
            {terminals.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No terminal applications detected. Please install iTerm2, Ghostty, or another supported terminal.
              </div>
            ) : (
              <Select
                value={defaultTerminal}
                onValueChange={handleSave}
                disabled={saving}
              >
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Select a terminal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <TerminalIcon className="w-4 h-4 text-muted-foreground" />
                      <span>Auto-detect (Best Available)</span>
                    </div>
                  </SelectItem>
                  {terminals.map(term => (
                    <SelectItem key={term.ID} value={term.ID}>
                      <div className="flex items-center gap-2">
                        <TerminalIcon className="w-4 h-4 text-muted-foreground" />
                        <span>{term.Name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {terminals.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-3">Installed Terminals</h3>
              <div className="space-y-2">
                {terminals.map(term => (
                  <div
                    key={term.ID}
                    className="flex items-center justify-between p-3 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                        <TerminalIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{term.Name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{term.AppPath}</div>
                      </div>
                    </div>
                    {defaultTerminal === term.ID && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Check className="w-3 h-3" />
                        <span>Default</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-card rounded-lg border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Burrow Import / Export</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Export your profiles, host inventory, and static session definitions as one portable burrow file.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              Import replaces the current burrow and stops tracked running sessions before writing the new configuration.
              Local terminal preference is intentionally excluded and stays machine-specific.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={handleExportBurrow}
            disabled={burrowBusy !== null}
          >
            <Download className="w-4 h-4" />
            {burrowBusy === 'export' ? 'Exporting...' : 'Export Burrow'}
          </Button>
          <Button
            onClick={() => {
              setBurrowBuffer('')
              setShowImportModal(true)
            }}
            disabled={burrowBusy !== null}
          >
            <Upload className="w-4 h-4" />
            Import Burrow
          </Button>
        </div>
      </div>

      <div className="mt-6 bg-card rounded-lg border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Codex Configurations</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage isolated Codex homes for providers such as Maxx, Qiniu, and OpenAI.
            </p>
          </div>
          <Button size="sm" onClick={() => setCodexModal({ mode: 'new' })}>
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>

        {codexConfigs.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            No Codex configurations yet. Create one to run Codex with an isolated CODEX_HOME.
          </div>
        ) : (
          <div className="space-y-2">
            {codexConfigs.map(cfg => (
              <div key={cfg.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{cfg.name}</span>
                    <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {cfg.id}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${cfg.auth_exists ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {cfg.auth_exists ? 'auth.json exists' : 'auth.json missing'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{cfg.home_dir}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setCodexModal({ mode: 'edit', config: cfg })}>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`Remove Codex configuration "${cfg.name}" from Mole? Its home directory will stay on disk.`)) return
                      const method = getAppMethod('DeleteCodexConfig')
                      if (typeof method !== 'function') return
                      try {
                        await method(cfg.id)
                        await loadCodexConfigs()
                        setMessage({ type: 'success', text: 'Codex configuration removed. Home directory was left untouched.' })
                        setTimeout(() => setMessage(null), 3000)
                      } catch (err) {
                        setMessage({ type: 'error', text: String(err) })
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
          <TerminalIcon className="w-4 h-4" />
          Supported Terminals
        </h3>
        <p className="text-xs text-muted-foreground">
          Mole supports iTerm2, Ghostty, Rio, Alacritty, Warp, Kitty, and macOS Terminal.
          Install your preferred terminal and it will be automatically detected.
        </p>
      </div>

      <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
          <TerminalIcon className="w-4 h-4" />
          About Mole
        </h3>
        <p className="text-xs text-muted-foreground">
          A terminal burrow manager for hosts, profiles, and commands.
        </p>
      </div>

      {showExportModal && (
        <ModalShell
          title="Export Burrow"
          description="Copy this JSON to back up or move your Mole burrow."
          onClose={() => setShowExportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(burrowBuffer)}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </Button>
              <Button onClick={() => setShowExportModal(false)}>Close</Button>
            </div>
          )}
        >
          <Textarea
            value={burrowBuffer}
            readOnly
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {showImportModal && (
        <ModalShell
          title="Import Burrow"
          description="Paste a burrow JSON export to replace the current Mole configuration."
          onClose={() => setShowImportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportBurrow} disabled={burrowBusy === 'import'}>
                {burrowBusy === 'import' ? 'Importing...' : 'Import Burrow'}
              </Button>
            </div>
          )}
        >
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
            Import keeps profiles, hosts, groups, defaults, and session definitions together. Running burrow state and default terminal preference are not restored.
          </div>
          <Textarea
            value={burrowBuffer}
            onChange={e => setBurrowBuffer(e.target.value)}
            placeholder="Paste burrow JSON here"
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {codexModal && (
        <CodexConfigModal
          mode={codexModal.mode}
          config={codexModal.config}
          onClose={() => setCodexModal(null)}
          onSaved={async () => {
            setCodexModal(null)
            await loadCodexConfigs()
            setMessage({ type: 'success', text: 'Codex configuration saved' })
            setTimeout(() => setMessage(null), 3000)
          }}
        />
      )}
    </div>
  )
}

function CodexConfigModal({
  mode,
  config,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  config?: codex.Config
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(config?.name || '')
  const [id, setId] = useState(config?.id || '')
  const [configToml, setConfigToml] = useState('')
  const [authJSON, setAuthJSON] = useState('')
  const [replaceAuth, setReplaceAuth] = useState(false)
  const [showAuthEditor, setShowAuthEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const homePreview = id.trim()
    ? `~/.config/mole/ai/codex/${id.trim()}`
    : '~/.config/mole/ai/codex/<config-id>'

  useEffect(() => {
    if (!config?.id) return
    const method = getAppMethod('GetCodexConfigToml')
    if (typeof method !== 'function') return
    method(config.id)
      .then((raw: string) => setConfigToml(raw || ''))
      .catch((err: unknown) => setError(String(err)))
  }, [config?.id])

  const validateBeforeSave = () => {
    if (!name.trim()) return 'Name is required'
    if (!/^[A-Za-z0-9_-]+$/.test(id.trim())) {
      return 'Config ID must contain only letters, digits, underscores, and dashes'
    }
    try {
      validateTomlShape(configToml)
    } catch (err) {
      return String(err)
    }
    if (authJSON.trim()) {
      try {
        JSON.parse(authJSON)
      } catch (err) {
        return `Invalid auth.json: ${String(err)}`
      }
    }
    return ''
  }

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }
    const method = getAppMethod('SaveCodexConfig')
    if (typeof method !== 'function') {
      setError('SaveCodexConfig is unavailable')
      return
    }

    setSaving(true)
    setError('')
    try {
      await method({
        id: id.trim(),
        name: name.trim(),
        config_toml: configToml,
        auth_json: showAuthEditor ? authJSON : '',
        replace_auth: replaceAuth,
      })
      setAuthJSON('')
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const authExists = Boolean(config?.auth_exists)
  const authActionLabel = authExists ? 'Replace auth.json' : 'Initialize auth.json'

  return (
    <ModalShell
      title={mode === 'new' ? 'New Codex Configuration' : `Edit Codex Configuration: ${config?.name || ''}`}
      description="Codex will read config.toml and auth.json from this isolated home."
      onClose={onClose}
      contentStyle={{ maxWidth: '760px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !id.trim()}>
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

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Maxx"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Config ID</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="maxx"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono text-foreground disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">Codex Home</label>
          <div className="rounded border border-border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
            {config?.home_dir || homePreview}
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">config.toml</label>
          <Textarea
            value={configToml}
            onChange={e => setConfigToml(e.target.value)}
            rows={12}
            placeholder={'model_provider = "maxx"\n\n[model_providers.maxx]\nname = "maxx"\nbase_url = "https://maxx-direct.cloverstd.com"\nwire_api = "responses"'}
            className="min-h-72 font-mono text-xs"
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                auth.json
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Status: {authExists ? 'exists' : 'missing'}. Existing auth content is not loaded back into Mole.
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAuthEditor(!showAuthEditor)
                setReplaceAuth(authExists)
              }}
            >
              {authActionLabel}
            </Button>
          </div>

          {showAuthEditor && (
            <div className="mt-4 space-y-3">
              {authExists && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={replaceAuth}
                    onChange={e => setReplaceAuth(e.target.checked)}
                    className="mt-0.5"
                  />
                  Replace the existing auth.json for this Codex home.
                </label>
              )}
              <Textarea
                value={authJSON}
                onChange={e => setAuthJSON(e.target.value)}
                rows={5}
                placeholder={'{\n  "OPENAI_API_KEY": "maxx_your_token_here"\n}'}
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function validateTomlShape(raw: string) {
  const lines = raw.split(/\r?\n/)
  let collectionDepth = 0
  for (let index = 0; index < lines.length; index++) {
    const line = stripTomlComment(lines[index]).trim()
    if (!line) continue
    if (collectionDepth > 0) {
      collectionDepth += tomlCollectionDelta(line)
      if (collectionDepth < 0) {
        throw new Error(`Unbalanced TOML collection at line ${index + 1}`)
      }
      continue
    }
    if (line.startsWith('[')) {
      if (!line.endsWith(']') || line.replace(/\[|\]/g, '').trim() === '') {
        throw new Error(`Invalid TOML table at line ${index + 1}`)
      }
      continue
    }
    if (!line.includes('=')) {
      throw new Error(`Invalid TOML assignment at line ${index + 1}`)
    }
    const [key, ...rest] = line.split('=')
    if (!key.trim() || !rest.join('=').trim()) {
      throw new Error(`Invalid TOML assignment at line ${index + 1}`)
    }
    collectionDepth += tomlCollectionDelta(rest.join('='))
    if (collectionDepth < 0) {
      throw new Error(`Unbalanced TOML collection at line ${index + 1}`)
    }
  }
  if (collectionDepth !== 0) {
    throw new Error('Unterminated TOML collection')
  }
}

function stripTomlComment(line: string) {
  let inDouble = false
  let inSingle = false
  let escaped = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '\\' && inDouble) {
      escaped = !escaped
      continue
    }
    if (char === '"' && !inSingle && !escaped) inDouble = !inDouble
    if (char === "'" && !inDouble) inSingle = !inSingle
    if (char === '#' && !inDouble && !inSingle) return line.slice(0, index)
    escaped = false
  }
  return line
}

function tomlCollectionDelta(value: string) {
  let delta = 0
  let inDouble = false
  let inSingle = false
  let escaped = false
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '\\' && inDouble) {
      escaped = !escaped
      continue
    }
    if (char === '"' && !inSingle && !escaped) inDouble = !inDouble
    if (char === "'" && !inDouble) inSingle = !inSingle
    if (!inDouble && !inSingle && (char === '[' || char === '{')) delta++
    if (!inDouble && !inSingle && (char === ']' || char === '}')) delta--
    escaped = false
  }
  return delta
}

export default Settings

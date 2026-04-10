import { useState, useEffect } from 'react'
import { GetInstalledTerminals, GetDefaultTerminal, SetDefaultTerminal } from '../../wailsjs/go/main/App'
import { terminal } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Check, Copy, Download, Terminal as TerminalIcon, TriangleAlert, Upload } from "lucide-react"

const getAppMethod = (method: string) => {
  return (window as any)?.go?.main?.App?.[method]
}

function Settings({
  onWorkspaceImported,
}: {
  onWorkspaceImported?: () => void
}) {
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [workspaceBuffer, setWorkspaceBuffer] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState<'export' | 'import' | null>(null)

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

  const handleExportWorkspace = async () => {
    const method = getAppMethod('ExportWorkspace')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: 'Workspace export is unavailable' })
      return
    }

    setWorkspaceBusy('export')
    setMessage(null)
    try {
      const raw = await method()
      setWorkspaceBuffer(String(raw || ''))
      setShowExportModal(true)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setWorkspaceBusy(null)
    }
  }

  const handleImportWorkspace = async () => {
    const method = getAppMethod('ImportWorkspace')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: 'Workspace import is unavailable' })
      return
    }

    setWorkspaceBusy('import')
    setMessage(null)
    try {
      await method(workspaceBuffer)
      setShowImportModal(false)
      setWorkspaceBuffer('')
      onWorkspaceImported?.()
      setMessage({ type: 'success', text: 'Workspace imported. Profiles, hosts, and session definitions were replaced.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setWorkspaceBusy(null)
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
              Choose which terminal application to use when attaching to sessions
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
            <h2 className="text-lg font-semibold text-foreground">Workspace Import / Export</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Export your profiles, host inventory, and static session definitions as one portable workspace file.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              Import replaces the current workspace and stops tracked running sessions before writing the new configuration.
              Local terminal preference is intentionally excluded and stays machine-specific.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={handleExportWorkspace}
            disabled={workspaceBusy !== null}
          >
            <Download className="w-4 h-4" />
            {workspaceBusy === 'export' ? 'Exporting...' : 'Export Workspace'}
          </Button>
          <Button
            onClick={() => {
              setWorkspaceBuffer('')
              setShowImportModal(true)
            }}
            disabled={workspaceBusy !== null}
          >
            <Upload className="w-4 h-4" />
            Import Workspace
          </Button>
        </div>
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
          A session manager for hosts and profiles.
        </p>
      </div>

      {showExportModal && (
        <ModalShell
          title="Export Workspace"
          description="Copy this JSON to back up or move your Mole workspace."
          onClose={() => setShowExportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(workspaceBuffer)}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </Button>
              <Button onClick={() => setShowExportModal(false)}>Close</Button>
            </div>
          )}
        >
          <Textarea
            value={workspaceBuffer}
            readOnly
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {showImportModal && (
        <ModalShell
          title="Import Workspace"
          description="Paste a workspace JSON export to replace the current Mole configuration."
          onClose={() => setShowImportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportWorkspace} disabled={workspaceBusy === 'import'}>
                {workspaceBusy === 'import' ? 'Importing...' : 'Import Workspace'}
              </Button>
            </div>
          )}
        >
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
            Import keeps profiles, hosts, groups, defaults, and session definitions together. Running session state and default terminal preference are not restored.
          </div>
          <Textarea
            value={workspaceBuffer}
            onChange={e => setWorkspaceBuffer(e.target.value)}
            placeholder="Paste workspace JSON here"
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}
    </div>
  )
}

export default Settings

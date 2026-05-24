import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'

type DangerConfirmModalProps = {
  title: string
  description: string
  impactText?: string
  open: boolean
  onCancel: () => void
  onConfirm: () => Promise<void> | void
  confirmLabel: string
  cancelLabel: string
  ackLabel?: string
  keyword?: string
  keywordLabel?: string
  keywordPlaceholder?: string
}

export function DangerConfirmModal({
  title,
  description,
  impactText,
  open,
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel,
  ackLabel,
  keyword,
  keywordLabel,
  keywordPlaceholder,
}: DangerConfirmModalProps) {
  const [busy, setBusy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [keywordInput, setKeywordInput] = useState('')

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setAcknowledged(false)
      setKeywordInput('')
    }
  }, [open])

  const keywordReady = useMemo(() => {
    if (!keyword) return true
    return keywordInput.trim().toUpperCase() === keyword.trim().toUpperCase()
  }, [keyword, keywordInput])

  const ackReady = ackLabel ? acknowledged : true
  const canConfirm = !busy && ackReady && keywordReady

  const handleConfirm = async () => {
    if (!canConfirm) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <ModalShell
      title={title}
      description={description}
      onClose={busy ? undefined : onCancel}
      contentStyle={{ maxWidth: '560px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4">
        {impactText ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {impactText}
          </div>
        ) : null}

        {ackLabel ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 rounded accent-primary"
            />
            <span>{ackLabel}</span>
          </label>
        ) : null}

        {keyword ? (
          <div>
            {keywordLabel ? (
              <label className="mb-1 block text-xs text-muted-foreground">
                {keywordLabel}
              </label>
            ) : null}
            <Input
              value={keywordInput}
              onChange={e => setKeywordInput(e.target.value)}
              placeholder={keywordPlaceholder}
              disabled={busy}
              className="bg-muted/30 focus:bg-background"
            />
          </div>
        ) : null}
      </div>
    </ModalShell>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SIZE_MAP = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

type ModalShellProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose?: () => void
  size?: keyof typeof SIZE_MAP
  overlayClassName?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  bodyClassName?: string
  headerSlot?: ReactNode
}

export function ModalShell({
  title,
  description,
  children,
  footer,
  onClose,
  size = 'lg',
  overlayClassName,
  contentClassName,
  contentStyle,
  bodyClassName,
  headerSlot,
}: ModalShellProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center px-4 py-4 sm:px-6 sm:py-6',
        overlayClassName
      )}
      style={{ backgroundColor: 'hsl(var(--dialog-overlay))' }}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border',
          SIZE_MAP[size],
          contentClassName
        )}
        style={{
          backgroundColor: 'hsl(var(--dialog-surface))',
          borderColor: 'hsl(var(--dialog-border))',
          boxShadow: '0 32px 120px rgba(2, 6, 23, 0.42)',
          ...contentStyle,
        }}
      >
        <div
          className="border-b px-6 py-4"
          style={{
            backgroundColor: 'hsl(var(--dialog-band))',
            borderColor: 'hsl(var(--dialog-border))',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {onClose ? (
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {headerSlot ? <div className="mt-3">{headerSlot}</div> : null}
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div
            className="border-t px-6 py-4"
            style={{
              backgroundColor: 'hsl(var(--dialog-band))',
              borderColor: 'hsl(var(--dialog-border))',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

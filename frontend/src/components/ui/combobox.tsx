import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ComboboxOption = {
  value: string
  label: string
  description?: string
}

type ComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  id?: string
}

/**
 * Searchable combobox built on plain divs (no Radix Popover dep).
 *
 * Trigger behaves like a Select trigger; the popover has a search input on top
 * with a filtered list below. Keyboard: ArrowUp/Down to navigate, Enter to pick,
 * Escape to close. Click outside to close.
 *
 * Filtering: case-insensitive substring on `label` and `description` (if any).
 * The trigger always reflects the currently selected value, even if that option
 * is currently filtered out of the list.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No matches',
  className,
  disabled,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value) || null

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.description?.toLowerCase().includes(q) ?? false)
    )
  }, [options, query])

  // Reset highlight whenever the filtered list shape changes.
  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  // Focus the search input on open; clear the query on close.
  React.useEffect(() => {
    if (open) {
      const rafId = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(rafId)
    }
    setQuery('')
  }, [open])

  // Click outside closes the popover.
  React.useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // Keep the highlighted option visible in the scroll container.
  React.useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightedIndex] as HTMLElement | undefined
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, open])

  const commit = (opt: ComboboxOption) => {
    onValueChange(opt.value)
    setOpen(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => (filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[highlightedIndex]
      if (opt) commit(opt)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          !selectedOption && 'text-[hsl(var(--placeholder))]'
        )}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-sm border border-input bg-transparent pl-7 pr-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-[hsl(var(--placeholder))]"
              />
            </div>
          </div>
          <div
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value
                const isHighlighted = i === highlightedIndex
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    onClick={() => commit(opt)}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none',
                      isHighlighted && 'bg-accent text-accent-foreground',
                      isSelected && !isHighlighted && 'font-medium'
                    )}
                  >
                    <span className="flex-1 truncate">
                      {opt.label}
                      {opt.description && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{opt.description}</span>
                      )}
                    </span>
                    {isSelected && (
                      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

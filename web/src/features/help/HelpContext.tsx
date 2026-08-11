import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { getHelpArticle } from './articles'

type HelpContextValue = {
  open: boolean
  slug: string | null
  openHelp: (slug?: string | null) => void
  closeHelp: () => void
}

const HelpContext = createContext<HelpContextValue | null>(null)

const HELP_PARAM = 'help'

export function HelpProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get(HELP_PARAM)
  const open = param !== null
  const slug = param && param.length > 0 ? param : null

  const setHelpParam = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === null) {
            p.delete(HELP_PARAM)
          } else if (next === '') {
            p.set(HELP_PARAM, '')
          } else {
            // Ignore unknown slugs for URL cleanliness but still open index
            if (next && !getHelpArticle(next)) {
              p.set(HELP_PARAM, '')
            } else {
              p.set(HELP_PARAM, next)
            }
          }
          return p
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const openHelp = useCallback(
    (nextSlug?: string | null) => {
      if (nextSlug == null || nextSlug === '') setHelpParam('')
      else setHelpParam(nextSlug)
    },
    [setHelpParam],
  )

  const closeHelp = useCallback(() => setHelpParam(null), [setHelpParam])

  // Escape is handled in the modal; ensure invalid slug falls back to index view
  useEffect(() => {
    if (slug && !getHelpArticle(slug)) {
      setHelpParam('')
    }
  }, [slug, setHelpParam])

  const value = useMemo(
    () => ({ open, slug, openHelp, closeHelp }),
    [open, slug, openHelp, closeHelp],
  )

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext)
  if (!ctx) {
    throw new Error('useHelp must be used within HelpProvider')
  }
  return ctx
}

/** Safe hook when help may be outside provider (returns no-ops). */
export function useHelpOptional(): HelpContextValue {
  const ctx = useContext(HelpContext)
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  if (ctx) return ctx
  return {
    open,
    slug,
    openHelp: (s) => {
      setSlug(s ?? null)
      setOpen(true)
    },
    closeHelp: () => {
      setOpen(false)
      setSlug(null)
    },
  }
}

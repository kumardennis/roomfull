import { createContext, useContext } from 'react'
import type { DrawerContent, Toast } from './types'

export type ChromeContextValue = {
  toasts: Toast[]
  drawer: DrawerContent | null
  showToast: (message: string, onClick?: () => void) => void
  dismissToast: (id: string) => void
  openDrawer: (content: Omit<DrawerContent, 'id'>) => void
  closeDrawer: () => void
}

export const ChromeContext = createContext<ChromeContextValue | null>(null)

export function useChrome() {
  const context = useContext(ChromeContext)
  if (!context) {
    throw new Error('useChrome must be used within ChromeProvider')
  }
  return context
}

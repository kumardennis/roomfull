import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ChromeContext, type ChromeContextValue } from './chrome-context'
import { DrawerHost } from './drawer-host'
import { ToastHost } from './toast-host'
import type { DrawerContent, Toast } from './types'

type ChromeProviderProps = {
  children: ReactNode
}

export function ChromeProvider({ children }: ChromeProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [drawer, setDrawer] = useState<DrawerContent | null>(null)

  const showToast = useCallback((message: string, onClick?: () => void) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message, onClick }])

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const openDrawer = useCallback((content: Omit<DrawerContent, 'id'>) => {
    setDrawer({ id: crypto.randomUUID(), ...content })
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawer(null)
  }, [])

  const value = useMemo<ChromeContextValue>(
    () => ({
      toasts,
      drawer,
      showToast,
      dismissToast,
      openDrawer,
      closeDrawer,
    }),
    [toasts, drawer, showToast, dismissToast, openDrawer, closeDrawer],
  )

  return (
    <ChromeContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <DrawerHost drawer={drawer} onClose={closeDrawer} />
    </ChromeContext.Provider>
  )
}

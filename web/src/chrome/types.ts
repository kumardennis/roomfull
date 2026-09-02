import type { ReactNode } from 'react'

export type Toast = {
  id: string
  message: string
  onClick?: () => void
}

export type DrawerContent = {
  id: string
  title?: string
  children: ReactNode
}

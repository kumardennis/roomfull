import type { DrawerContent } from './types'

type DrawerHostProps = {
  drawer: DrawerContent | null
  onClose: () => void
}

export function DrawerHost({ drawer, onClose }: DrawerHostProps) {
  if (!drawer) return null

  return (
    <div className="chrome-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="chrome-drawer"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {drawer.title ? <h2 className="chrome-drawer-title">{drawer.title}</h2> : null}
        <div className="chrome-drawer-body">{drawer.children}</div>
        <button className="btn ghost" type="button" onClick={onClose}>
          Close
        </button>
      </aside>
    </div>
  )
}

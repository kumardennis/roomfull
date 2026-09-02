import type { Toast } from './types'

type ToastHostProps = {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null

  return (
    <div className="chrome-toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="chrome-toast"
          onClick={() => {
            toast.onClick?.()
            onDismiss(toast.id)
          }}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}

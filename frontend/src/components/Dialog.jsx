import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, description, children, size = 'md' }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className={`m-auto w-[calc(100%-2rem)] ${size === 'sm' ? 'max-w-sm' : 'max-w-lg'} rounded-2xl bg-white p-0 text-stone-900 shadow-2xl`}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="text-lg font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
            </div>
            <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

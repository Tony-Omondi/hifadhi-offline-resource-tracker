import { Dialog } from './Dialog'

export function ConfirmDelete({ item, onClose, onConfirm }) {
  return (
    <Dialog open={!!item} onClose={onClose} size="sm" title="Delete this item?" description={item ? `${item.name} will be removed on every device after the next sync.` : ''}>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn-danger"
          onClick={async () => {
            await onConfirm()
            onClose()
          }}
        >
          Delete
        </button>
      </div>
    </Dialog>
  )
}

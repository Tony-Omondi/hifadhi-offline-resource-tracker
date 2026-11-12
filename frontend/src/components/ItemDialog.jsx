import { useState } from 'react'
import { Dialog } from './Dialog'
import { CATEGORIES } from '../lib/format'

const EMPTY = { name: '', category: 'medicine', unit: '', quantity: '', min_stock: '', location: '', expiry_date: '', notes: '' }

function toForm(item) {
  if (!item) return EMPTY
  return {
    ...EMPTY,
    ...item,
    quantity: String(item.quantity ?? ''),
    min_stock: String(item.min_stock ?? ''),
    expiry_date: item.expiry_date ?? '',
  }
}

export function ItemDialog({ open, item, onClose, onSave }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? 'Edit item' : 'Add item'}
      description={item ? 'Only the fields you change are sent, so edits on other devices are kept.' : 'Saved on this device immediately. It syncs when you are online.'}
    >
      {open && <ItemForm key={item?.id ?? 'new'} item={item} onClose={onClose} onSave={onSave} />}
    </Dialog>
  )
}

function ItemForm({ item, onClose, onSave }) {
  const [form, setForm] = useState(() => toForm(item))
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Give the item a name.')
    const minStock = form.min_stock === '' ? 0 : Number(form.min_stock)
    if (!Number.isInteger(minStock) || minStock < 0) return setError('Reorder level must be a whole number, 0 or more.')
    const fields = {
      name,
      category: form.category,
      unit: form.unit.trim() || 'units',
      location: form.location.trim(),
      expiry_date: form.expiry_date || null,
      min_stock: minStock,
      notes: form.notes.trim(),
    }
    if (!item) {
      const quantity = form.quantity === '' ? 0 : Number(form.quantity)
      if (!Number.isInteger(quantity) || quantity < 0) return setError('Starting quantity must be a whole number, 0 or more.')
      fields.quantity = quantity
    }
    await onSave(fields)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="f-name">Name</label>
        <input id="f-name" className="field" value={form.name} onChange={set('name')} placeholder="e.g. Amoxicillin 250mg" autoFocus required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="f-cat">Category</label>
          <select id="f-cat" className="field" value={form.category} onChange={set('category')}>
            {Object.entries(CATEGORIES).map(([value, c]) => (
              <option key={value} value={value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-unit">Unit</label>
          <input id="f-unit" className="field" value={form.unit} onChange={set('unit')} placeholder="tablets, bags…" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!item && (
          <div>
            <label className="label" htmlFor="f-qty">Starting quantity</label>
            <input id="f-qty" className="field tabular-nums" inputMode="numeric" value={form.quantity} onChange={set('quantity')} placeholder="0" />
          </div>
        )}
        <div className={item ? 'col-span-2 sm:col-span-1' : ''}>
          <label className="label" htmlFor="f-min">Reorder level</label>
          <input id="f-min" className="field tabular-nums" inputMode="numeric" value={form.min_stock} onChange={set('min_stock')} placeholder="0" />
        </div>
        {item && (
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="f-exp">Expiry date</label>
            <input id="f-exp" type="date" className="field" value={form.expiry_date} onChange={set('expiry_date')} />
          </div>
        )}
      </div>
      {!item && (
        <div>
          <label className="label" htmlFor="f-exp">Expiry date <span className="font-normal text-stone-400">(optional)</span></label>
          <input id="f-exp" type="date" className="field" value={form.expiry_date} onChange={set('expiry_date')} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="f-loc">Location</label>
        <input id="f-loc" className="field" value={form.location} onChange={set('location')} placeholder="e.g. Pharmacy shelf A2" />
      </div>
      <div>
        <label className="label" htmlFor="f-notes">Notes</label>
        <textarea id="f-notes" rows={2} className="field h-auto py-2" value={form.notes} onChange={set('notes')} />
      </div>
      {item && <p className="text-xs text-stone-500">To change the quantity, use Receive / Dispense so movements from different devices add up.</p>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary">{item ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  )
}

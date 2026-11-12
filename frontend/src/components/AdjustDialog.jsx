import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

const MODES = {
  receive: { label: 'Receive', sign: 1, reason: 'received', verb: 'Add' },
  dispense: { label: 'Dispense', sign: -1, reason: 'dispensed', verb: 'Remove' },
}

export function AdjustDialog({ item, onClose, onSave }) {
  return (
    <Dialog open={!!item} onClose={onClose} size="sm" title={item?.name ?? ''} description={item ? `${item.quantity.toLocaleString()} ${item.unit} on hand` : ''}>
      {item && <AdjustForm key={item.id} item={item} onClose={onClose} onSave={onSave} />}
    </Dialog>
  )
}

function AdjustForm({ item, onClose, onSave }) {
  const [mode, setMode] = useState('dispense')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const m = MODES[mode]
  const n = Number(amount)
  const valid = Number.isInteger(n) && n > 0
  const after = valid ? item.quantity + m.sign * n : item.quantity

  async function submit(e) {
    e.preventDefault()
    if (!valid) return setError('Enter a whole number greater than 0.')
    await onSave(m.sign * n, m.reason)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1" role="radiogroup" aria-label="Movement">
        {Object.entries(MODES).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${mode === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
          >
            <Icon name={cfg.sign > 0 ? 'plus' : 'minus'} size={13} /> {cfg.label}
          </button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="adj-amount">Amount ({item.unit})</label>
        <input id="adj-amount" className="field h-12 text-lg tabular-nums" inputMode="numeric" autoFocus value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0" />
        <div className="mt-2 flex gap-1.5">
          {[1, 5, 10, 50, 100].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} className="flex-1 rounded-lg bg-stone-100 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-200 tabular-nums">
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm ring-1 ring-stone-200">
        <span className="text-stone-500">After this</span>
        <span className={`font-semibold tabular-nums ${after < 0 ? 'text-rose-700' : ''}`}>
          {after.toLocaleString()} {item.unit}
        </span>
      </p>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!amount}>
          {m.verb} {valid ? n.toLocaleString() : ''}
        </button>
      </div>
    </form>
  )
}

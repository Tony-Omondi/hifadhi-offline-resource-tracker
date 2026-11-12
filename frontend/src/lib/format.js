export const CATEGORIES = {
  medicine: { label: 'Medicine', icon: 'pill', tile: 'bg-teal-50 text-teal-700' },
  supplies: { label: 'Medical supplies', icon: 'doctors-bag', tile: 'bg-sky-50 text-sky-700' },
  food: { label: 'Food aid', icon: 'flour', tile: 'bg-amber-50 text-amber-700' },
  water: { label: 'Water & hygiene', icon: 'water', tile: 'bg-blue-50 text-blue-700' },
  other: { label: 'Other', icon: 'box', tile: 'bg-stone-100 text-stone-600' },
}

const DAY = 86_400_000
export const EXPIRY_WARNING_DAYS = 60

export function daysUntil(isoDate, now = Date.now()) {
  if (!isoDate) return null
  const end = new Date(`${isoDate}T23:59:59`).getTime()
  return Math.ceil((end - now) / DAY)
}

export function stockStatus(item) {
  if (item.quantity < 0) return 'negative'
  if (item.min_stock > 0 && item.quantity <= item.min_stock) return 'low'
  return 'ok'
}

export function expiryStatus(item) {
  const days = daysUntil(item.expiry_date)
  if (days === null) return null
  if (days < 0) return { kind: 'expired', days }
  if (days <= EXPIRY_WARNING_DAYS) return { kind: 'soon', days }
  return { kind: 'ok', days }
}

export function formatDate(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(ms, now = Date.now()) {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ms).toLocaleDateString()
}

export const OP_LABELS = { create: 'Add', update: 'Edit', adjust: 'Stock', delete: 'Delete' }

export function describeOp(op) {
  if (op.type === 'create') return `Added with ${op.data.quantity ?? 0}`
  if (op.type === 'adjust') return `${op.data.delta > 0 ? '+' : ''}${op.data.delta}${op.data.reason ? ` · ${op.data.reason}` : ''}`
  if (op.type === 'update') return `Changed ${Object.keys(op.data).join(', ').replaceAll('_', ' ')}`
  return 'Deleted'
}

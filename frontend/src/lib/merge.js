// Optimistic local apply: the same effect the server will have, minus conflict checks
// (your own op always applies to your own copy; the server decides between devices).

export const EDITABLE_FIELDS = ['name', 'category', 'unit', 'location', 'expiry_date', 'min_stock', 'notes']

export function applyLocal(record, op) {
  switch (op.type) {
    case 'create':
      return { id: op.record_id, deleted: false, version: 0, ...op.data }
    case 'update':
      return { ...record, ...op.data }
    case 'adjust':
      return { ...record, quantity: (record?.quantity ?? 0) + op.data.delta }
    case 'delete':
      return { ...record, deleted: true }
    default:
      return record
  }
}

/** Server copy + this device's not-yet-synced ops on top = what this device should show. */
export function rebase(serverRecord, pendingOps) {
  return pendingOps.reduce((rec, op) => applyLocal(rec, op), { ...serverRecord })
}

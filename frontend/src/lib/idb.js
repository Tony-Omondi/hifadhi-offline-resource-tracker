// Minimal promise helpers over the raw IndexedDB API (no wrapper library to explain).

export const DB_NAME = 'hifadhi'
const DB_VERSION = 1

export const STORES = {
  records: 'records', // record map: keyPath "id"
  outbox: 'outbox', // FIFO sync queue: auto-increment key = arrival order
  meta: 'meta', // cursor, device id, last sync time
  conflicts: 'conflicts', // log of conflicts the server resolved
  failed: 'failed', // ops the server rejected (kept for the user to see)
}

export function openDB(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore(STORES.records, { keyPath: 'id' })
      const outbox = db.createObjectStore(STORES.outbox, { keyPath: 'seq', autoIncrement: true })
      outbox.createIndex('op_id', 'op_id', { unique: true }) // client-side op-ID set
      outbox.createIndex('record_id', 'record_id')
      db.createObjectStore(STORES.meta, { keyPath: 'key' })
      db.createObjectStore(STORES.conflicts, { keyPath: 'id', autoIncrement: true })
      db.createObjectStore(STORES.failed, { keyPath: 'op_id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Resolve an IDBRequest. */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Resolve when a transaction commits, reject if it aborts. */
export function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'))
    tx.onerror = () => reject(tx.error)
  })
}

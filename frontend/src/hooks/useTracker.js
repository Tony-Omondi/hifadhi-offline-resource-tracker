import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TrackerStore } from '../lib/store'
import { SyncEngine, backoffDelay, httpTransport } from '../lib/sync'
import { STORES } from '../lib/idb'

const PULL_EVERY_MS = 20_000
const FORCED_OFFLINE_KEY = 'hifadhi:forced-offline'

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** All app state + actions. Local writes never wait for the network. */
export function useTracker({ onSynced, onSyncError } = {}) {
  const browserOnline = useBrowserOnline()
  const [forcedOffline, setForcedOfflineState] = useState(() => readFlag(FORCED_OFFLINE_KEY))
  const [ready, setReady] = useState(false)
  const [data, setData] = useState({ records: [], queue: [], conflicts: [], failed: [], lastSync: null, deviceId: '' })
  const [sync, setSync] = useState({ running: false, error: null, retryAt: null, reachable: true })

  const storeRef = useRef(null)
  const engineRef = useRef(null)
  const retryRef = useRef({ attempt: 0, timer: null })
  const callbacks = useRef({ onSynced, onSyncError })
  const runSyncRef = useRef(() => {})

  const canSync = browserOnline && !forcedOffline
  // Read live at call time: timers created before a state change must not use a stale value.
  const forcedRef = useRef(forcedOffline)
  useLayoutEffect(() => {
    forcedRef.current = forcedOffline
    callbacks.current = { onSynced, onSyncError }
  })

  const refresh = useCallback(async () => {
    const store = storeRef.current
    if (!store) return
    const [records, queue, conflicts, failed, lastSync] = await Promise.all([
      store.listRecords(),
      store.queue.all(),
      store.listConflicts(),
      store.listFailed(),
      store.getMeta('last_sync'),
    ])
    setData({ records, queue, conflicts: conflicts.reverse(), failed: failed.reverse(), lastSync, deviceId: store.deviceId })
  }, [])

  const runSync = useCallback(
    async ({ simulateFailure = false, manual = false, force = false } = {}) => {
      const engine = engineRef.current
      if (!engine) return
      // `force` (testing tools) ignores the "Work offline" switch but still needs a network.
      const networkUp = navigator.onLine
      if (!networkUp || (forcedRef.current && !force)) {
        if (manual) callbacks.current.onSyncError?.(new Error('You are offline. Changes stay saved on this device.'))
        return
      }
      clearTimeout(retryRef.current.timer)
      setSync((s) => ({ ...s, running: true, retryAt: null }))
      try {
        const summary = await engine.sync({ simulateFailure })
        retryRef.current.attempt = 0
        setSync({ running: false, error: null, retryAt: null, reachable: true })
        callbacks.current.onSynced?.(summary, { manual })
      } catch (error) {
        const delay = backoffDelay(retryRef.current.attempt++)
        retryRef.current.timer = setTimeout(() => runSyncRef.current(), delay)
        setSync({ running: false, error: error.message, retryAt: Date.now() + delay, reachable: false })
        callbacks.current.onSyncError?.(error)
      } finally {
        await refresh()
      }
    },
    [refresh],
  )
  useLayoutEffect(() => {
    runSyncRef.current = runSync
  }, [runSync])

  // Open the local database once.
  useEffect(() => {
    let cancelled = false
    TrackerStore.open().then(async (store) => {
      if (cancelled) return
      storeRef.current = store
      engineRef.current = new SyncEngine({ store, transport: httpTransport() })
      await refresh()
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Sync as soon as we can (start-up, back online, "work offline" switched off), then poll.
  useEffect(() => {
    if (!ready || !canSync) return undefined
    runSync()
    const timer = setInterval(() => runSync(), PULL_EVERY_MS)
    return () => clearInterval(timer)
  }, [ready, canSync, runSync])

  useEffect(() => () => clearTimeout(retryRef.current.timer), [])

  // Push local changes shortly after they happen (batched if several come quickly).
  const pushSoon = useRef(null)
  const afterLocalChange = useCallback(async () => {
    await refresh()
    clearTimeout(pushSoon.current)
    pushSoon.current = setTimeout(() => runSync(), 600)
  }, [refresh, runSync])

  const act = useCallback(
    (fn) =>
      async (...args) => {
        const result = await fn(storeRef.current, ...args)
        await afterLocalChange()
        return result
      },
    [afterLocalChange],
  )

  const setForcedOffline = useCallback((value) => {
    try {
      localStorage.setItem(FORCED_OFFLINE_KEY, value ? '1' : '0')
    } catch {
      /* private mode: the toggle still works for this session */
    }
    setForcedOfflineState(value)
  }, [])

  return {
    ready,
    ...data,
    online: canSync,
    browserOnline,
    forcedOffline,
    setForcedOffline,
    sync,
    runSync,
    createItem: act((s, fields) => s.createItem(fields)),
    updateItem: act((s, id, fields) => s.updateItem(id, fields)),
    adjustQuantity: act((s, id, delta, reason) => s.adjustQuantity(id, delta, reason)),
    deleteItem: act((s, id) => s.deleteItem(id)),
    clearConflicts: act((s) => s.clearLog(STORES.conflicts)),
    clearFailed: act((s) => s.clearLog(STORES.failed)),
  }
}

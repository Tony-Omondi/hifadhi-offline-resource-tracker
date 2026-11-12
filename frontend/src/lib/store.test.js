import { describe, expect, test } from 'vitest'
import { TrackerStore } from './store'
import { freshDbName } from '../test/fakeServer'

const open = () => TrackerStore.open(freshDbName())

describe('TrackerStore (record map, offline CRUD)', () => {
  test('create works offline: record saved locally and op queued together', async () => {
    const s = await open()
    const op = await s.createItem({ name: 'ORS sachets', quantity: 40 })
    const rec = await s.getRecord(op.record_id)
    expect(rec).toMatchObject({ name: 'ORS sachets', quantity: 40, _pending: true, _serverVersion: 0 })
    expect((await s.queue.peek()).map((o) => o.op_id)).toEqual([op.op_id])
  })

  test('update queues only the fields that changed; a no-op edit queues nothing', async () => {
    const s = await open()
    const { record_id } = await s.createItem({ name: 'Gloves', location: 'Store' })
    const op = await s.updateItem(record_id, { name: 'Gloves', location: 'Dressing room' })
    expect(op.data).toEqual({ location: 'Dressing room' })
    expect(await s.updateItem(record_id, { name: 'Gloves' })).toBeNull()
    expect(await s.queue.size()).toBe(2)
  })

  test('adjust and delete change the local copy immediately', async () => {
    const s = await open()
    const { record_id } = await s.createItem({ name: 'Nets', quantity: 10 })
    await s.adjustQuantity(record_id, -3, 'dispensed')
    expect((await s.getRecord(record_id)).quantity).toBe(7)
    await s.deleteItem(record_id)
    expect((await s.getRecord(record_id)).deleted).toBe(true)
    expect(() => s.adjustQuantity(record_id, 0)).toThrow()
  })

  test('a server copy is rebased under ops still waiting in the queue', async () => {
    const s = await open()
    const { record_id, op_id } = await s.createItem({ name: 'Beans', quantity: 100 })
    await s.adjustQuantity(record_id, -10) // still queued when the reply arrives
    await s.applySyncResponse({
      results: [{ op_id, record_id, status: 'applied', conflicts: [], record: { id: record_id, name: 'Beans', quantity: 100, version: 1 } }],
      changes: [],
      cursor: 1,
    })
    const rec = await s.getRecord(record_id)
    expect(rec.quantity).toBe(90) // 100 from server + our pending -10
    expect(rec._pending).toBe(true)
    expect(rec._serverVersion).toBe(1)
  })

  test('an older server copy never overwrites a newer one', async () => {
    const s = await open()
    const base = { id: 'x', name: 'Soap', quantity: 5 }
    await s.applySyncResponse({ results: [], changes: [{ ...base, version: 3, quantity: 30 }], cursor: 3 })
    await s.applySyncResponse({ results: [], changes: [{ ...base, version: 2, quantity: 20 }], cursor: 3 })
    expect((await s.getRecord('x')).quantity).toBe(30)
  })
})

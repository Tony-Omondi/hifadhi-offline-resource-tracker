// End-to-end proof in a real Chromium browser against a running server:
//   1. the app shell + data load with the network OFF (service worker + IndexedDB)
//   2. changes made offline queue in FIFO order, survive a reload, and sync once back online
//   3. two devices editing the same field offline converge, and the conflict is shown
//   4. a reply lost after the server applied a batch is retried without double-applying
//
// Usage: APP_URL=http://localhost:8077 CHROME_PATH="/path/to/chrome" node e2e/offline-sync.e2e.mjs
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

const APP_URL = process.env.APP_URL ?? 'http://localhost:8077'
const CHROME_PATH = process.env.CHROME_PATH
const OUT = process.env.OUT_DIR ?? new URL('../../docs/evidence/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const stamp = Date.now().toString(36)
const log = (msg) => console.log(`  ✓ ${msg}`)

const serverRecords = async () => (await (await fetch(`${APP_URL}/api/records`)).json()).records
const serverItem = async (name) => (await serverRecords()).find((r) => r.name === name)
const waitingCount = (page) => page.locator('button:has-text("Waiting to sync") span.text-2xl').innerText()

async function waitFor(fn, label, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

async function openDevice(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(APP_URL)
  await page.getByText('Bar Soap').first().waitFor()
  // First load installs the service worker; wait until it controls the page.
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => false), null, { timeout: 2000 }).catch(() => {})
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 })
  await page.getByText('Bar Soap').first().waitFor()
  return { context, page, name }
}

async function shot(page, file) {
  // Full-page captures repaint a sticky header mid-page; pin it to the top for the picture.
  const style = await page.addStyleTag({ content: 'header{position:static!important}' })
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true })
  await style.evaluate((el) => el.remove())
}

async function goOffline(device) {
  await device.context.setOffline(true)
  await device.page.getByText('No internet connection').waitFor()
}

async function addItem(page, name, quantity) {
  await page.getByRole('button', { name: 'Add item' }).first().click()
  await page.locator('#f-name').fill(name)
  await page.locator('#f-qty').fill(String(quantity))
  await page.locator('#f-loc').fill('E2E shelf')
  await page.getByRole('button', { name: 'Add item' }).last().click()
  await page.getByText(name).first().waitFor()
}

async function editLocation(page, item, location) {
  await page.getByRole('button', { name: `Edit ${item}` }).click()
  await page.locator('#f-loc').fill(location)
  await page.getByRole('button', { name: 'Save changes' }).click()
  // Wait until the edit is saved locally and queued before doing anything else.
  await page.locator('section[aria-label="Stock items"] li', { hasText: item }).getByText(location).waitFor()
  await page.locator('section[aria-label="Stock items"] li', { hasText: item }).getByText('Not synced').waitFor()
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
try {
  console.log(`E2E against ${APP_URL}`)

  // ---- 1 + 2: offline CRUD, durability across reload, sync on reconnect ----
  const a = await openDevice(browser, 'A')
  log('device A loaded the app and the service worker controls the page')
  const paraBefore = (await serverItem('Paracetamol 500mg')).quantity
  const newName = `E2E Test Item ${stamp}`

  await goOffline(a)
  await addItem(a.page, newName, 25)
  for (let i = 0; i < 3; i++) await a.page.getByRole('button', { name: 'Dispense one Paracetamol 500mg' }).click()
  await waitFor(async () => (await waitingCount(a.page)) === '4', '4 queued ops')
  await shot(a.page, '01-offline-changes-queued.png')
  log('offline: created an item and dispensed 3 times -> 4 ops queued, nothing sent')
  assert.equal(await serverItem(newName), undefined)

  await a.page.reload() // still offline: must come from the service worker + IndexedDB
  await a.page.getByText(newName).first().waitFor()
  assert.equal(await waitingCount(a.page), '4')
  await shot(a.page, '02-offline-reload-still-works.png')
  log('offline reload: app shell served by the service worker, data and queue still there')

  await a.context.setOffline(false)
  await waitFor(async () => (await waitingCount(a.page)) === '0', 'queue drained')
  const created = await serverItem(newName)
  assert.equal(created?.quantity, 25)
  assert.equal((await serverItem('Paracetamol 500mg')).quantity, paraBefore - 3)
  await shot(a.page, '03-back-online-synced.png')
  log('back online: queue drained in order, server has the new item and paracetamol -3')

  // ---- 3: conflicting offline edits on two devices ----
  const b = await openDevice(browser, 'B')
  await goOffline(a)
  await goOffline(b)
  await editLocation(a.page, 'Bar Soap', `Shelf A ${stamp}`)
  await new Promise((r) => setTimeout(r, 50))
  await editLocation(b.page, 'Bar Soap', `Shelf B ${stamp}`) // the later edit
  await b.context.setOffline(false)
  await waitFor(async () => (await waitingCount(b.page)) === '0', 'B synced')
  await a.context.setOffline(false)
  await waitFor(async () => (await waitingCount(a.page)) === '0', 'A synced')
  assert.equal((await serverItem('Bar Soap')).location, `Shelf B ${stamp}`)
  await a.page.getByRole('tab', { name: /Conflicts/ }).click()
  await a.page.getByRole('tab', { name: 'Conflicts 1' }).waitFor()
  const card = a.page.locator('section[aria-label="Sync activity"]')
  await card.getByText(`This device: Shelf A ${stamp}`).waitFor()
  await card.getByText(`Other device: Shelf B ${stamp}`).waitFor()
  await card.getByText("Kept the other device's value").waitFor()
  await a.page.locator('section[aria-label="Stock items"] li', { hasText: 'Bar Soap' }).getByText(`Shelf B ${stamp}`).waitFor()
  await shot(a.page, '04-conflict-resolved-last-write-wins.png')
  await b.page.getByRole('button', { name: 'Sync now' }).click()
  await b.page.getByText(`Shelf B ${stamp}`).first().waitFor()
  log('conflict: A and B edited Bar Soap location offline; later edit (B) won on server and on both devices; A shows the conflict')

  // ---- 4: reply lost after the server applied the batch ----
  const before = (await serverItem(newName)).quantity
  await a.page.getByRole('tab', { name: /Sync queue/ }).click()
  const offlineSwitch = a.page.getByRole('checkbox', { name: /Work offline/ })
  await offlineSwitch.check({ force: true }) // pause auto-sync without cutting the network
  await a.page.getByRole('button', { name: `Receive one ${newName}` }).click()
  await waitFor(async () => (await waitingCount(a.page)) === '1', '1 queued op')
  await a.page.getByRole('button', { name: 'Sync, then drop the reply' }).click()
  await waitFor(async () => (await serverItem(newName)).quantity === before + 1, 'server applied the op')
  await a.page.getByText('simulated dropped connection').first().waitFor()
  assert.equal(await waitingCount(a.page), '1') // client never got the ack
  log('dropped reply: server applied +1, client still holds the op')
  await offlineSwitch.uncheck({ force: true }) // back to normal: auto-sync resends the op
  await a.page.getByText(/already on server/).first().waitFor()
  await waitFor(async () => (await waitingCount(a.page)) === '0', 'queue drained after retry')
  assert.equal((await serverItem(newName)).quantity, before + 1)
  await shot(a.page, '05-dropped-reply-deduplicated.png')
  log('retry: server answered "duplicate", quantity still +1 (not +2)')

  console.log('\nAll end-to-end checks passed. Screenshots in docs/evidence/')
} finally {
  await browser.close()
}

/* Hifadhi service worker: keeps the app shell available with no connection.
 *
 * Page ('/')        network first (3s timeout), fall back to the cached copy
 * /static/*         cache first (file names are content-hashed, so never stale)
 * /api/*, /health   always the network: data goes through the sync queue, not the cache
 */
const CACHE = 'hifadhi-shell-v1'
const SHELL = '/'

async function precache() {
  const cache = await caches.open(CACHE)
  const page = await fetch(SHELL, { cache: 'no-store' })
  const html = await page.clone().text()
  await cache.put(SHELL, page)
  const assets = [...new Set(html.match(/\/static\/[^"'\s)]+/g) ?? [])]
  await cache.addAll(assets)
  // Fonts are referenced from the CSS, not the HTML: cache the Latin ones too.
  for (const css of assets.filter((a) => a.endsWith('.css'))) {
    const text = await (await cache.match(css)).text()
    const fonts = [...new Set(text.match(/\/static\/assets\/inter-latin-[^)"']+\.woff2/g) ?? [])]
    await cache.addAll(fonts)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const fresh = await Promise.race([fetch(request), timeout(3000)])
          if (fresh.ok) cache.put(SHELL, fresh.clone())
          return fresh
        } catch {
          return (await cache.match(SHELL)) ?? Response.error()
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const hit = await cache.match(request)
        if (hit) return hit
        const res = await fetch(request)
        if (res.ok) cache.put(request, res.clone())
        return res
      })(),
    )
  }
})

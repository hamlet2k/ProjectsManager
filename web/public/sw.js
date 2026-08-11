/* Kill-switch for leftover PWA service workers from earlier deploys.
 * Browsers that still have the old worker will fetch this update, clear caches, unregister, and reload. */
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister()
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          if ('navigate' in client) {
            client.navigate(client.url)
          }
        }
      } catch {
        /* ignore */
      }
    })(),
  )
})

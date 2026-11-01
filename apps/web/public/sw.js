// Service worker OnniMart: лише push-сповіщення про ціни (офлайн-кешу немає).
// Повідомлення шле воркер API (PushService): { title, body, url, tag }
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'OnniMart', {
      body: data.body || '',
      icon: '/pwa-icon/192',
      badge: '/pwa-icon/96',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

// Дотик до сповіщення: відкрита вкладка OnniMart переходить на товар, інакше — нове вікно
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus().then((w) => w.navigate(url)) : self.clients.openWindow(url);
    }),
  );
});

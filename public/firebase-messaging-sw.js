// Service Worker para Web Push Notifications de Wappa eSIM
self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      notification: {
        title: 'Wappa eSIM',
        body: event.data.text()
      }
    };
  }

  const title = payload.notification?.title || payload.title || 'Wappa eSIM: Alerta de Consumo';
  const options = {
    body: payload.notification?.body || payload.body || 'Revisa el estado de tus datos eSIM.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      {
        action: 'open_esims',
        title: 'Ver mi eSIM'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const iccid = event.notification.data?.iccid || '';
  const urlToOpen = self.location.origin + '/?tab=myesims' + (iccid ? '&iccid=' + encodeURIComponent(iccid) : '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

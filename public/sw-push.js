// public/sw-push.js

self.addEventListener('push', (event) => {
    if (event.data) {
      const payload = event.data.json();
      // payload = { title, body, ... }
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/logo192.png'
      });
    }
  });
  
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    // Apri la finestra o focus
    event.waitUntil(
      clients.openWindow('/')
    );
  });
  
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification("New StayBest booking", {
    body: "A confirmed booking has arrived. Open your partner dashboard for details.",
    tag: typeof message.tag === "string" ? message.tag : "staybest-booking",
    requireInteraction: true, silent: false, vibrate: [200, 100, 200, 100, 400],
    data: { url: new URL("partner/bookings", self.registration.scope).href },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL("partner/bookings", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.navigate(url); return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});

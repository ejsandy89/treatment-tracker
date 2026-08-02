import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

// Precache the app shell (injected at build time by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);

// Never cache calls to Netlify Functions — this is live patient data, always
// fetch fresh rather than serving a stale cached response.
registerRoute(
  ({ url }) => url.pathname.startsWith("/.netlify/functions/"),
  new NetworkOnly()
);

self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------- Push notifications ----------
self.addEventListener("push", (event) => {
  let data = { title: "CareTrack", body: "You have a new update." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          // The app may already be open on a different tab — navigate it to
          // the relevant one before focusing, rather than just focusing
          // whatever tab happens to already be showing.
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch { /* some browsers restrict this; falling through to focus is still fine */ }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

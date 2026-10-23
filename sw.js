/* ProMan Service Worker
   Zweck: Mitteilungen auf Android und iOS (dort gibt es kein `new Notification()`,
   nur registration.showNotification) und die Installierbarkeit als App – installiert
   zeigt Windows bei Mitteilungen „ProMan“ samt Icon statt der Webadresse.
   Bewusst KEIN Offline-Cache: jede Version kommt wie bisher frisch vom Server. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* Klick auf eine Mitteilung: offenes ProMan-Fenster nach vorne holen (sonst öffnen)
   und ihm mitteilen, was angeklickt wurde (z. B. eine Aufgabe öffnen). */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        let client = all.find(c => c.url.startsWith(self.registration.scope)) || all[0];
        if (client) {
            try { client = await client.focus(); } catch (e) {}
        } else {
            client = await self.clients.openWindow(self.registration.scope);
        }
        if (client) client.postMessage({ type: 'pm-notif-click', data });
    })());
});

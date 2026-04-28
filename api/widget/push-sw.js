self.addEventListener('push', (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {
            title: 'New Message',
            body: event.data ? event.data.text() : 'You have a new support reply',
        };
    }

    const title = data.title || 'New Message';
    const options = {
        body: data.body || 'You have a new support reply',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.tag || 'n8n-widget-push',
        renotify: true,
        data: {
            url: data.url || self.location.origin,
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification?.data?.url || self.location.origin;

    event.waitUntil((async () => {
        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

        for (const client of allClients) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
                try {
                    await client.focus();
                    if ('navigate' in client) {
                        await client.navigate(targetUrl);
                    }
                    return;
                } catch (_) {
                    // Tab was closed between matchAll and focus/navigate — fall through to openWindow
                }
            }
        }

        await clients.openWindow(targetUrl);
    })());
});

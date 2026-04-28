self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {
            title: 'New Notification',
            body: event.data ? event.data.text() : 'You have a new message',
        };
    }

    const title = data.title || 'New Notification';
    const options = {
        body: data.body || 'You have a new message',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: {
            url: data.url || '/',
        },
        tag: data.tag || 'n8n-chat-notification',
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification?.data?.url || '/';

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
                    // Tab closed between matchAll and focus/navigate — fall through to openWindow
                }
            }
        }
        await clients.openWindow(targetUrl);
    })());
});

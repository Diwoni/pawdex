self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Pawdex 🐾", {
      body: payload.body ?? "고양이가 부르고 있어요.",
      tag: payload.tag ?? "pawdex",
      data: payload.data ?? { url: "/" },
      badge: "/pawdex.svg",
      icon: "/pawdex.svg",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});

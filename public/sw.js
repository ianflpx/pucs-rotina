// PUCS: push, alarmes de descanso e clique de notificação. Sem cache de dados pessoais.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([self.clients.claim(), pruneRestState()])));

let restDB;
const memoryClaims = new Map();
function openRestDB() {
  restDB ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('pucs-rest-alerts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('claims', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return restDB;
}

/** Uma transação readwrite serializa mensagens locais, pushes e outras abas. */
async function claimRest(id, cancel = false) {
  try {
    const db = await openRestDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('claims', 'readwrite');
      const store = tx.objectStore('claims');
      const request = store.get(id);
      let claimed = false;
      request.onsuccess = () => {
        if (!cancel && request.result && request.result.expiresAt > Date.now()) return;
        claimed = true;
        store.put({ id, expiresAt: Date.now() + 86_400_000, state: cancel ? 'cancelled' : 'done' });
      };
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Navegadores que negam IndexedDB ainda recebem o alarme nesta execução do SW.
    if (!cancel && memoryClaims.has(id)) return false;
    memoryClaims.set(id, true);
    return true;
  }
}

async function pruneRestState() {
  try {
    const db = await openRestDB();
    await new Promise((resolve) => {
      const tx = db.transaction('claims', 'readwrite');
      const request = tx.objectStore('claims').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.expiresAt < Date.now()) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch { /* Sem dados de navegação/conta neste armazenamento. */ }
}

async function finishRestNotice(data, show = true) {
  if (!Number.isFinite(data.endsAt) || data.endsAt > Date.now() || Date.now() - data.endsAt > 120_000) return false;
  if (!(await claimRest(data.id))) return false;
  if (show) {
    await self.registration.showNotification('Descanso acabou', {
      body: `${data.exercise || 'Treino'} · hora da próxima série.`,
      icon: '/icon-192.png', badge: '/icon-192.png', tag: `pucs-rest-${data.id}`,
      data: { url: data.date ? `/treino?data=${data.date}` : '/treino' },
    }).catch(() => {});
  }
  return true;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !['pucs-rest-finish', 'pucs-rest-cancel'].includes(data.action) || typeof data.id !== 'string' || !/^[\da-f-]{36}$/i.test(data.id)) return;
  event.waitUntil((async () => {
    let claimed;
    if (data.action === 'pucs-rest-cancel') {
      claimed = await claimRest(data.id, true);
      const notices = await self.registration.getNotifications({ tag: `pucs-rest-${data.id}` });
      notices.forEach((notice) => notice.close());
    } else claimed = await finishRestNotice(data, data.show === true);
    event.ports?.[0]?.postMessage({ claimed });
  })().catch(() => event.ports?.[0]?.postMessage({ claimed: false })));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PUCS', body: event.data ? event.data.text() : '' };
  }
  // Formato do lembrete interno criado pelo app, transportado pelo notify já publicado.
  const rest = /^Lembrete: Descanso PUCS (\d{13}): (.*)$/.exec(data.title || '');
  const restId = /^lembrete-([\da-f-]{36})$/i.exec(data.tag || '');
  if (rest && restId) {
    event.waitUntil(finishRestNotice({ id: restId[1], endsAt: Number(rest[1]), exercise: rest[2] }));
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PUCS', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

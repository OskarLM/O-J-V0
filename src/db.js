
const DB_NAME = 'app-db';
const DB_VERSION = 2;
const STORE_ITEMS = 'items';

export async function initDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);

    open.onupgradeneeded = (event) => {
      const db = open.result;

      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
        store.createIndex('byText', 'textNorm', { unique: false });
      }

      if (event.oldVersion < 2) {
        const tx = open.transaction;
        const store = tx.objectStore(STORE_ITEMS);
        if (!store.indexNames.contains('byCreatedAtId')) {
          store.createIndex('byCreatedAtId', ['createdAt', 'id'], { unique: false });
        }
        if (!store.indexNames.contains('byTextId')) {
          store.createIndex('byTextId', ['textNorm', 'id'], { unique: false });
        }
      }
    };

    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => console.warn('[db] Actualización bloqueada; cierra otras pestañas.');
  });
}

async function withStore(mode, fn) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, mode);
    const store = tx.objectStore(STORE_ITEMS);

    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };

    tx.oncomplete = () => done(undefined);
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error('Transacción abortada'));

    Promise.resolve(fn(store, tx)).then(done, fail);
  });
}

function normalizeText(s) {
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = (c === 'x') ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function addItem({ text, meta } = {}) {
  const now = Date.now();
  const item = {
    id: uuid(),
    text: text ?? '',
    textNorm: normalizeText(text ?? ''),
    meta: meta ?? {},
    createdAt: now,
    updatedAt: now,
  };
  await withStore('readwrite', (store) => store.add(item));
  return item;
}

export async function getItem(id) {
  return withStore('readonly', (store) => store.get(id));
}

export async function getAllItems({ sortBy = 'createdAt', direction = 'desc' } = {}) {
  const indexName = sortBy === 'createdAt' ? 'byCreatedAt' : null;
  return withStore('readonly', (store) =>
    new Promise((resolve, reject) => {
      const source = indexName ? store.index(indexName) : store;
      const dir = direction === 'asc' ? 'next' : 'prev';
      const out = [];
      const req = source.openCursor(null, dir);
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push(c.value); c.continue(); } else { resolve(out); }
      };
      req.onerror = () => reject(req.error);
    })
  );
}

export async function updateItem(id, patch = {}) {
  return withStore('readwrite', async (store) => {
    const existing = await new Promise((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!existing) throw new Error(`Item ${id} no existe`);

    const next = {
      ...existing,
      ...patch,
      ...(patch.text !== undefined ? { textNorm: normalizeText(patch.text) } : {}),
      updatedAt: Date.now(),
    };
    await new Promise((res, rej) => {
      const r = store.put(next);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
    return next;
  });
}

export async function deleteItem(id) {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function clearItems() {
  await withStore('readwrite', (store) => store.clear());
}

export async function countItems() {
  return withStore('readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

function toTs(v) {
  if (v == null) return null;
  return v instanceof Date ? v.getTime() : Number(v);
}

function encodeCursor(obj) {
  return btoa(JSON.stringify(obj));
}
function decodeCursor(token) {
  try { return token ? JSON.parse(atob(token)) : null; }
  catch { return null; }
}

export async function queryItems({
  textPrefix = '',
  dateFrom = null,
  dateTo = null,
  order = 'desc',
  limit = 20,
  cursor = null,
} = {}) {
  const prefix = normalizeText(textPrefix);
  const from = toTs(dateFrom);
  const to = toTs(dateTo);
  const dir = order === 'asc' ? 'next' : 'prev';

  const cObj = decodeCursor(cursor);

  const useTextIndex = !!prefix && !from && !to;
  const indexName = useTextIndex ? 'byTextId' : 'byCreatedAtId';

  let range = null;
  if (useTextIndex) {
    const low = [prefix, ''];
    const high = [prefix + '\uffff', '\uffff'];
    range = IDBKeyRange.bound(low, high);
  } else {
    const lowTs = from ?? 0;
    const highTs = to ?? Number.MAX_SAFE_INTEGER;
    const low = [lowTs, ''];
    const high = [highTs, '\uffff'];
    range = IDBKeyRange.bound(low, high);
  }

  if (cObj && cObj.createdAt && cObj.id) {
    const key = [cObj.createdAt, cObj.id];
    if (indexName === 'byTextId' && useTextIndex) {
      if (dir === 'next') {
        range = IDBKeyRange.lowerBound([prefix, cObj.id], true);
      } else {
        range = IDBKeyRange.upperBound([prefix, cObj.id], true);
      }
    } else {
      if (dir === 'next') {
        range = IDBKeyRange.lowerBound(key, true);
      } else {
        range = IDBKeyRange.upperBound(key, true);
      }
    }
  }

  return withStore('readonly', (store) =>
    new Promise((resolve, reject) => {
      const index = store.index(indexName);
      const out = [];
      let firstKey = null;
      let lastKey = null;

      const req = index.openCursor(range, dir);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({
            items: out,
            page: {
              nextCursor: out.length ? encodeCursor(lastKey) : null,
              prevCursor: out.length ? encodeCursor(firstKey) : null,
              hasNext: out.length === limit,
              hasPrev: !!cObj,
            },
          });
          return;
        }

        const val = cursor.value;
        if (!useTextIndex && prefix) {
          if (!val.textNorm.startsWith(prefix)) {
            return cursor.continue();
          }
        }

        if (out.length < limit) {
          out.push(val);
          const k = cursor.key;
          if (!firstKey) firstKey = { createdAt: val.createdAt, id: val.id };
          lastKey = { createdAt: val.createdAt, id: val.id };
          cursor.continue();
        } else {
          resolve({
            items: out,
            page: {
              nextCursor: encodeCursor(lastKey),
              prevCursor: encodeCursor(firstKey),
              hasNext: true,
              hasPrev: !!cObj,
            },
          });
        }
      };
      req.onerror = () => reject(req.error);
    })
  );
}

export async function countItemsFiltered({ textPrefix = '', dateFrom = null, dateTo = null } = {}) {
  const prefix = normalizeText(textPrefix);
  const from = toTs(dateFrom) ?? 0;
  const to = toTs(dateTo) ?? Number.MAX_SAFE_INTEGER;

  const useTextIndex = !!prefix;
  const indexName = useTextIndex ? 'byTextId' : 'byCreatedAtId';

  return withStore('readonly', (store) =>
    new Promise((resolve, reject) => {
      const index = store.index(indexName);
      let range = null;

      if (useTextIndex) {
        range = IDBKeyRange.bound([prefix, ''], [prefix + '\uffff', '\uffff']);
      } else {
        range = IDBKeyRange.bound([from, ''], [to, '\uffff']);
      }

      let n = 0;
      const req = index.openCursor(range, 'next');
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(n);
        const val = c.value;
        if (useTextIndex) {
          if (val.createdAt >= from && val.createdAt <= to) n++;
        } else {
          if (!prefix || val.textNorm.startsWith(prefix)) n++;
        }
        c.continue();
      };
      req.onerror = () => reject(req.error);
    })
  );
}

export async function findByTextPrefix(prefix) {
  return queryItems({ textPrefix: prefix, limit: 100 }).then(r => r.items);
}

export async function exportItems() {
  const all = await getAllItems({ sortBy: 'createdAt', direction: 'asc' });
  return { exportedAt: new Date().toISOString(), version: DB_VERSION, items: all };
}

export async function importItems(payload, { merge = true } = {}) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('Formato de import no válido');
  }
  const incoming = payload.items;

  await withStore('readwrite', async (store) => {
    if (!merge) {
      await new Promise((res, rej) => { const r = store.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    }

    for (const raw of incoming) {
      const item = {
        id: raw.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
        text: raw.text ?? '',
        textNorm: normalizeText(raw.text ?? ''),
        meta: raw.meta ?? {},
        createdAt: raw.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await new Promise((res, rej) => { const r = store.put(item); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    }
  });
}

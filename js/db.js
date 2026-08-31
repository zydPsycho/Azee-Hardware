/* ============================================================
   AZEE HARDWARE — Local Database (IndexedDB)
   Fully offline. No network calls anywhere in this file.
   Stores: works, dailyLogs, materials, expenses, attachments,
           invoices, meta (business details + app settings)
   ============================================================ */
(function (global) {
  const DB_NAME = 'azee_hardware_db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('works')) {
          const s = db.createObjectStore('works', { keyPath: 'id' });
          s.createIndex('status', 'status');
          s.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('dailyLogs')) {
          const s = db.createObjectStore('dailyLogs', { keyPath: 'id' });
          s.createIndex('workId', 'workId');
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('materials')) {
          const s = db.createObjectStore('materials', { keyPath: 'id' });
          s.createIndex('workId', 'workId');
        }
        if (!db.objectStoreNames.contains('expenses')) {
          const s = db.createObjectStore('expenses', { keyPath: 'id' });
          s.createIndex('workId', 'workId');
        }
        if (!db.objectStoreNames.contains('attachments')) {
          const s = db.createObjectStore('attachments', { keyPath: 'id' });
          s.createIndex('workId', 'workId');
        }
        if (!db.objectStoreNames.contains('invoices')) {
          const s = db.createObjectStore('invoices', { keyPath: 'id' });
          s.createIndex('workId', 'workId');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return openDB().then(db => db.transaction(store, mode).objectStore(store));
  }

  function uid(prefix) {
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const Store = (name) => ({
    async put(obj) {
      const s = await tx(name, 'readwrite');
      return reqToPromise(s.put(obj));
    },
    async get(id) {
      const s = await tx(name, 'readonly');
      return reqToPromise(s.get(id));
    },
    async delete(id) {
      const s = await tx(name, 'readwrite');
      return reqToPromise(s.delete(id));
    },
    async all() {
      const s = await tx(name, 'readonly');
      return reqToPromise(s.getAll());
    },
    async byIndex(indexName, value) {
      const s = await tx(name, 'readonly');
      return reqToPromise(s.index(indexName).getAll(value));
    },
    async clear() {
      const s = await tx(name, 'readwrite');
      return reqToPromise(s.clear());
    }
  });

  const DB = {
    works: Store('works'),
    dailyLogs: Store('dailyLogs'),
    materials: Store('materials'),
    expenses: Store('expenses'),
    attachments: Store('attachments'),
    invoices: Store('invoices'),
    meta: Store('meta'),
    uid,
    async init() { await openDB(); return true; },

    // Cascade delete: remove a work and everything attached to it
    async deleteWorkCascade(workId) {
      const [logs, mats, exps, atts, invs] = await Promise.all([
        DB.dailyLogs.byIndex('workId', workId),
        DB.materials.byIndex('workId', workId),
        DB.expenses.byIndex('workId', workId),
        DB.attachments.byIndex('workId', workId),
        DB.invoices.byIndex('workId', workId)
      ]);
      await Promise.all([
        ...logs.map(x => DB.dailyLogs.delete(x.id)),
        ...mats.map(x => DB.materials.delete(x.id)),
        ...exps.map(x => DB.expenses.delete(x.id)),
        ...atts.map(x => DB.attachments.delete(x.id)),
        ...invs.map(x => DB.invoices.delete(x.id))
      ]);
      await DB.works.delete(workId);
    },

    async getMeta(key, fallback) {
      const row = await DB.meta.get(key);
      return row ? row.value : fallback;
    },
    async setMeta(key, value) {
      return DB.meta.put({ key, value });
    },

    // Full export for backup
    async exportAll() {
      const [works, dailyLogs, materials, expenses, attachments, invoices, metaAll] = await Promise.all([
        DB.works.all(), DB.dailyLogs.all(), DB.materials.all(),
        DB.expenses.all(), DB.attachments.all(), DB.invoices.all(), DB.meta.all()
      ]);
      return {
        app: 'AZEE_HARDWARE', version: 1, exportedAt: new Date().toISOString(),
        works, dailyLogs, materials, expenses, attachments, invoices, meta: metaAll
      };
    },

    // Full import (merge, existing IDs are overwritten)
    async importAll(data) {
      if (!data || data.app !== 'AZEE_HARDWARE') throw new Error('Invalid backup file');
      const puts = [];
      (data.works || []).forEach(x => puts.push(DB.works.put(x)));
      (data.dailyLogs || []).forEach(x => puts.push(DB.dailyLogs.put(x)));
      (data.materials || []).forEach(x => puts.push(DB.materials.put(x)));
      (data.expenses || []).forEach(x => puts.push(DB.expenses.put(x)));
      (data.attachments || []).forEach(x => puts.push(DB.attachments.put(x)));
      (data.invoices || []).forEach(x => puts.push(DB.invoices.put(x)));
      (data.meta || []).forEach(x => puts.push(DB.meta.put(x)));
      await Promise.all(puts);
      return true;
    }
  };

  global.DB = DB;
})(window);

export function createWebStore(storeName, indexedDB = globalThis.indexedDB, name = 'WorldCardStationWeb') {
  async function open() {
    if (!indexedDB) throw new Error('当前浏览器无法使用 IndexedDB');
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => {
        for (const store of ['cardReferences', 'settings', 'backgrounds', 'sessions']) {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'key' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('本地数据升级被其他页面阻塞，请关闭旧页面后重试')); };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
  }
  async function transaction(mode, operation) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        let value;
        const request = operation(tx.objectStore(storeName));
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || request.error || new Error('本地数据保存失败'));
        tx.onerror = () => {};
      });
    } finally { db.close(); }
  }
  return {
    list: () => transaction('readonly', store => store.getAll()),
    get: key => transaction('readonly', store => store.get(key)),
    put: record => transaction('readwrite', store => store.put(record)),
    async update(key, change) {
      const db = await open();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          let value, failure;
          const request = store.get(key);
          request.onsuccess = () => {
            try { value = change(request.result); store.put(value); }
            catch (error) { failure = error; tx.abort(); }
          };
          tx.oncomplete = () => resolve(value);
          tx.onabort = () => reject(failure || tx.error || new Error('会话事务失败'));
          tx.onerror = () => {};
        });
      } finally { db.close(); }
    }
  };
}

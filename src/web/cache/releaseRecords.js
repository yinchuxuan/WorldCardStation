const DB_NAME = 'WorldCardStationWeb';
export function createReleaseRecords(indexedDB = globalThis.indexedDB, name = DB_NAME) {
  async function open() {
    if (!indexedDB) throw new Error('当前浏览器无法使用 IndexedDB');
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('cardReferences', { keyPath: 'key' });
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
        const tx = db.transaction('cardReferences', mode);
        let value;
        const request = operation(tx.objectStore('cardReferences'));
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || request.error || new Error('本地发布记录保存失败'));
        tx.onerror = () => {}; // onabort reports the transaction result, not just request success.
      });
    } finally { db.close(); }
  }
  return {
    get: key => transaction('readonly', store => store.get(key)),
    put: record => transaction('readwrite', store => store.put(record))
  };
}

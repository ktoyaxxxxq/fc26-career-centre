let database;

function openDesk() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('fifth-half-careers', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('careers');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { database = null; throw error; });
  return database;
}

export async function readDesk(key) {
  const db = await openDesk();
  return new Promise((resolve, reject) => {
    const request = db.transaction('careers').objectStore('careers').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeDesk(key, value) {
  const db = await openDesk();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('careers', 'readwrite');
    transaction.objectStore('careers').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

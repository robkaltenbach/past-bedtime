// Remembers the last cartridge (IndexedDB) and battery saves per ROM.
export class RomStore {
  constructor() {
    this.db = new Promise((res) => {
      try {
        const r = indexedDB.open('past-bedtime', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch { res(null); }
    });
  }
  static hash(bytes) { let h = 2166136261; for (let i = 0; i < bytes.length; i += 7) { h ^= bytes[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + '-' + bytes.length; }
  async op(mode, fn) {
    const db = await this.db; if (!db) return null;
    return new Promise((res) => {
      try { const tx = db.transaction('kv', mode); const r = fn(tx.objectStore('kv')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => res(null); } catch { res(null); }
    });
  }
  saveRom(name, bytes) { return this.op('readwrite', (s) => s.put({ name, bytes }, 'lastRom')); }
  loadRom() { return this.op('readonly', (s) => s.get('lastRom')); }
  saveSram(key, data) { return this.op('readwrite', (s) => s.put(data, 'sram:' + key)); }
  async loadSram(key) { const d = await this.op('readonly', (s) => s.get('sram:' + key)); return d ? d.buffer.slice(0) : null; }
}

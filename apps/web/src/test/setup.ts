import '@testing-library/jest-dom/vitest';

// Node 22+ ships a stub `localStorage` global that requires `--localstorage-file`
// and overrides jsdom's. Replace it with a simple in-memory implementation.
function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key) {
      return key in store ? store[key]! : null;
    },
    key(i) {
      return Object.keys(store)[i] ?? null;
    },
    removeItem(key) {
      delete store[key];
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage(),
  configurable: true,
  writable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: globalThis.localStorage,
    configurable: true,
    writable: true,
  });
}


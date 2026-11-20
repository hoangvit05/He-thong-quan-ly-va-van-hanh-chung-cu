// Serializes persistence and guards against 401 responses from a previous session.
export interface TokenStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export function createTokenStore(storage: TokenStorage) {
  const key = '@apartment-management/auth-token';
  let version = 0;
  let token: string | null = null;
  let loaded = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const next = queue.then(job);
    queue = next.catch(() => undefined);
    return next;
  }
  return {
    snapshot: () => serial(async () => {
      if (!loaded) { token = await storage.getItem(key); loaded = true; }
      return { token, version };
    }),
    set: (value: string) => serial(async () => {
      const next = value.trim();
      if (!next) throw new Error('Không thể lưu token rỗng.');
      await storage.setItem(key, next);
      token = next;
      loaded = true;
      version++;
    }),
    clear: (expectedVersion?: number) => serial(async () => {
      if (expectedVersion !== undefined && expectedVersion !== version) return false;
      token = null;
      loaded = true;
      version++;
      // Revoke in-memory access even if persistence fails; surface that failure.
      listeners.forEach(listener => listener());
      await storage.removeItem(key);
      return true;
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

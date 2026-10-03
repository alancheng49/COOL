// 簡單的記憶體快取：TTL + 前綴失效。
// 切換分頁時直接回快取，寫入類操作會呼叫 invalidate() 讓下次重新抓。

interface Entry {
  at: number;
  data: unknown;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 5 * 60 * 1000; // 5 分鐘

export async function cached<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;

  // 同一個 key 併發請求只打一次
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const p = fetcher()
    .then((data) => {
      // 只快取成功回應(ok 不為 false)
      const anyData = data as { ok?: boolean } | null;
      if (anyData && anyData.ok !== false) store.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** 失效符合前綴的快取（不給參數 = 全部清除） */
export function invalidate(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

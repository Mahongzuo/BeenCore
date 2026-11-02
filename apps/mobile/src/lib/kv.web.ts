/**
 * Web 的设置存储：用浏览器自己的 localStorage。
 *
 * kv-store 在 Web 上走同步 SQLite，要求页面跨域隔离（SharedArrayBuffer）；
 * 页面没带那两个响应头时（例如开发服务器的首页 "/"），读写会静默失败，设置（包括登录状态）就丢了。
 * 设置只是几百字节的偏好，放 localStorage 最稳。旧版本存在 kv-store 里的，第一次读取时搬过来。
 */
import KvStore from 'expo-sqlite/kv-store';

function local(): globalThis.Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const kv = {
  get(key: string): string | null {
    const ls = local();
    try {
      const v = ls?.getItem(key);
      if (v != null) return v;
    } catch {
      // 隐私模式等情况下 localStorage 可能抛错
    }
    try {
      const old = typeof SharedArrayBuffer !== 'undefined' ? KvStore.getItemSync(key) : null;
      if (old != null) ls?.setItem(key, old);
      return old;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    local()?.setItem(key, value);
  },
};

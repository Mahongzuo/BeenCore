/**
 * 很小的同步键值存储（设置用）。原生：expo-sqlite 的 kv-store。Web 见 kv.web.ts。
 */
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  get: (key: string): string | null => Storage.getItemSync(key),
  set: (key: string, value: string): void => Storage.setItemSync(key, value),
};

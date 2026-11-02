import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { Person, Trace } from '@been/core';
import { countTracesByOwner, getPerson, getTrace, listPersons, listTraces, onDataChange } from './db';

/**
 * 未删除的印记，按发生时间倒序；任何写入后自动刷新。
 * owner：null（默认）是「我」的；传档案 id 取那份档案的；'all' 全部。
 */
export function useTraces(owner: string | null | 'all' = null): { traces: Trace[]; loading: boolean } {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ traces: Trace[]; loading: boolean }>({ traces: [], loading: true });
  const load = useCallback(() => {
    listTraces(db, owner)
      .then((traces) => setState({ traces, loading: false }))
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, [db, owner]);
  useEffect(() => {
    load();
    return onDataChange(load);
  }, [load]);
  return state;
}

export function useTrace(id: string | undefined): { trace: Trace | null; loading: boolean } {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ trace: Trace | null; loading: boolean }>({ trace: null, loading: true });
  useEffect(() => {
    if (!id) return;
    const load = () =>
      getTrace(db, id)
        .then((trace) => setState({ trace, loading: false }))
        .catch(() => setState({ trace: null, loading: false }));
    load();
    return onDataChange(load);
  }, [db, id]);
  return state;
}

/** 每分钟更新一次的「现在」，用于那年今日、时光胶囊是否开启 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 亲友与宠物档案，最近改动的在前；附带每份档案的印记数 */
export function usePersons(): { persons: Person[]; counts: Map<string, number>; loading: boolean } {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ persons: Person[]; counts: Map<string, number>; loading: boolean }>({
    persons: [],
    counts: new Map(),
    loading: true,
  });
  useEffect(() => {
    const load = () =>
      Promise.all([listPersons(db), countTracesByOwner(db)])
        .then(([persons, counts]) => setState({ persons, counts, loading: false }))
        .catch(() => setState((s) => ({ ...s, loading: false })));
    load();
    return onDataChange(load);
  }, [db]);
  return state;
}

export function usePerson(id: string | undefined | null): { person: Person | null; loading: boolean } {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ person: Person | null; loading: boolean }>({ person: null, loading: !!id });
  useEffect(() => {
    if (!id) {
      setState({ person: null, loading: false });
      return;
    }
    const load = () =>
      getPerson(db, id)
        .then((person) => setState({ person: person?.deletedAt ? null : person, loading: false }))
        .catch(() => setState({ person: null, loading: false }));
    load();
    return onDataChange(load);
  }, [db, id]);
  return state;
}

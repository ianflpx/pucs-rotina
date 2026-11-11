import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';
import { useStore } from './store';
import { cancelRest, resumeRest } from './rest';
import { isRestReminder } from './rest-reminder';
import type { Task } from './types';
import type { RowOf, TableName } from './types';
import { TABLES } from './types';

type Status = 'local' | 'syncing' | 'synced' | 'error';

interface SyncState {
  session: Session | null;
  ready: boolean;
  status: Status;
  lastSync: string | null;
  error: string | null;
}

export const useSync = create<SyncState>(() => ({
  session: null,
  ready: false,
  status: 'local',
  lastSync: null,
  error: null,
}));

const LOCAL_ONLY = ['synced_at', 'user_id'];
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;

async function pull() {
  const { cursors, mergeRemote, setCursor } = useStore.getState();
  for (const t of TABLES) {
    let from = 0;
    let maxAt = cursors[t] ?? null;
    for (;;) {
      let q = supabase.from(t).select('*').order('synced_at', { ascending: true }).range(from, from + 999);
      if (cursors[t]) q = q.gt('synced_at', cursors[t]!);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as (RowOf<TableName> & { synced_at: string })[];
      mergeRemote(t, rows);
      if (rows.length) maxAt = rows[rows.length - 1].synced_at;
      if (rows.length < 1000) break;
      from += 1000;
    }
    if (maxAt) setCursor(t, maxAt);
  }
}

async function push() {
  const state = useStore.getState();
  const keys = Object.keys(state.dirty);
  if (!keys.length) return;
  const byTable = new Map<TableName, RowOf<TableName>[]>();
  for (const k of keys) {
    const [t, id] = k.split(':') as [TableName, string];
    const row = (state[t] as Record<string, RowOf<TableName>>)[id];
    if (!row) continue;
    // O descanso tem fila serial própria: não disputar criação/cancelamento com este lote.
    if (t === 'tasks' && isRestReminder(row as Task)) continue;
    const clean = Object.fromEntries(Object.entries(row).filter(([f]) => !LOCAL_ONLY.includes(f)));
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t)!.push(clean as RowOf<TableName>);
  }
  for (const [t, rows] of byTable) {
    const { error } = await supabase.from(t).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    useStore.getState().markClean(rows.map((r) => ({ t, id: r.id, updated_at: r.updated_at })));
  }
}

export function syncNow(): Promise<void> {
  if (!useSync.getState().session) return Promise.resolve();
  if (running) return running;
  useSync.setState({ status: 'syncing', error: null });
  running = (async () => {
    try {
      await pull();
      await push();
      resumeRest();
      useSync.setState({ status: 'synced', lastSync: new Date().toISOString() });
    } catch (e) {
      useSync.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

function schedulePush() {
  if (!useSync.getState().session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (running) return schedulePush();
    useSync.setState({ status: 'syncing' });
    push()
      .then(() => useSync.setState({ status: 'synced', lastSync: new Date().toISOString(), error: null }))
      .catch((e) => useSync.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
  }, 700);
}

export function initSync() {
  useStore.getState().ensureSeed();

  supabase.auth.getSession().then(({ data }) => {
    useSync.setState({ session: data.session, ready: true, status: data.session ? 'syncing' : 'local' });
    if (data.session) syncNow();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    useSync.setState({ session, status: session ? useSync.getState().status : 'local' });
    if (event === 'SIGNED_IN') syncNow();
  });

  useStore.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty && Object.keys(s.dirty).length) schedulePush();
  });

  window.addEventListener('focus', () => syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 60_000);
}

export async function signOut() {
  await cancelRest();
  await syncNow();
  await supabase.auth.signOut();
  useStore.getState().wipe();
  useStore.getState().ensureSeed();
  useSync.setState({ session: null, status: 'local' });
}

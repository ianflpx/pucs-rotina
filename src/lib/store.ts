import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Prefs, RowOf, TableName, Tables } from './types';
import { TABLES } from './types';
import {
  seedLabels,
  seedMeals,
  seedPrefs,
  seedProjects,
  seedSplits,
  seedTasks,
} from '../data/seed';
import { today } from './dates';
import { isRestReminder } from './rest-reminder';
import type { Task } from './types';

const SEED_VERSION = 2;

interface State extends Tables {
  dirty: Record<string, true>;
  cursors: Partial<Record<TableName, string>>;
  seeded: number;
  put: <T extends TableName>(t: T, row: Partial<RowOf<T>> & { id: string }) => RowOf<T>;
  remove: (t: TableName, id: string) => void;
  mergeRemote: (t: TableName, rows: RowOf<TableName>[]) => void;
  markClean: (items: { t: TableName; id: string; updated_at: string }[]) => void;
  setCursor: (t: TableName, at: string) => void;
  ensureSeed: () => void;
  wipe: () => void;
}

const emptyTables = (): Tables => ({
  projects: {},
  labels: {},
  tasks: {},
  meals: {},
  meal_logs: {},
  day_logs: {},
  splits: {},
  workout_logs: {},
  prefs: {},
  transactions: {},
});

const key = (t: TableName, id: string) => `${t}:${id}`;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...emptyTables(),
      dirty: {},
      cursors: {},
      seeded: 0,

      put: (t, row) => {
        const table = get()[t] as Record<string, RowOf<typeof t>>;
        const next = { ...table[row.id], ...row, updated_at: new Date().toISOString() } as RowOf<typeof t>;
        set((s) => ({
          [t]: { ...(s[t] as object), [row.id]: next },
          dirty: { ...s.dirty, [key(t, row.id)]: true },
        }) as Partial<State>);
        return next;
      },

      remove: (t, id) => {
        const row = (get()[t] as Record<string, RowOf<TableName>>)[id];
        if (!row) return;
        get().put(t, { id, deleted: true } as never);
      },

      mergeRemote: (t, rows) => {
        if (!rows.length) return;
        set((s) => {
          const table = { ...(s[t] as Record<string, RowOf<TableName>>) };
          const dirty = { ...s.dirty };
          for (const r of rows) {
            const local = table[r.id];
            if (!local || new Date(r.updated_at) >= new Date(local.updated_at)) {
              table[r.id] = r;
              delete dirty[key(t, r.id)];
            }
          }
          return { [t]: table, dirty } as Partial<State>;
        });
      },

      markClean: (items) =>
        set((s) => {
          const dirty = { ...s.dirty };
          for (const it of items) {
            const row = (s[it.t] as Record<string, RowOf<TableName>>)[it.id];
            if (row && row.updated_at === it.updated_at) delete dirty[key(it.t, it.id)];
          }
          return { dirty };
        }),

      setCursor: (t, at) => set((s) => ({ cursors: { ...s.cursors, [t]: at } })),

      ensureSeed: () => {
        if (get().seeded >= SEED_VERSION) return;
        const s = get();
        // v2 trocou a paleta: seed de projeto/etiqueta nunca editado ganha a cor nova.
        const refresh = (t: TableName) => s.seeded < 2 && (t === 'projects' || t === 'labels');
        const fill = <T extends TableName>(t: T, rows: RowOf<T>[]) => {
          const table = { ...(s[t] as Record<string, RowOf<T>>) };
          const dirty: Record<string, true> = {};
          for (const r of rows) {
            if (!table[r.id] || (refresh(t) && table[r.id].updated_at === r.updated_at)) {
              table[r.id] = r;
              dirty[key(t, r.id)] = true;
            }
          }
          return { table, dirty };
        };
        const parts = [
          ['projects', fill('projects', seedProjects)],
          ['labels', fill('labels', seedLabels)],
          ['tasks', fill('tasks', seedTasks(today()))],
          ['meals', fill('meals', seedMeals)],
          ['splits', fill('splits', seedSplits)],
          ['prefs', fill('prefs', [seedPrefs])],
        ] as const;
        const patch: Record<string, unknown> = { seeded: SEED_VERSION };
        let dirty = { ...s.dirty };
        for (const [t, p] of parts) {
          patch[t] = p.table;
          dirty = { ...dirty, ...p.dirty };
        }
        patch.dirty = dirty;
        set(patch as Partial<State>);
      },

      wipe: () => set({ ...emptyTables(), dirty: {}, cursors: {}, seeded: 0 }),
    }),
    {
      name: 'pucs:data',
      version: 1,
      partialize: (s) => {
        const out: Record<string, unknown> = { dirty: s.dirty, cursors: s.cursors, seeded: s.seeded };
        for (const t of TABLES) out[t] = s[t];
        return out as Partial<State>;
      },
    },
  ),
);

export function useRows<T extends TableName>(t: T): RowOf<T>[] {
  const table = useStore((s) => s[t]) as Record<string, RowOf<T>>;
  return useMemo(() => Object.values(table).filter((r) => !r.deleted && (t !== 'tasks' || !isRestReminder(r as Task))), [table, t]);
}

export function useRow<T extends TableName>(t: T, id: string | null | undefined): RowOf<T> | undefined {
  return useStore((s) => (id ? ((s[t] as Record<string, RowOf<T>>)[id] as RowOf<T> | undefined) : undefined));
}

export function usePrefs(): Prefs['data'] {
  const prefs = useRows('prefs');
  return { ...seedPrefs.data, ...(prefs[0]?.data ?? {}) };
}

export function getPrefsRow(): Prefs {
  const rows = Object.values(useStore.getState().prefs).filter((r) => !r.deleted);
  return rows[0] ?? seedPrefs;
}

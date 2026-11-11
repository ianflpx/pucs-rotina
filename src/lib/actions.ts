import { create } from 'zustand';
import { useStore, getPrefsRow } from './store';
import { uid, stableId } from './ids';
import { nextOccurrence } from './recurrence';
import { fold } from './parse';
import { labelDate } from './dates';
import type { DayLog, MealLog, PrefsData, Priority, Task, WorkoutLog } from './types';
import { celebrate, tick } from './fx';
import { isRestReminder } from './rest-reminder';

/* ---------- toasts ---------- */

export interface Toast {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export function toast(text: string, action?: Toast['action']) {
  const t = { id: uid(), text, action };
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4500);
}

/* ---------- UI global (modais) ---------- */

interface UIState {
  quickAdd: null | { project_id?: string | null; due_date?: string | null; parent_id?: string | null };
  openTask: string | null;
  palette: boolean;
  help: boolean;
  nav: boolean;
}

export const useUI = create<UIState>(() => ({ quickAdd: null, openTask: null, palette: false, help: false, nav: false }));

/* ---------- tarefas ---------- */

export function tasksArray(): Task[] {
  return Object.values(useStore.getState().tasks).filter((t) => !t.deleted && !isRestReminder(t));
}

export function createTask(input: Partial<Task> & { title: string }): Task {
  const siblings = tasksArray().filter((t) => t.project_id === (input.project_id ?? null));
  const sort = siblings.reduce((m, t) => Math.max(m, t.sort ?? 0), 0) + 1;
  return useStore.getState().put('tasks', {
    id: uid(),
    description: null,
    project_id: null,
    parent_id: null,
    due_date: null,
    due_time: null,
    priority: 4,
    labels: [],
    recurrence: null,
    completed_at: null,
    sort,
    ...input,
  } as Task);
}

export function updateTask(id: string, patch: Partial<Task>) {
  useStore.getState().put('tasks', { id, ...patch });
}

export function completeTask(task: Task) {
  const prefs = getPrefsRow().data;
  if (prefs.sound) tick();
  if (task.recurrence && !task.parent_id) {
    const prevDue = task.due_date;
    const next = nextOccurrence(task.recurrence, task.due_date);
    updateTask(task.id, { due_date: next });
    toast(`Feita! Próxima: ${labelDate(next)}`, {
      label: 'Desfazer',
      run: () => updateTask(task.id, { due_date: prevDue }),
    });
    return;
  }
  updateTask(task.id, { completed_at: new Date().toISOString() });
  toast('1 tarefa concluída', { label: 'Desfazer', run: () => updateTask(task.id, { completed_at: null }) });
}

export function uncompleteTask(task: Task) {
  updateTask(task.id, { completed_at: null });
}

export function deleteTask(task: Task) {
  const children = tasksArray().filter((t) => t.parent_id === task.id);
  const store = useStore.getState();
  store.remove('tasks', task.id);
  children.forEach((c) => store.remove('tasks', c.id));
  toast('Tarefa excluída', {
    label: 'Desfazer',
    run: () => {
      updateTask(task.id, { deleted: false });
      children.forEach((c) => updateTask(c.id, { deleted: false }));
    },
  });
}

export function findOrCreateProject(name: string): string {
  const all = Object.values(useStore.getState().projects).filter((p) => !p.deleted);
  const f = fold(name);
  const hit = all.find((p) => fold(p.name) === f) ?? all.find((p) => fold(p.name).startsWith(f));
  if (hit) return hit.id;
  return createProject(name);
}

export function createProject(name: string): string {
  const all = Object.values(useStore.getState().projects).filter((p) => !p.deleted);
  const colors = ['#ff4d1f', '#ff7a4d', '#ffa36b', '#ffd1a6', '#f5f5f7', '#c7c7d1', '#8a8aa0', '#5f5f70'];
  const p = useStore.getState().put('projects', {
    id: uid(),
    name,
    color: colors[all.length % colors.length],
    sort: all.length + 1,
  });
  return p.id;
}

export function resolveLabels(names: string[]): string[] {
  const all = Object.values(useStore.getState().labels).filter((l) => !l.deleted);
  return names.map((n) => {
    const hit = all.find((l) => fold(l.name) === fold(n));
    if (hit) return hit.name;
    useStore.getState().put('labels', { id: uid(), name: n, color: '#9b9bb0' });
    return n;
  });
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  1: '#ff4d1f',
  2: '#ffa36b',
  3: '#d4d4dc',
  4: '#6b6b7b',
};

/* ---------- rotina ---------- */

export function dayLogId(date: string) {
  return stableId(`day:${date}`);
}

export function setDayLog(date: string, patch: Partial<DayLog>) {
  const id = dayLogId(date);
  const existing = useStore.getState().day_logs[id];
  useStore.getState().put('day_logs', {
    ...(existing ? {} : { date, water_ml: 0, weight_kg: null, cardio_done: false, cardio_min: null, sleep_h: null, notes: null, habits: [], workout_rest: false, cardio_rest: false }),
    id,
    deleted: false,
    ...patch,
  });
}

export function mealLogId(date: string, mealId: string) {
  return stableId(`meal:${date}:${mealId}`);
}

export function setMealLog(date: string, mealId: string, patch: Partial<MealLog>) {
  const id = mealLogId(date, mealId);
  const existing = useStore.getState().meal_logs[id];
  useStore.getState().put('meal_logs', {
    ...(existing ? {} : { date, meal_id: mealId, done: false, done_at: null, choices: {}, dessert: false }),
    id,
    deleted: false,
    ...patch,
  });
}

export function workoutLogId(date: string) {
  return stableId(`wk:${date}`);
}

export function setWorkoutLog(date: string, patch: Partial<WorkoutLog>) {
  const id = workoutLogId(date);
  const existing = useStore.getState().workout_logs[id];
  useStore.getState().put('workout_logs', {
    ...(existing
      ? {}
      : { date, split_id: null, name: '', entries: [], started_at: null, finished_at: null }),
    id,
    deleted: false,
    ...patch,
  });
}

export function setPrefs(patch: Partial<PrefsData>) {
  const row = getPrefsRow();
  useStore.getState().put('prefs', { id: row.id, data: { ...row.data, ...patch } });
}

export { celebrate };

import { addDays, weekday } from './dates';
import type { Split, WorkoutEntry, WorkoutLog } from './types';

/**
 * Treino de cada dia entre `from` e `to`. A divisão é uma fila: descanso num dia com treino
 * não pula o treino, ele e os seguintes andam um dia (pode cair no fim de semana).
 * Começa com a fila vazia em `from`; treino não feito e sem descanso conta como consumido.
 */
export function planSplits(from: string, to: string, splits: Split[], rested: (date: string) => boolean): Record<string, Split | undefined> {
  const plan: Record<string, Split | undefined> = {};
  const queue: Split[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const own = splits.find((s) => s.weekday === weekday(d));
    let split = own;
    if (queue.length) {
      split = queue.shift();
      if (own) queue.push(own);
    }
    plan[d] = split;
    if (split && rested(d)) queue.unshift(split);
  }
  return plan;
}

export const exerciseKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

export function buildEntries(split: Split): WorkoutEntry[] {
  return split.exercises.map((e) => ({ exercise_id: e.id, name: e.name, rest: e.rest, reps: e.reps, sets: Array.from({ length: e.sets }, () => ({ w: null, r: null, done: false })) }));
}

/** Mantém as cargas e séries feitas dos exercícios que continuam na ficha. */
export function reconcileEntries(split: Split, entries: WorkoutEntry[]): WorkoutEntry[] {
  return buildEntries(split).map((entry) => {
    const old = entries.find((e) => e.exercise_id === entry.exercise_id);
    if (!old) return entry;
    const lastDone = old.sets.reduce((last, set, i) => set.done ? i : last, -1);
    const count = Math.max(entry.sets.length, lastDone + 1);
    return { ...entry, sets: Array.from({ length: count }, (_, i) => old.sets[i] ?? { w: null, r: null, done: false }) };
  });
}

export function volume(log: WorkoutLog): number {
  return log.entries.reduce((sum, e) => sum + e.sets.reduce((n, s) => n + (s.done ? (s.w ?? 0) * (s.r ?? 0) : 0), 0), 0);
}

export function workoutMinutes(log: WorkoutLog): number | null {
  if (!log.started_at || !log.finished_at) return null;
  const min = (Date.parse(log.finished_at) - Date.parse(log.started_at)) / 60_000;
  return Number.isFinite(min) && min >= 0 ? min : null;
}

export function summarizeWorkouts(logs: WorkoutLog[]) {
  const finished = logs.filter((l) => !l.deleted && l.finished_at);
  const durations = finished.map(workoutMinutes).filter((n): n is number => n !== null);
  return {
    count: finished.length,
    volume: finished.reduce((n, l) => n + volume(l), 0),
    sets: finished.reduce((n, l) => n + l.entries.reduce((m, e) => m + e.sets.filter((s) => s.done).length, 0), 0),
    minutes: durations.reduce((a, b) => a + b, 0),
    averageMinutes: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  };
}

export function exerciseProgress(logs: WorkoutLog[], key: string, knownLogs = logs) {
  const ids = new Set(knownLogs.filter((l) => !l.deleted).flatMap((l) => l.entries.filter((e) => exerciseKey(e.name) === key).map((e) => e.exercise_id)));
  return logs.filter((l) => !l.deleted && l.finished_at).sort((a, b) => a.date.localeCompare(b.date)).flatMap((log) => {
    const sets = log.entries.filter((e) => ids.has(e.exercise_id) || exerciseKey(e.name) === key).flatMap((e) => e.sets).filter((s) => s.done && s.w != null && s.r != null && s.r > 0);
    if (!sets.length) return [];
    return [{ date: log.date, load: Math.max(...sets.map((s) => s.w!)), volume: sets.reduce((n, s) => n + s.w! * s.r!, 0) }];
  });
}

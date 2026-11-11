import type { Task } from './types';

const LABEL = '__pucs_rest';
const PREFIX = 'Descanso PUCS ';

export function isRestReminder(task: Pick<Task, 'title' | 'labels'>): boolean {
  return task.labels.includes(LABEL) && task.title.startsWith(PREFIX);
}

/** Reutiliza a fila de lembretes já publicada. Nenhuma coluna ou permissão nova. */
export function restReminder(rest: { id: string; endsAt: number; exercise: string }): Omit<Task, 'updated_at'> {
  return {
    id: rest.id,
    title: `${PREFIX}${rest.endsAt}: ${rest.exercise.replace(/[\r\n]/g, ' ').slice(0, 120)}`,
    description: 'Lembrete interno de descanso. Gerenciado automaticamente pelo PUCS.',
    labels: [LABEL], project_id: null, parent_id: null, due_date: null, due_time: null,
    priority: 4, recurrence: null,
    // O cron existente olha 15s à frente: compensar para nunca avisar antes do fim.
    reminder_at: new Date(rest.endsAt + 15_000).toISOString(),
    completed_at: null, sort: 0, deleted: false,
  };
}

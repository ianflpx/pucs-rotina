import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from './actions';
import { uid } from './ids';
import { isRestReminder, restReminder } from './rest-reminder';
import { useStore } from './store';
import { supabase } from './supabase';

export interface Rest {
  id: string;
  endsAt: number;
  total: number;
  date: string;
  exercise: string;
  alerted: boolean;
  remote: boolean;
}

export const useRest = create<{ rest: Rest | null }>()(persist<{ rest: Rest | null }>(() => ({ rest: null }), { name: 'pucs:rest' }));
let queue: Promise<unknown> = Promise.resolve();
const pending = new Set<string>();

async function persistReminder(id: string) {
  const row = useStore.getState().tasks[id];
  if (!row || !isRestReminder(row)) return;
  const clean = Object.fromEntries(Object.entries(row).filter(([key]) => !['user_id', 'synced_at'].includes(key)));
  const { error } = await supabase.from('tasks').upsert(clean, { onConflict: 'id' }).abortSignal(AbortSignal.timeout(10_000));
  if (error) throw error;
  useStore.getState().markClean([{ t: 'tasks', id, updated_at: row.updated_at }]);
}

async function notifyStart(rest: Rest) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification('Descanso iniciado', {
    body: `${rest.exercise} · ${rest.total}s. Aviso ao terminar.`,
    icon: '/icon-192.png', tag: `pucs-rest-${rest.id}`, data: { url: `/treino?data=${rest.date}` },
  });
}

/** Troca com o SW para deduplicar o alarme local e o push do servidor. */
async function workerMessage(action: string, rest: Rest): Promise<boolean | null> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const worker = reg?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data?.claimed === true);
    };
    worker.postMessage({ action, id: rest.id, endsAt: rest.endsAt, exercise: rest.exercise, date: rest.date, show: 'Notification' in window && Notification.permission === 'granted' }, [channel.port2]);
  });
}

function scheduleRemote(rest: Rest) {
  if (pending.has(rest.id)) return;
  pending.add(rest.id);
  queue = queue.catch(() => {}).then(async () => {
    if (useRest.getState().rest?.id !== rest.id) return;
    useStore.getState().put('tasks', restReminder(rest));
    try {
      await persistReminder(rest.id);
      const current = useRest.getState().rest;
      if (current?.id === rest.id) useRest.setState({ rest: { ...current, remote: true } });
    } catch {
      // A fila offline existente guarda a alteração até voltar a conexão.
      const current = useRest.getState().rest;
      if (current?.id === rest.id) useRest.setState({ rest: { ...current, remote: false } });
    }
  }).finally(() => pending.delete(rest.id));
}

function retireReminder(id: string) {
  const key = `${id}:retire`;
  if (pending.has(key)) return queue;
  pending.add(key);
  queue = queue.catch(() => {}).then(async () => {
    const task = useStore.getState().tasks[id];
    if (!task || !isRestReminder(task)) return;
    if (!task.deleted) useStore.getState().remove('tasks', id);
    await persistReminder(id);
  }).catch(() => {}).finally(() => pending.delete(key));
  return queue;
}

export function startRest(seconds: number, date: string, exercise: string) {
  cancelRest();
  const rest: Rest = { id: uid(), endsAt: Date.now() + seconds * 1000, total: seconds, date, exercise, alerted: false, remote: false };
  useRest.setState({ rest });
  toast(`Descanso iniciado: ${seconds}s`);
  void notifyStart(rest).catch(() => {});
  scheduleRemote(rest);
}

export function cancelRest() {
  const rest = useRest.getState().rest;
  useRest.setState({ rest: null });
  if (rest) {
    void workerMessage('pucs-rest-cancel', rest).catch(() => {});
    return retireReminder(rest.id);
  }
  return queue;
}

export function extendRest() {
  const current = useRest.getState().rest;
  if (!current) return;
  cancelRest();
  const rest = { ...current, id: uid(), endsAt: Math.max(Date.now(), current.endsAt) + 30_000, total: current.total + 30, alerted: false, remote: false };
  useRest.setState({ rest });
  scheduleRemote(rest);
}

export async function finishRest(rest: Rest): Promise<boolean> {
  if (useRest.getState().rest?.id !== rest.id) return false;
  // O aviso local não espera a rede. O SW impede que o cron repita o alarme.
  void retireReminder(rest.id);
  try {
    const claimed = await workerMessage('pucs-rest-finish', rest);
    if (claimed !== null) return claimed;
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.showNotification('Descanso acabou', { body: `${rest.exercise} · hora da próxima série.`, icon: '/icon-192.png', tag: `pucs-rest-${rest.id}`, data: { url: `/treino?data=${rest.date}` } });
    }
  } catch { /* Som e aviso na tela continuam disponíveis. */ }
  return useRest.getState().rest?.id === rest.id;
}

export function resumeRest() {
  const current = useRest.getState().rest;
  if (current && !current.alerted && !current.remote && current.endsAt > Date.now()) scheduleRemote(current);
  for (const task of Object.values(useStore.getState().tasks)) {
    if (!isRestReminder(task)) continue;
    if (task.deleted && useStore.getState().dirty[`tasks:${task.id}`]) void retireReminder(task.id);
    else if (!task.deleted && task.reminder_at && Date.parse(task.reminder_at) < Date.now() - 135_000) void retireReminder(task.id);
  }
}

import { addDays, fromISO, today, toISO, weekday, WEEKDAYS_SHORT } from './dates';

/**
 * Regras: daily | weekdays | weekly:1,4 (dias da semana, 0 = domingo) | monthly:15 | yearly | every:3
 */
export function stepOnce(rule: string, from: string): string {
  const [kind, arg] = rule.split(':');
  switch (kind) {
    case 'daily':
      return addDays(from, 1);
    case 'every':
      return addDays(from, Math.max(1, Number(arg) || 1));
    case 'weekdays': {
      let d = addDays(from, 1);
      while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
      return d;
    }
    case 'weekly': {
      const days = (arg ?? String(weekday(from))).split(',').map(Number);
      let d = addDays(from, 1);
      for (let i = 0; i < 7 && !days.includes(weekday(d)); i++) d = addDays(d, 1);
      return d;
    }
    case 'monthly': {
      const day = Number(arg) || fromISO(from).getDate();
      const f = fromISO(from);
      const cand = new Date(f.getFullYear(), f.getMonth() + 1, 1);
      const last = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate();
      cand.setDate(Math.min(day, last));
      return toISO(cand);
    }
    case 'yearly': {
      const f = fromISO(from);
      return toISO(new Date(f.getFullYear() + 1, f.getMonth(), f.getDate()));
    }
    default:
      return addDays(from, 1);
  }
}

/** Próxima data depois de concluir: sempre depois de hoje e depois do vencimento atual. */
export function nextOccurrence(rule: string, due: string | null): string {
  const t = today();
  const base = due && due > t ? due : t;
  return stepOnce(rule, base);
}

/** Primeira ocorrência a partir de hoje (inclusive). */
export function firstOccurrence(rule: string): string {
  const t = today();
  const [kind, arg] = rule.split(':');
  if (kind === 'weekdays' && weekday(t) !== 0 && weekday(t) !== 6) return t;
  if (kind === 'weekly') {
    const days = (arg ?? '').split(',').map(Number);
    if (days.includes(weekday(t))) return t;
  }
  if (kind === 'monthly' && Number(arg) === fromISO(t).getDate()) return t;
  if (kind === 'monthly' && Number(arg) > fromISO(t).getDate()) {
    const f = fromISO(t);
    const last = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
    return toISO(new Date(f.getFullYear(), f.getMonth(), Math.min(Number(arg), last)));
  }
  if (kind === 'daily' || kind === 'every' || kind === 'yearly') return t;
  return stepOnce(rule, t);
}

export function recurrenceLabel(rule: string | null): string {
  if (!rule) return '';
  const [kind, arg] = rule.split(':');
  switch (kind) {
    case 'daily':
      return 'Todo dia';
    case 'weekdays':
      return 'Dias úteis';
    case 'every':
      return `A cada ${arg} dias`;
    case 'weekly': {
      const days = (arg ?? '').split(',').filter(Boolean).map((d) => WEEKDAYS_SHORT[Number(d)]);
      return days.length ? `Toda ${days.join(', ')}` : 'Toda semana';
    }
    case 'monthly':
      return `Todo dia ${arg}`;
    case 'yearly':
      return 'Todo ano';
    default:
      return rule;
  }
}

export const RECURRENCE_PRESETS: { label: string; rule: (due: string) => string | null }[] = [
  { label: 'Não repetir', rule: () => null },
  { label: 'Todo dia', rule: () => 'daily' },
  { label: 'Dias úteis', rule: () => 'weekdays' },
  { label: 'Toda semana', rule: (due) => `weekly:${weekday(due)}` },
  { label: 'Todo mês', rule: (due) => `monthly:${fromISO(due).getDate()}` },
  { label: 'Todo ano', rule: () => 'yearly' },
];

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

export function weekday(iso: string): number {
  return fromISO(iso).getDay();
}

/** Segunda-feira da semana de `iso`. */
export function startOfWeek(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function labelDate(iso: string, base = today()): string {
  const diff = diffDays(iso, base);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const d = fromISO(iso);
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()].replace(/^./, (c) => c.toUpperCase());
  const sameYear = d.getFullYear() === fromISO(base).getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function longDate(iso: string): string {
  const d = fromISO(iso);
  const s = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return s[0].toUpperCase() + s.slice(1);
}

export function dateTone(iso: string | null): 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' {
  if (!iso) return 'none';
  const diff = diffDays(iso, today());
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${pad(m)}min` : `${h}h`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Matriz do mês (semanas começando na segunda). */
export function monthMatrix(year: number, month: number): string[][] {
  const first = toISO(new Date(year, month, 1));
  let cursor = startOfWeek(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
    if (fromISO(cursor).getMonth() !== month && w >= 3) break;
  }
  return weeks;
}

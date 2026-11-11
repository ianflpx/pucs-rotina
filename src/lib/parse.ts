import { addDays, fromISO, startOfWeek, today, toISO, weekday } from './dates';
import { firstOccurrence } from './recurrence';
import type { Priority } from './types';

export type TokenKind = 'date' | 'time' | 'priority' | 'project' | 'label' | 'recurrence';

export interface Token {
  start: number;
  end: number;
  kind: TokenKind;
}

export interface Parsed {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority | null;
  project: string | null;
  labels: string[];
  recurrence: string | null;
  tokens: Token[];
}

const COMBINING = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

export function fold(s: string): string {
  return s.normalize('NFD').replace(COMBINING, '').toLowerCase();
}

const LETTERS = 'A-Za-z0-9À-ÖØ-öø-ÿ_';
const B = `(?<![${LETTERS}])`;
const E = `(?![${LETTERS}])`;
const rx = (body: string) => new RegExp(`${B}(?:${body})${E}`, 'gi');

const WD = 'segunda(?:-feira)?|seg|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado|domingo';
const MONTHS = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';

function wdIndex(word: string): number {
  const w = fold(word);
  if (w.startsWith('seg')) return 1;
  if (w.startsWith('ter')) return 2;
  if (w.startsWith('qua')) return 3;
  if (w.startsWith('qui')) return 4;
  if (w.startsWith('sex')) return 5;
  if (w.startsWith('sab')) return 6;
  return 0;
}

function monthIndex(word: string): number {
  const w = fold(word).slice(0, 3);
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(w);
}

function nextWeekday(wd: number, strict: boolean): string {
  let d = today();
  if (strict) d = addDays(d, 1);
  for (let i = 0; i < 7 && weekday(d) !== wd; i++) d = addDays(d, 1);
  return d;
}

function safeDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m, d);
  if (dt.getMonth() !== m || dt.getDate() !== d) return null;
  return toISO(dt);
}

function futureDate(m: number, d: number, y?: number): string | null {
  const t = fromISO(today());
  if (y !== undefined) return safeDate(y < 100 ? 2000 + y : y, m, d);
  const iso = safeDate(t.getFullYear(), m, d);
  if (iso && iso < today()) return safeDate(t.getFullYear() + 1, m, d);
  return iso;
}

type Handler = (m: RegExpExecArray) => string | null;

const RECURRENCE: [RegExp, Handler][] = [
  [rx('(?:todos os |todo )?dias [úu]teis|todo dia [úu]til'), () => 'weekdays'],
  [rx('a cada (\\d{1,3}) dias'), (m) => `every:${m[1]}`],
  [rx('todo dia (\\d{1,2})(?![\\d:h])'), (m) => (Number(m[1]) >= 1 && Number(m[1]) <= 31 ? `monthly:${Number(m[1])}` : null)],
  [rx('todos os dias|todo dia|diariamente'), () => 'daily'],
  [
    rx(`(?:toda|todo|todas as|todos os) (?:${WD})s?(?:\\s*(?:,|e)\\s*(?:${WD})s?)*`),
    (m) => {
      const words = m[0].match(new RegExp(WD, 'gi')) ?? [];
      const days = [...new Set(words.map(wdIndex))].sort();
      return `weekly:${days.join(',')}`;
    },
  ],
  [rx('toda semana|semanalmente'), () => 'weekly:'],
  [rx('todo m[êe]s|mensalmente'), () => 'monthly:'],
  [rx('todo ano|anualmente'), () => 'yearly'],
];

const DATES: [RegExp, Handler][] = [
  [rx('depois de amanh[ãa]'), () => addDays(today(), 2)],
  [rx('hoje|hj'), () => today()],
  [rx('amanh[ãa]|amn'), () => addDays(today(), 1)],
  [rx('pr[óo]xima semana|semana que vem'), () => addDays(startOfWeek(today()), 7)],
  [rx('(?:no |neste |nesse )?fim de semana|fds'), () => nextWeekday(6, false)],
  [rx('em (\\d{1,3}) dias?'), (m) => addDays(today(), Number(m[1]))],
  [
    rx('(?:dia )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?'),
    (m) => futureDate(Number(m[2]) - 1, Number(m[1]), m[3] ? Number(m[3]) : undefined),
  ],
  [rx(`(?:dia )?(\\d{1,2}) de (${MONTHS})`), (m) => futureDate(monthIndex(m[2]), Number(m[1]))],
  [
    rx('dia (\\d{1,2})(?![\\d:h/])'),
    (m) => {
      const t = fromISO(today());
      const day = Number(m[1]);
      return futureDate(t.getMonth(), day) ?? futureDate(t.getMonth() + 1, day);
    },
  ],
  [rx(`pr[óo]xim[ao] (${WD})`), (m) => nextWeekday(wdIndex(m[1]), true)],
  [rx(`(?:na |no |nesta |neste )?(${WD})`), (m) => nextWeekday(wdIndex(m[1]), false)],
];

const TIMES: [RegExp, Handler][] = [
  [rx('(?:[àa]s )?(\\d{1,2}):(\\d{2})'), (m) => hm(m[1], m[2])],
  [rx('(?:[àa]s )?(\\d{1,2})h(\\d{2})?'), (m) => hm(m[1], m[2] ?? '0')],
  [rx('[àa]s (\\d{1,2})'), (m) => hm(m[1], '0')],
];

function hm(h: string, m: string): string | null {
  const H = Number(h);
  const M = Number(m);
  if (H > 23 || M > 59) return null;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

export function parseQuick(input: string): Parsed {
  const taken = new Array(input.length).fill(false);
  const tokens: Token[] = [];
  const free = (s: number, e: number) => !taken.slice(s, e).some(Boolean);
  const take = (s: number, e: number, kind: TokenKind) => {
    for (let i = s; i < e; i++) taken[i] = true;
    tokens.push({ start: s, end: e, kind });
  };

  const first = (rules: [RegExp, Handler][], kind: TokenKind): string | null => {
    for (const [re, fn] of rules) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(input))) {
        const s = m.index;
        const e = s + m[0].length;
        if (!free(s, e)) continue;
        const v = fn(m);
        if (v === null) continue;
        take(s, e, kind);
        return v;
      }
    }
    return null;
  };

  let recurrence = first(RECURRENCE, 'recurrence');
  let due_date = first(DATES, 'date');
  const due_time = first(TIMES, 'time');

  let priority: Priority | null = null;
  const pm = rx('p([1-4])');
  let m: RegExpExecArray | null;
  while ((m = pm.exec(input))) {
    if (free(m.index, m.index + m[0].length)) {
      priority = Number(m[1]) as Priority;
      take(m.index, m.index + m[0].length, 'priority');
      break;
    }
  }

  let project: string | null = null;
  const prj = /#([^\s#@]+)/g;
  while ((m = prj.exec(input))) {
    if (free(m.index, m.index + m[0].length)) {
      project = m[1];
      take(m.index, m.index + m[0].length, 'project');
      break;
    }
  }

  const labels: string[] = [];
  const lbl = /@([^\s#@]+)/g;
  while ((m = lbl.exec(input))) {
    if (free(m.index, m.index + m[0].length)) {
      labels.push(m[1]);
      take(m.index, m.index + m[0].length, 'label');
    }
  }

  if (recurrence) {
    const base = due_date ?? null;
    if (recurrence === 'weekly:') recurrence = `weekly:${weekday(base ?? today())}`;
    if (recurrence === 'monthly:') recurrence = `monthly:${fromISO(base ?? today()).getDate()}`;
    if (!due_date) due_date = firstOccurrence(recurrence);
  }
  if (due_time && !due_date) due_date = today();

  let title = '';
  for (let i = 0; i < input.length; i++) title += taken[i] ? ' ' : input[i];
  title = title.replace(/\s+/g, ' ').trim();

  tokens.sort((a, b) => a.start - b.start);
  return { title, due_date, due_time, priority, project, labels, recurrence, tokens };
}

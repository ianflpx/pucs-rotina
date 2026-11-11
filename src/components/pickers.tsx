import { Bell, BellOff, CalendarDays, CalendarX, ChevronLeft, ChevronRight, Flag, Hash, Inbox, Repeat, Sofa, Sun, SunMedium, Tag, Check } from 'lucide-react';
import { useState } from 'react';
import { addDays, fromISO, labelDate, MONTHS, monthMatrix, startOfWeek, today, weekday, WEEKDAYS_SHORT } from '../lib/dates';
import { PRIORITY_COLORS } from '../lib/actions';
import { RECURRENCE_PRESETS, recurrenceLabel } from '../lib/recurrence';
import { useRows } from '../lib/store';
import type { Priority } from '../lib/types';

export interface DueValue {
  due_date: string | null;
  due_time: string | null;
  recurrence: string | null;
}

export function DateMenu({ value, onChange, onDone }: { value: DueValue; onChange: (v: DueValue) => void; onDone: () => void }) {
  const t = today();
  const base = value.due_date ?? t;
  const [view, setView] = useState({ y: fromISO(base).getFullYear(), m: fromISO(base).getMonth() });
  const weeks = monthMatrix(view.y, view.m);
  const set = (d: string | null) => {
    onChange({ ...value, due_date: d, ...(d ? {} : { due_time: null, recurrence: null }) });
    onDone();
  };
  const quick = [
    { label: 'Hoje', icon: <Sun size={15} color="#ffa36b" />, d: t },
    { label: 'Amanhã', icon: <SunMedium size={15} color="#ffa53b" />, d: addDays(t, 1) },
    { label: 'Fim de semana', icon: <Sofa size={15} color="#d4d4dc" />, d: addDays(t, (6 - weekday(t) + 7) % 7 || 7) },
    { label: 'Próxima semana', icon: <CalendarDays size={15} color="#ffb38a" />, d: addDays(startOfWeek(t), 7) },
  ];
  return (
    <div style={{ width: 268 }}>
      {quick.map((q) => (
        <button key={q.label} className="menu-item" onClick={() => set(q.d)}>
          {q.icon} {q.label}
          <span className="hint">{WEEKDAYS_SHORT[weekday(q.d)]}</span>
        </button>
      ))}
      {value.due_date && (
        <button className="menu-item" onClick={() => set(null)}>
          <CalendarX size={15} /> Sem data
        </button>
      )}
      <div className="menu-sep" />
      <div className="mini-cal">
        <div className="head">
          <span style={{ textTransform: 'capitalize' }}>
            {MONTHS[view.m]} {view.y}
          </span>
          <span className="row" style={{ gap: 2 }}>
            <button className="icon-btn sm" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }))}>
              <ChevronLeft size={15} />
            </button>
            <button className="icon-btn sm" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }))}>
              <ChevronRight size={15} />
            </button>
          </span>
        </div>
        <div className="wk">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {weeks.flat().map((d) => (
            <button
              key={d}
              className={`${fromISO(d).getMonth() !== view.m ? 'out' : ''} ${d === t ? 'today' : ''} ${d === value.due_date ? 'sel' : ''}`}
              onClick={() => set(d)}
            >
              {fromISO(d).getDate()}
            </button>
          ))}
        </div>
      </div>
      <div className="menu-sep" />
      <div className="row" style={{ padding: '4px 6px 6px', gap: 8 }}>
        <input
          type="time"
          className="input"
          style={{ height: 34, padding: '0 10px' }}
          value={value.due_time ?? ''}
          onChange={(e) => onChange({ ...value, due_date: value.due_date ?? t, due_time: e.target.value || null })}
        />
        <select
          className="select"
          style={{ height: 34, padding: '0 10px' }}
          value={RECURRENCE_PRESETS.findIndex((p) => p.rule(value.due_date ?? t) === value.recurrence)}
          onChange={(e) => {
            const p = RECURRENCE_PRESETS[Number(e.target.value)];
            onChange({ ...value, due_date: value.due_date ?? t, recurrence: p ? p.rule(value.due_date ?? t) : value.recurrence });
          }}
        >
          {value.recurrence && RECURRENCE_PRESETS.every((p) => p.rule(value.due_date ?? t) !== value.recurrence) && (
            <option value={-1}>{recurrenceLabel(value.recurrence)}</option>
          )}
          {RECURRENCE_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PriorityMenu({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div style={{ width: 200 }}>
      {([1, 2, 3, 4] as Priority[]).map((p) => (
        <button key={p} className={`menu-item ${p === value ? 'sel' : ''}`} onClick={() => onChange(p)}>
          <Flag size={15} color={PRIORITY_COLORS[p]} fill={p < 4 ? PRIORITY_COLORS[p] : 'none'} /> Prioridade {p}
          {p === value && <Check size={14} style={{ marginLeft: 'auto' }} />}
        </button>
      ))}
    </div>
  );
}

export function ProjectMenu({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const projects = useRows('projects').sort((a, b) => a.sort - b.sort);
  return (
    <div style={{ width: 230 }}>
      <button className={`menu-item ${value === null ? 'sel' : ''}`} onClick={() => onChange(null)}>
        <Inbox size={15} /> Entrada
      </button>
      {projects.map((p) => (
        <button key={p.id} className={`menu-item ${p.id === value ? 'sel' : ''}`} onClick={() => onChange(p.id)}>
          <Hash size={15} color={p.color} /> {p.name}
        </button>
      ))}
    </div>
  );
}

export function LabelMenu({ value, onChange }: { value: string[]; onChange: (l: string[]) => void }) {
  const labels = useRows('labels');
  const [q, setQ] = useState('');
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const clean = q.trim().replace(/\s+/g, '-');
  return (
    <div style={{ width: 230 }}>
      <input className="input" style={{ height: 34, marginBottom: 6 }} placeholder="Buscar ou criar etiqueta" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      {labels
        .filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
        .map((l) => (
          <button key={l.id} className="menu-item" onClick={() => toggle(l.name)}>
            <Tag size={14} color={l.color} /> {l.name}
            {value.includes(l.name) && <Check size={14} style={{ marginLeft: 'auto' }} />}
          </button>
        ))}
      {clean && !labels.some((l) => l.name.toLowerCase() === clean.toLowerCase()) && (
        <button className="menu-item" onClick={() => { toggle(clean); setQ(''); }}>
          <Tag size={14} /> Criar "{clean}"
        </button>
      )}
    </div>
  );
}

export function dueSummary(v: DueValue): string {
  if (!v.due_date) return 'Data';
  return `${labelDate(v.due_date)}${v.due_time ? ` ${v.due_time}` : ''}`;
}

export function RepeatIcon() {
  return <Repeat size={12} />;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function reminderLabel(iso: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${labelDate(day)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Lembrete da tarefa: atalhos relativos ao horário dela ou data/hora livre. */
export function ReminderMenu({
  task,
  onChange,
  onDone,
}: {
  task: { due_date: string | null; due_time: string | null; reminder_at?: string | null };
  onChange: (iso: string | null) => void;
  onDone: () => void;
}) {
  const set = (d: Date | null) => {
    onChange(d ? d.toISOString() : null);
    onDone();
  };
  const due = task.due_date && task.due_time ? new Date(`${task.due_date}T${task.due_time}:00`) : null;
  const rel: [string, number][] = [
    ['Na hora', 0],
    ['10 min antes', 10],
    ['30 min antes', 30],
    ['1 h antes', 60],
    ['1 dia antes', 1440],
  ];
  const current = task.reminder_at ? new Date(task.reminder_at) : null;
  const local = current
    ? `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}T${pad2(current.getHours())}:${pad2(current.getMinutes())}`
    : task.due_date
      ? `${task.due_date}T${task.due_time ?? '09:00'}`
      : '';
  return (
    <div style={{ width: 250 }}>
      {due ? (
        rel.map(([label, min]) => (
          <button key={label} className="menu-item" onClick={() => set(new Date(due.getTime() - min * 60000))}>
            <Bell size={14} /> {label}
            <span className="hint">{reminderLabel(new Date(due.getTime() - min * 60000).toISOString()).split(' ').pop()}</span>
          </button>
        ))
      ) : (
        <div className="small dim" style={{ padding: '6px 10px' }}>Dê um horário à tarefa para usar os atalhos.</div>
      )}
      <div className="menu-sep" />
      <div style={{ padding: '4px 6px 6px' }}>
        <input
          type="datetime-local"
          className="input"
          style={{ height: 34 }}
          defaultValue={local}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onBlur={(e) => e.target.value && set(new Date(e.target.value))}
        />
      </div>
      {task.reminder_at && (
        <button className="menu-item" onClick={() => set(null)}>
          <BellOff size={14} /> Tirar lembrete
        </button>
      )}
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Coffee,
  Cross,
  Droplet,
  Dumbbell,
  Flame,
  HandHeart,
  Heart,
  Languages,
  Leaf,
  Moon,
  Music,
  PenLine,
  Pencil,
  Plus,
  Smartphone,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WeekPicker } from '../components/Daily';
import { useShine } from '../components/ui';
import { celebrate, dayLogId, setDayLog, setPrefs, toast } from '../lib/actions';
import { addDays, labelDate, longDate, today } from '../lib/dates';
import { chime, tick } from '../lib/fx';
import { uid } from '../lib/ids';
import { getPrefsRow, usePrefs, useStore } from '../lib/store';
import type { DayLog, Habit } from '../lib/types';

export const HABIT_ICONS: Record<string, LucideIcon> = {
  pen: PenLine,
  cross: Cross,
  book: BookOpen,
  pray: HandHeart,
  heart: Heart,
  sparkles: Sparkles,
  brain: Brain,
  sun: Sun,
  moon: Moon,
  leaf: Leaf,
  water: Droplet,
  gym: Dumbbell,
  music: Music,
  lang: Languages,
  coffee: Coffee,
  phone: Smartphone,
  target: Target,
};

export function HabitIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const I = HABIT_ICONS[icon] ?? Sprout;
  return <I size={size} />;
}

export function useHabits(): Habit[] {
  return usePrefs().habits ?? [];
}

type Logs = Record<string, DayLog>;
const doneOn = (logs: Logs, date: string) => logs[dayLogId(date)]?.habits ?? [];

/** Dias seguidos até hoje (se hoje ainda não foi feito, conta até ontem). */
function streakOf(logs: Logs, id: string) {
  const t = today();
  let d = doneOn(logs, t).includes(id) ? t : addDays(t, -1);
  let n = 0;
  while (doneOn(logs, d).includes(id)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function toggleHabit(date: string, id: string, habits: Habit[]) {
  const logs = useStore.getState().day_logs;
  const cur = doneOn(logs, date);
  const on = cur.includes(id);
  // mantém só ids de hábitos que ainda existem
  const next = on ? cur.filter((x) => x !== id) : [...cur, id];
  setDayLog(date, { habits: next.filter((x) => habits.some((h) => h.id === x)) });
  if (!on) {
    const sound = getPrefsRow().data.sound !== false;
    if (habits.every((h) => next.includes(h.id))) {
      celebrate('big');
      if (sound) chime();
    } else if (sound) tick();
  }
}

/** Fração de hábitos feitos num dia (entra no "% do dia feito" do Painel). */
export function useHabitsProgress(date: string) {
  const habits = useHabits();
  const done = useStore((s) => s.day_logs[dayLogId(date)]?.habits);
  const n = habits.filter((h) => done?.includes(h.id)).length;
  return { done: n, total: habits.length };
}

function HabitCard({ habit, date, logs, habits }: { habit: Habit; date: string; logs: Logs; habits: Habit[] }) {
  const on = doneOn(logs, date).includes(habit.id);
  const streak = streakOf(logs, habit.id);
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(t, -i)).filter((d) => doneOn(logs, d).includes(habit.id)).length;
  const shine = useShine();
  return (
    <motion.div layout className={`glass card habit-card ${on ? 'on' : ''}`} {...shine}>
      <div className="shine" />
      <div className="habit-top">
        <span className="habit-ic"><HabitIcon icon={habit.icon} size={18} /></span>
        <div className="habit-name">
          <b>{habit.name}</b>
          <span className={`habit-streak ${streak ? 'hot' : ''}`}>
            <Flame size={12} /> {streak ? `${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}` : 'comece hoje'}
          </span>
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          className={`habit-check ${on ? 'on' : ''}`}
          aria-pressed={on}
          aria-label={on ? `Desmarcar ${habit.name}` : `Marcar ${habit.name} como feito`}
          onClick={() => toggleHabit(date, habit.id, habits)}
        >
          <AnimatePresence initial={false}>
            {on && (
              <motion.span key="c" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                <Check size={20} strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
      <div className="streak-dots" style={{ marginTop: 16 }}>
        {days.map((d) => (
          <i key={d} className={`${doneOn(logs, d).includes(habit.id) ? 'on' : ''} ${d === t ? 'today' : ''}`} title={labelDate(d)} />
        ))}
      </div>
      <div className="habit-foot small dim">
        <span>Últimos 14 dias</span>
        <span className="tnum">{last30}/30 no mês</span>
      </div>
    </motion.div>
  );
}

function HabitsEditor({ onClose }: { onClose: () => void }) {
  const habits = useHabits();
  const [list, setList] = useState<Habit[]>(habits);
  const [picker, setPicker] = useState<string | null>(null);
  const patch = (id: string, p: Partial<Habit>) => setList((l) => l.map((h) => (h.id === id ? { ...h, ...p } : h)));
  const save = () => {
    setPrefs({ habits: list.map((h) => ({ ...h, name: h.name.trim() })).filter((h) => h.name) });
    toast('Hábitos salvos');
    onClose();
  };
  return (
    <div className="glass card">
      <div className="card-title top">
        <div>
          <h3><Pencil size={15} color="#ff7a4d" /> Editar hábitos</h3>
          <div className="card-sub">Toque no ícone para trocar. O histórico de cada hábito fica guardado.</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-hot btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
      {list.map((h) => (
        <div key={h.id} className="habit-edit">
          <div className="habit-edit-row">
            <button className={`habit-ic btn-ic ${picker === h.id ? 'sel' : ''}`} aria-label="Trocar ícone" onClick={() => setPicker(picker === h.id ? null : h.id)}>
              <HabitIcon icon={h.icon} size={17} />
            </button>
            <input className="input" placeholder="Nome do hábito" value={h.name} onChange={(e) => patch(h.id, { name: e.target.value })} />
            <button className="icon-btn" aria-label="Remover hábito" title="Remover hábito" onClick={() => setList((l) => l.filter((x) => x.id !== h.id))}>
              <Trash2 size={14} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {picker === h.id && (
              <motion.div className="icon-grid" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {Object.keys(HABIT_ICONS).map((k) => (
                  <button key={k} className={`habit-ic btn-ic ${h.icon === k ? 'sel' : ''}`} onClick={() => { patch(h.id, { icon: k }); setPicker(null); }}>
                    <HabitIcon icon={k} size={16} />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
      <button
        className="inline-add"
        onClick={() => {
          const id = uid();
          setList((l) => [...l, { id, name: '', icon: 'sparkles' }]);
          setPicker(null);
        }}
      >
        <span className="plus"><Plus size={15} /></span> Adicionar hábito
      </button>
    </div>
  );
}

export function HabitsPage() {
  const habits = useHabits();
  const logs = useStore((s) => s.day_logs);
  const [date, setDate] = useState(today());
  const [editing, setEditing] = useState(false);
  const doneToday = habits.filter((h) => doneOn(logs, date).includes(h.id)).length;
  const isToday = date === today();
  return (
    <div className="page">
      <div className="page-head">
        <div className="row">
          <div>
            <h1 className="display h1 grad">Hábitos</h1>
            <p>
              {habits.length
                ? `${doneToday} de ${habits.length} feitos ${isToday ? 'hoje' : `em ${longDate(date).toLowerCase()}`}`
                : 'Crie os hábitos que você quer manter todo dia.'}
            </p>
          </div>
          {!editing && (
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar hábitos
            </button>
          )}
        </div>
      </div>
      <div className="stack">
        <WeekPicker
          value={date}
          onChange={setDate}
          done={(d) => habits.length > 0 && habits.every((h) => doneOn(logs, d).includes(h.id))}
          sub={(d) => (habits.length ? `${habits.filter((h) => doneOn(logs, d).includes(h.id)).length}/${habits.length}` : '')}
        />
        {habits.length > 0 && (
          <div className="bar" style={{ height: 4 }}>
            <i style={{ width: `${(doneToday / habits.length) * 100}%` }} />
          </div>
        )}
        {editing ? (
          <HabitsEditor onClose={() => setEditing(false)} />
        ) : habits.length ? (
          <div className="grid grid-3 habit-grid">
            {habits.map((h) => (
              <HabitCard key={h.id} habit={h} date={date} logs={logs} habits={habits} />
            ))}
          </div>
        ) : (
          <div className="glass card">
            <div className="empty" style={{ padding: '40px 10px' }}>
              <div className="orb"><Sprout size={34} color="#fff" strokeWidth={1.6} /></div>
              <h3>Nenhum hábito ainda</h3>
              <button className="btn" style={{ marginTop: 16 }} onClick={() => setEditing(true)}>
                <Plus size={14} /> Criar hábito
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Card do Painel: marcar os hábitos de hoje sem sair da tela. */
export function HabitsMini() {
  const habits = useHabits();
  const t = today();
  const done = useStore((s) => s.day_logs[dayLogId(t)]?.habits) ?? [];
  if (!habits.length) return null;
  const n = habits.filter((h) => done.includes(h.id)).length;
  return (
    <div className="glass card">
      <div className="card-title">
        <h3><Sprout size={16} color="#ff7a4d" /> Hábitos de hoje</h3>
        <Link className="link" to="/habitos"><span className="tnum">{n}/{habits.length}</span> <ArrowRight size={13} /></Link>
      </div>
      <div className="habit-mini">
        {habits.map((h) => {
          const on = done.includes(h.id);
          return (
            <motion.button key={h.id} whileTap={{ scale: 0.96 }} className={`habit-row ${on ? 'on' : ''}`} onClick={() => toggleHabit(t, h.id, habits)}>
              <span className="habit-ic sm"><HabitIcon icon={h.icon} size={14} /></span>
              <span className="habit-row-name">{h.name}</span>
              <span className={`habit-check sm ${on ? 'on' : ''}`}>{on && <Check size={13} strokeWidth={3} />}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

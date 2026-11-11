import { motion } from 'framer-motion';
import { ArrowRight, Check, Dumbbell, Eye, EyeOff, ListChecks, Pencil, Sofa, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDayLog, WaterCard } from '../components/Daily';
import { TaskList } from '../components/TaskItem';
import { CountUp, stagger, useShine } from '../components/ui';
import { celebrate, mealLogId, setDayLog, setWorkoutLog } from '../lib/actions';
import { chime } from '../lib/fx';
import { addDays, durationLabel, greeting, hmToMinutes, labelDate, longDate, today } from '../lib/dates';
import { usePrefs, useRows, useStore } from '../lib/store';
import { FastingCard, useMeals } from './Diet';
import { CardioCard, restWorkout, useSplitFor, useSplitPlan, useWorkoutLog } from './Workout';
import { cashFlow } from '../lib/finance';
import { CategoryIcon } from './Finance';
import { HabitsMini, useHabitsProgress } from './Habits';

function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

function useDayScore() {
  const t = today();
  const tasks = useRows('tasks').filter((x) => !x.parent_id);
  const meals = useMeals();
  const mealLogs = useStore((s) => s.meal_logs);
  const day = useDayLog(t);
  const split = useSplitFor(t);
  const wlog = useWorkoutLog(t);
  const prefs = usePrefs();
  const hab = useHabitsProgress(t);
  return useMemo(() => {
    const pending = tasks.filter((x) => !x.completed_at && x.due_date && x.due_date <= t).length;
    const doneT = tasks.filter((x) => x.completed_at?.slice(0, 10) === t).length;
    const mealsDone = meals.filter((m) => mealLogs[mealLogId(t, m.id)]?.done).length;
    const sets = wlog?.entries.reduce((a, e) => a + e.sets.length, 0) ?? 0;
    const setsDone = wlog?.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) ?? 0;
    const parts: number[] = [
      meals.length ? mealsDone / meals.length : 0,
      Math.min(1, (day?.water_ml ?? 0) / prefs.water_goal),
      pending + doneT ? doneT / (pending + doneT) : 1,
    ];
    // descanso escolhido sai da conta do dia em vez de contar como zero
    if (!day?.cardio_rest || day?.cardio_done) parts.push(day?.cardio_done ? 1 : 0);
    if (hab.total) parts.push(hab.done / hab.total);
    if (split && !(day?.workout_rest && !wlog?.started_at)) parts.push(wlog?.finished_at ? 1 : sets ? (setsDone / sets) * 0.9 : 0);
    return {
      score: parts.reduce((a, b) => a + b, 0) / parts.length,
      pending,
      doneT,
      mealsDone,
      mealsTotal: meals.length,
      cardio: !!day?.cardio_done,
      water: day?.water_ml ?? 0,
      workout: split ? (wlog?.finished_at ? 'feito' : wlog?.started_at ? 'em andamento' : split.name) : 'descanso',
      workoutDone: !!wlog?.finished_at,
    };
  }, [tasks, meals, mealLogs, day, split, wlog, prefs.water_goal, t, hab.done, hab.total]);
}

type Status = 'done' | 'now' | 'late' | 'next' | 'past' | 'rest';
const STATUS_LABEL: Record<Status, string> = { done: 'Feito', now: 'Agora', late: 'Atrasado', next: '', past: 'Feito', rest: 'Descanso' };

function Timeline() {
  const prefs = usePrefs();
  const now = useMinute();
  const t = today();
  const meals = useMeals();
  const mealLogs = useStore((s) => s.meal_logs);
  const day = useDayLog(t);
  const wlog = useWorkoutLog(t);
  const split = useSplitFor(t);
  const blocks = [...prefs.routine].sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time));
  const done = (b: (typeof blocks)[number]) => {
    if (b.kind === 'cardio') return !!day?.cardio_done;
    // dia sem treino na divisão já nasce feito: descanso planejado não é atraso
    if (b.kind === 'workout') return !split || !!wlog?.finished_at;
    if (b.kind === 'meal') {
      const m = meals.find((x) => x.time === b.time) ?? meals.find((x) => x.name === b.label);
      return m ? !!mealLogs[mealLogId(t, m.id)]?.done : false;
    }
    return false;
  };
  const links: Record<string, string> = { cardio: '/treino', workout: '/treino', meal: '/dieta' };
  const starts = blocks.map((b) => hmToMinutes(b.time));
  const n = blocks.length;
  let pos = 0;
  if (n > 1 && now >= starts[0]) {
    const i = starts.reduce((last, st, k) => (st <= now ? k : last), 0);
    const next = starts[i + 1];
    pos = next === undefined ? 1 : (i + Math.min(1, (now - starts[i]) / Math.max(1, next - starts[i]))) / (n - 1);
  }
  return (
    <div className="glass card">
      <div className="card-title">
        <h3>Sua rotina hoje</h3>
        <Link className="icon-btn sm" to="/ajustes" title="Editar rotina" aria-label="Editar rotina">
          <Pencil size={14} />
        </Link>
      </div>
      <div className="routine">
        {n > 1 && (
          <div className="rt-line" style={{ top: `${50 / n}%`, height: `${(100 * (n - 1)) / n}%` }}>
            <motion.i initial={{ height: 0 }} animate={{ height: `${pos * 100}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        )}
        {blocks.map((b, i) => {
          const start = hmToMinutes(b.time);
          const end = start + b.minutes;
          const trackable = !!links[b.kind];
          const resting = (b.kind === 'cardio' && !!day?.cardio_rest) || (b.kind === 'workout' && !!day?.workout_rest && !wlog?.started_at);
          const status: Status = done(b)
            ? 'done'
            : resting
              ? 'rest'
            : now >= start && now < end
              ? 'now'
              : now >= end
                ? trackable
                  ? 'late'
                  : 'past'
                : 'next';
          const label = b.kind === 'workout' ? (split ? `Treino · ${split.name}` : 'Descanso do treino') : b.label;
          const row = (
            <>
              <span className="rt-time">{b.time}</span>
              <span className={`rt-dot ${status}`} />
              <span className="rt-main">
                <span className="rt-label">{label}</span>
                <span className="rt-sub">{durationLabel(b.minutes)}</span>
              </span>
              {status === 'next' ? <span /> : <span className={`st-tag ${status}`}>{STATUS_LABEL[status]}</span>}
            </>
          );
          return (
            <motion.div key={b.id} {...stagger(i)}>
              {trackable ? (
                <Link to={links[b.kind]} className={`rt-row ${status}`}>
                  {row}
                </Link>
              ) : (
                <div className={`rt-row ${status}`}>{row}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function WorkoutToday() {
  const t = today();
  const plan = useSplitPlan(t);
  const split = plan(t);
  const nextDay = Array.from({ length: 7 }, (_, i) => addDays(t, i + 1)).find((d) => plan(d));
  const nextSplit = nextDay ? plan(nextDay) : undefined;
  const wlog = useWorkoutLog(t);
  const day = useDayLog(t);
  const resting = !!day?.workout_rest && !wlog?.started_at;
  const prefs = usePrefs();
  const shine = useShine();
  return (
    <div className="glass card" {...shine}>
      <div className="shine" />
      <div className="card-title">
        <h3><Dumbbell size={16} color="#ff7a4d" /> Treino de hoje</h3>
        <Link className="link" to="/treino">abrir <ArrowRight size={13} /></Link>
      </div>
      {split ? (
        <div className="row act-row" style={{ gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`display ${resting ? 'rest-title' : wlog?.finished_at ? 'grad-ok' : 'grad-hot'}`} style={{ fontSize: 26 }}>{resting ? 'Descanso' : split.name}</div>
            <div className="small muted">
              {resting ? `${split.name} passa para o próximo dia` :`${split.exercises.length} exercícios · ${split.exercises.reduce((a, e) => a + e.sets, 0)} séries`}
            </div>
          </div>
          {resting ? (
            <motion.button whileTap={{ scale: 0.95 }} className="btn" title="Desfazer descanso" onClick={() => setDayLog(t, { workout_rest: false })}>
              <Sofa size={15} /> Descanso
            </motion.button>
          ) : wlog?.finished_at ? (
            // feito fica cinza; clicar de novo desmarca
            <motion.button whileTap={{ scale: 0.95 }} className="btn" title="Desmarcar treino" onClick={() => setWorkoutLog(t, { finished_at: null })}>
              <Check size={15} /> Feito
            </motion.button>
          ) : (
            <div className="act-btns">
            <motion.button whileTap={{ scale: 0.95 }} className="btn btn-sm btn-ghost rest-btn" onClick={() => restWorkout(t)}>
              <Sofa size={15} /> Descanso
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="btn btn-hot"
              onClick={() => {
                const now = new Date().toISOString();
                setWorkoutLog(t, { split_id: split.id, name: split.name, started_at: wlog?.started_at ?? now, finished_at: now });
                celebrate('small');
                if (prefs.sound) chime();
              }}
            >
              <Check size={15} /> Marcar como feito
            </motion.button>
            </div>
          )}
        </div>
      ) : (
        <div className="muted">
          Descanso.{nextSplit && nextDay ? ` Próximo: ${nextSplit.name}, ${labelDate(nextDay, t).toLowerCase()}.` : ''}
        </div>
      )}
    </div>
  );
}

function FinanceMini() {
  const txs = useRows('transactions');
  // valores borrados por padrão no Painel; o olho mostra até sair da tela
  const [show, setShow] = useState(false);
  if (!txs.length) return null;
  const month = today().slice(0, 7);
  // mesma conta do "Sobrou no caixa" do Financeiro: fatura conta quando é paga
  const inM = txs.filter((t) => t.date.startsWith(month) && !t.oneoff);
  const { cash: result } = cashFlow(txs, `${month}-01`, `${month}-31`);
  const byCat: Record<string, number> = {};
  // líquido por categoria: devolução marcada numa categoria abate dela
  for (const t of inM)
    if (['expense', 'fee'].includes(t.kind) || (t.kind === 'refund' && t.category !== 'Reembolsos'))
      byCat[t.category] = (byCat[t.category] ?? 0) - t.amount;
  const [topCat, topVal] = Object.entries(byCat).sort((x, y) => y[1] - x[1])[0] ?? ['', 0];
  const neg = result < 0;
  return (
    <div className="glass card">
      <div className="card-title">
        <Link to="/financeiro">
          <h3><Wallet size={16} color={show ? (neg ? '#ff8f8f' : '#5fd3a0') : '#ff7a4d'} /> Sobrou no mês</h3>
        </Link>
        <button className="icon-btn sm" aria-pressed={show} aria-label={show ? 'Esconder valores' : 'Mostrar valores'} title={show ? 'Esconder valores' : 'Mostrar valores'} onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <div className={`display ${neg ? 'grad-neg' : 'grad-pos'} money ${show ? '' : 'hidden-val'}`} style={{ fontSize: 28 }} aria-hidden={!show}>
        {neg ? '−' : '+'}R$ <CountUp value={Math.abs(Math.round(result))} />
      </div>
      {topCat && (
        <div className="row small" style={{ gap: 8, marginTop: 8 }}>
          <span className="cat-ic" style={{ marginRight: 0 }}>
            <CategoryIcon name={topCat} size={13} />
          </span>
          <span className="muted">Maior gasto:</span>
          <span style={{ fontWeight: 600 }}>{topCat}</span>
          <span className={`tnum muted money ${show ? '' : 'hidden-val'}`} style={{ marginLeft: 'auto' }} aria-hidden={!show}>R$ {Math.round(topVal).toLocaleString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  const prefs = usePrefs();
  const s = useDayScore();
  const t = today();
  const tasks = useRows('tasks').filter((x) => !x.parent_id && !x.completed_at && x.due_date && x.due_date <= t);
  return (
    <div className="page wide">
      <motion.div className="hero" {...fadeIn}>
        <div className="hero-row">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{longDate(t)}</div>
            <h1 className="display h1 grad" style={{ margin: '8px 0 0' }}>
              {greeting()}{prefs.name ? `, ${prefs.name}` : ''}.
            </h1>
          </div>
          <div className="hero-score">
            <span className="display grad-hot tnum">
              <CountUp value={Math.round(s.score * 100)} suffix="%" />
            </span>
            <span className="small muted">do dia feito</span>
          </div>
        </div>
        <div className="bar" style={{ height: 4, marginTop: 20 }}>
          <i style={{ width: `${s.score * 100}%` }} />
        </div>
      </motion.div>

      <div className="grid grid-12">
        <div className="span-7 stack">
          <div className="glass card">
            <div className="card-title">
              <h3><ListChecks size={16} color="#ffb38a" /> Tarefas de hoje</h3>
              <Link className="link" to="/hoje">ver tudo <ArrowRight size={13} /></Link>
            </div>
            <TaskList tasks={tasks} addDefaults={{ due_date: t }} emptyHint="Nada pendente para hoje." />
          </div>
          <Timeline />
        </div>
        <div className="span-5 stack">
          <WorkoutToday />
          <CardioCard />
          <HabitsMini />
          <FastingCard compact />
          <WaterCard />
          <FinanceMini />
        </div>
      </div>
    </div>
  );
}

const fadeIn = {
  initial: { opacity: 0, y: 16, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

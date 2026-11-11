import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Beef, Check, Cherry, Droplet, LeafyGreen, Moon, Timer, Wheat, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WaterCard, WeekPicker } from '../components/Daily';
import { Popover, stagger, useAnchor, useShine, CountUp } from '../components/ui';
import { celebrate, mealLogId, setMealLog } from '../lib/actions';
import { DIET_SOURCE, MEAL_MACROS } from '../data/seed';
import { addDays, durationLabel, hmToMinutes, labelDate, longDate, today } from '../lib/dates';
import { chime } from '../lib/fx';
import { usePrefs, useRows, useStore } from '../lib/store';
import type { Meal, MealItem, MealLog } from '../lib/types';

const ICONS: Record<string, { icon: typeof Beef; color: string; bg: string }> = {
  prot: { icon: Beef, color: '#ff7a4d', bg: 'rgba(255,106,61,0.12)' },
  fat: { icon: Droplet, color: '#ffd1a6', bg: 'rgba(255,209,166,0.1)' },
  carb: { icon: Wheat, color: '#ffb38a', bg: 'rgba(255, 122, 77,0.13)' },
  veg: { icon: LeafyGreen, color: '#ffa36b', bg: 'rgba(255, 122, 77,0.1)' },
};

export function useMeals() {
  return useRows('meals').sort((a, b) => a.sort - b.sort);
}

export function useMealLogs(date: string) {
  const logs = useStore((s) => s.meal_logs);
  return (mealId: string): MealLog | undefined => {
    const l = logs[mealLogId(date, mealId)];
    return l && !l.deleted ? l : undefined;
  };
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

/** Janela de jejum: do fim da última refeição até a primeira do dia seguinte. */
export function useFasting() {
  const meals = useMeals();
  const now = useNow();
  const logs = useStore((s) => s.meal_logs);
  if (!meals.length) return null;
  const first = hmToMinutes(meals[0].time);
  const last = meals[meals.length - 1];
  const lastEnd = hmToMinutes(last.time) + 30;
  const t = today();
  const mins = now.getHours() * 60 + now.getMinutes();
  const fasting = mins < first || mins >= lastEnd;
  const dayOfLast = mins < first ? addDays(t, -1) : t;
  const lastLog = logs[mealLogId(dayOfLast, last.id)];
  const startAt = lastLog?.done_at ? new Date(lastLog.done_at) : (() => {
    const d = new Date(`${dayOfLast}T00:00:00`);
    d.setMinutes(lastEnd);
    return d;
  })();
  const endAt = new Date(`${mins < first ? t : addDays(t, 1)}T00:00:00`);
  endAt.setMinutes(first);
  const elapsed = Math.max(0, (now.getTime() - startAt.getTime()) / 60000);
  const total = Math.max(1, (endAt.getTime() - startAt.getTime()) / 60000);
  const nextMeal = meals.find((m) => hmToMinutes(m.time) > mins);
  return {
    fasting,
    elapsed,
    total,
    remaining: Math.max(0, total - elapsed),
    nextMeal,
    nextIn: nextMeal ? hmToMinutes(nextMeal.time) - mins : first + 1440 - mins,
  };
}

export function FastingCard({ compact }: { compact?: boolean }) {
  const f = useFasting();
  const shine = useShine();
  if (!f) return null;
  const title = f.fasting ? `Faltam ${durationLabel(f.remaining)}` : f.nextMeal ? `${f.nextMeal.name} em ${durationLabel(f.nextIn)}` : 'Última refeição feita';
  return (
    <div className="glass card" {...shine} style={compact ? { padding: '14px 18px' } : undefined}>
      <div className="shine" />
      <div className="eyebrow">
        {f.fasting ? <Moon size={13} /> : <Timer size={13} />} {f.fasting ? `Em jejum há ${durationLabel(f.elapsed)}` : 'Janela de alimentação'}
      </div>
      <h3 className={`display ${f.fasting ? 'grad-hot' : 'grad-ok'}`} style={{ fontSize: compact ? 20 : 26, margin: compact ? '4px 0 0' : '6px 0 4px' }}>
        {title}
      </h3>
      {!compact && (
        <div className="small muted">
          {f.fasting
            ? `Jejum de ${durationLabel(f.total)} até o almoço. Cardio da manhã em jejum.`
            : 'Siga o plano à risca: proteína primeiro, vegetais à vontade.'}
        </div>
      )}
      {f.fasting && (
        <div className="bar" style={{ height: 4, marginTop: compact ? 10 : 14 }}>
          <i style={{ width: `${(f.elapsed / f.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function FoodRow({ item, choice, onChoose }: { item: MealItem; choice: number | undefined; onChoose: (i: number | undefined) => void }) {
  const a = useAnchor<HTMLButtonElement>();
  const I = ICONS[item.id] ?? ICONS.veg;
  const current = choice !== undefined && item.subs[choice] ? item.subs[choice] : { name: item.name, qty: item.qty };
  return (
    <>
      <button ref={a.ref} className="food" onClick={() => item.subs.length && a.toggle()} style={{ cursor: item.subs.length ? 'pointer' : 'default' }}>
        <span className="ic" style={{ background: I.bg }}>
          <I.icon size={17} color={I.color} />
        </span>
        <span style={{ minWidth: 0 }}>
          <div className="nm">{current.name}</div>
          {item.subs.length > 0 && (
            <div className="swap">
              {choice !== undefined ? `trocado · original: ${item.name}` : `${item.subs.length} opções de troca`}
            </div>
          )}
        </span>
        <span className="qty">{current.qty}</span>
        {item.subs.length > 0 && <ArrowLeftRight size={14} className="dim" />}
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={320}>
        <div className="small dim" style={{ padding: '6px 10px 4px' }}>Trocar {item.name.toLowerCase()} por</div>
        <div className="sub-list" style={{ padding: 0 }}>
          {[{ name: item.name, qty: item.qty }, ...item.subs].map((o, i) => {
            const idx = i === 0 ? undefined : i - 1;
            const sel = idx === choice;
            return (
              <button key={i} className={`menu-item ${sel ? 'sel' : ''}`} onClick={() => { onChoose(idx); a.close(); }}>
                {sel ? <Check size={14} color="#ffa36b" /> : <span style={{ width: 14 }} />}
                {o.name}
                <span className="hint" style={{ color: '#d6d6e2', fontWeight: 600 }}>{o.qty}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

function MealCard({ meal, date, index }: { meal: Meal; date: string; index: number }) {
  const getLog = useMealLogs(date);
  const log = getLog(meal.id);
  const prefs = usePrefs();
  const macros = MEAL_MACROS[meal.id];
  const done = !!log?.done;
  const shine = useShine();
  return (
    <motion.div className="glass card meal-card" {...stagger(index)} {...shine} style={done ? { borderColor: 'rgba(255, 122, 77,0.3)' } : undefined}>
      <div className="shine" />
      <div className="meal-head">
        <span className="meal-time">{meal.time}</span>
        <div style={{ minWidth: 0 }}>
          <h3 className={done ? 'grad-ok' : 'grad'}>{meal.name}</h3>
          {macros && (
            <div className="small muted tnum">
              ≈ {macros.kcal} kcal · {macros.p}g prot · {macros.c}g carb · {macros.g}g gord
            </div>
          )}
        </div>
        <span className="spacer" />
        <AnimatePresence>
          {done && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="tag" style={{ background: 'rgba(255, 122, 77,0.15)', color: '#ffc4a3' }}>
              <Check size={12} /> feita {log?.done_at ? new Date(log.done_at).toTimeString().slice(0, 5) : ''}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {meal.items.map((it) => (
        <FoodRow
          key={it.id}
          item={it}
          choice={log?.choices?.[it.id]}
          onChoose={(i) => {
            const choices = { ...(log?.choices ?? {}) };
            if (i === undefined) delete choices[it.id];
            else choices[it.id] = i;
            setMealLog(date, meal.id, { choices });
          }}
        />
      ))}
      <div className="meal-foot">
        <button
          className={`chip ${log?.dessert ? 'on' : ''}`}
          onClick={() => setMealLog(date, meal.id, { dessert: !log?.dessert })}
          title="Morango, berries ou maracujá (200g)"
        >
          <Cherry size={14} color="#ff8f6b" /> Sobremesa 200g {log?.dessert ? '✓' : ''}
        </button>
        <span className="spacer" />
        <motion.button
          whileTap={{ scale: 0.95 }}
          className={`btn ${done ? '' : 'btn-ok'}`}
          onClick={(e) => {
            const next = !done;
            setMealLog(date, meal.id, { done: next, done_at: next ? new Date().toISOString() : null });
            if (next) {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              celebrate('small', { x: (r.left + r.width / 2) / innerWidth, y: r.top / innerHeight });
              if (prefs.sound) chime();
            }
          }}
        >
          <Check size={15} /> {done ? 'Desmarcar' : 'Marcar como feita'}
        </motion.button>
      </div>
      {meal.notes && <div className="notes">{meal.notes}</div>}
    </motion.div>
  );
}

function MacroCard({ date }: { date: string }) {
  const meals = useMeals();
  const getLog = useMealLogs(date);
  const plan = meals.reduce((a, m) => {
    const x = MEAL_MACROS[m.id];
    return x ? { kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, g: a.g + x.g } : a;
  }, { kcal: 0, p: 0, c: 0, g: 0 });
  const eaten = meals.reduce((a, m) => {
    const x = MEAL_MACROS[m.id];
    return x && getLog(m.id)?.done ? { kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, g: a.g + x.g } : a;
  }, { kcal: 0, p: 0, c: 0, g: 0 });
  const rows: [string, keyof typeof plan, string, string][] = [
    ['Proteína', 'p', 'g', 'linear-gradient(90deg,#ff7a4d,#ff4d1f)'],
    ['Carbo', 'c', 'g', 'linear-gradient(90deg,#ffb38a,#d4d4dc)'],
    ['Gordura', 'g', 'g', 'linear-gradient(90deg,#ffd1a6,#ffa36b)'],
  ];
  return (
    <div className="glass card">
      <div className="card-title">
        <h3>Macros do dia</h3>
        <span className="small muted" title="Estimativa pela tabela TACO, com as opções base do plano">estimativa <Info size={12} style={{ verticalAlign: -2 }} /></span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <span className="display grad" style={{ fontSize: 34 }}>
          <CountUp value={eaten.kcal} />
        </span>
        <span className="muted">/ {plan.kcal} kcal</span>
      </div>
      {rows.map(([label, k, unit, bg]) => (
        <div key={k} className="macro">
          <span className="muted">{label}</span>
          <div className="bar">
            <i style={{ width: `${plan[k] ? (eaten[k] / plan[k]) * 100 : 0}%`, background: bg }} />
          </div>
          <span className="tnum" style={{ textAlign: 'right' }}>
            {eaten[k]}/{plan[k]}
            {unit}
          </span>
        </div>
      ))}
      <div className="small dim" style={{ marginTop: 6 }}>Vegetais à vontade não entram na conta.</div>
    </div>
  );
}

function Adherence() {
  const meals = useMeals();
  const logs = useStore((s) => s.meal_logs);
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const score = (d: string) => meals.filter((m) => logs[mealLogId(d, m.id)]?.done).length;
  const full = days.filter((d) => meals.length && score(d) === meals.length).length;
  return (
    <div className="glass card">
      <div className="card-title">
        <h3>Aderência · 14 dias</h3>
        <span className="small muted">{full} dias 100%</span>
      </div>
      <div className="streak-dots">
        {days.map((d) => (
          <i
            key={d}
            title={`${labelDate(d)}: ${score(d)}/${meals.length}`}
            className={`${score(d) === meals.length && meals.length ? 'on' : ''} ${d === t ? 'today' : ''}`}
            style={score(d) > 0 && score(d) < meals.length ? { background: 'rgba(255,122,77,0.35)' } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function DietPage() {
  const [date, setDate] = useState(today());
  const meals = useMeals();
  const logs = useStore((s) => s.meal_logs);
  const doneCount = (d: string) => meals.filter((m) => logs[mealLogId(d, m.id)]?.done).length;
  return (
    <div className="page wide">
      <div className="page-head">
        <div className="row">
          <div>
            {DIET_SOURCE.nutritionist && (
              <div className="eyebrow">
                Plano de {DIET_SOURCE.nutritionist}
                {DIET_SOURCE.crn && ` · ${DIET_SOURCE.crn}`}
                {DIET_SOURCE.prescribed && ` · prescrito em ${DIET_SOURCE.prescribed}`}
              </div>
            )}
            <h1 className="display h1 grad" style={{ marginTop: 10 }}>
              Dieta
            </h1>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" onClick={() => setDate(addDays(date, -7))}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-sm" onClick={() => setDate(today())}>
              Hoje
            </button>
            <button className="icon-btn" onClick={() => setDate(addDays(date, 7))}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <p>{longDate(date)}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <WeekPicker value={date} onChange={setDate} sub={(d) => `${doneCount(d)}/${meals.length}`} done={(d) => meals.length > 0 && doneCount(d) === meals.length} />
      </div>
      <div className="grid grid-12">
        <div className="span-8 stack">
          {date === today() && <FastingCard />}
          {meals.map((m, i) => (
            <MealCard key={m.id} meal={m} date={date} index={i} />
          ))}
        </div>
        <div className="span-4 stack">
          <MacroCard date={date} />
          <WaterCard date={date} />
          <Adherence />
        </div>
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Flame,
  Footprints,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
  Trophy,
  BarChart3,
  Bell,
  Dumbbell,
  Sofa,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { WeekPicker } from '../components/Daily';
import { CountUp, stagger, useShine } from '../components/ui';
import { celebrate, dayLogId, setDayLog, setWorkoutLog, toast, workoutLogId } from '../lib/actions';
import { addDays, durationLabel, labelDate, longDate, today, weekday, WEEKDAYS } from '../lib/dates';
import { chime, tick } from '../lib/fx';
import { uid } from '../lib/ids';
import { usePrefs, useRows, useStore } from '../lib/store';
import type { Exercise, Split, WorkoutEntry, WorkoutLog } from '../lib/types';
import { buildEntries, planSplits, reconcileEntries, volume } from '../lib/workout';
import { cancelRest, startRest } from '../lib/rest';
import { enablePush, pushState } from '../lib/push';
import { WeightTracker } from '../components/WeightTracker';
export { volume } from '../lib/workout';

/** Treino de cada dia já com os descansos empurrando a divisão (ver planSplits). */
export function useSplitPlan(center: string): (date: string) => Split | undefined {
  const splits = useRows('splits');
  const dayLogs = useStore((s) => s.day_logs);
  const logs = useStore((s) => s.workout_logs);
  return useMemo(() => {
    const rested = (d: string) => {
      const dl = dayLogs[dayLogId(d)];
      const wl = logs[workoutLogId(d)];
      return !!dl?.workout_rest && !dl.deleted && !(wl?.started_at && !wl.deleted);
    };
    const plan = planSplits(addDays(center, -60), addDays(center, 14), splits, rested);
    return (d) => (d in plan ? plan[d] : splits.find((s) => s.weekday === weekday(d)));
  }, [center, splits, dayLogs, logs]);
}

export function useSplitFor(date: string): Split | undefined {
  return useSplitPlan(date)(date);
}

export function useWorkoutLog(date: string): WorkoutLog | undefined {
  const l = useStore((s) => s.workout_logs[workoutLogId(date)]);
  return l && !l.deleted ? l : undefined;
}

function useLastByExercise(before: string) {
  const logs = useRows('workout_logs');
  return useMemo(() => {
    const map: Record<string, { w: number | null; r: number | null }[]> = {};
    const sorted = logs.filter((l) => l.date < before).sort((a, b) => b.date.localeCompare(a.date));
    for (const l of sorted)
      for (const e of l.entries) {
        const key = e.name.toLowerCase();
        if (!map[key] && e.sets.some((s) => s.done)) map[key] = e.sets.filter((s) => s.done);
      }
    return map;
  }, [logs, before]);
}

function useTick(ms: number, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(i);
  }, [ms, on]);
}

/* ---------- edição da divisão ---------- */

function SplitEditor({ split, weekdayNum, date, onDone }: { split?: Split; weekdayNum: number; date: string; onDone: () => void }) {
  const log = useWorkoutLog(date);
  const splits = useRows('splits');
  const [applyNow, setApplyNow] = useState(!log?.finished_at);
  const [name, setName] = useState(split?.name ?? 'Novo treino');
  const [list, setList] = useState<Exercise[]>(split?.exercises ?? []);
  const patch = (i: number, p: Partial<Exercise>) => setList((l) => l.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const move = (i: number, d: number) =>
    setList((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
      return n;
    });
  const save = () => {
    if (list.some((e) => !e.name.trim() || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 30 || !Number.isFinite(e.rest) || e.rest < 0 || e.rest > 1800)) {
      toast('Preencha os nomes, séries de 1 a 30 e descanso de 0 a 1800 segundos.');
      return;
    }
    const next = { id: split?.id ?? uid(), weekday: weekdayNum, name: name.trim() || 'Treino', exercises: list.map((e) => ({ ...e, name: e.name.trim() })), sort: weekdayNum };
    const removesDone = log?.entries.some((e) => !list.some((x) => x.id === e.exercise_id) && e.sets.some((s) => s.done));
    if (applyNow && !log?.finished_at && removesDone && !confirm('Esta mudança remove exercícios com séries feitas no treino deste dia. Continuar?')) return;
    useStore.getState().put('splits', next);
    if (applyNow && log && !log.finished_at) {
      setWorkoutLog(date, { split_id: next.id, name: next.name, entries: reconcileEntries({ ...next, updated_at: '' }, log.entries) });
      cancelRest();
    }
    toast('Divisão salva' + (applyNow && log && !log.finished_at ? ' e treino do dia atualizado.' : '.'));
    onDone();
  };
  return (
    <div className="glass card">
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Nome do treino de {WEEKDAYS[weekdayNum]}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="field" style={{ marginBottom: 14 }}>
        <span>Usar outro treino como base</span>
        <select className="input" value="" onChange={(e) => {
          const source = splits.find((s) => s.id === e.target.value);
          if (source && (!list.length || confirm('Substituir a lista de exercícios neste editor?'))) { setName(source.name); setList(source.exercises.map((x) => ({ ...x, id: uid() }))); }
        }}><option value="">Escolher treino…</option>{splits.filter((s) => s.id !== split?.id).map((s) => <option key={s.id} value={s.id}>{WEEKDAYS[s.weekday]} · {s.name}</option>)}</select>
      </label>
      {log && !log.finished_at && <label className="row small" style={{ marginBottom: 14 }}><input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} /> Aplicar também ao treino deste dia (mantém as séries dos exercícios que ficam)</label>}
      {log?.finished_at && <p className="small muted">O treino finalizado fica preservado. Esta edição vale para os próximos treinos.</p>}
      <div className="set-row headrow split-edit">
        <span>Exercício</span>
        <span>Séries</span>
        <span>Reps</span>
        <span>Desc. (s)</span>
        <span />
      </div>
      {list.map((e, i) => (
        <div key={e.id} className="set-row split-edit">
          <input className="input" aria-label={`Nome do exercício ${i + 1}`} style={{ textAlign: 'left' }} value={e.name} onChange={(x) => patch(i, { name: x.target.value })} />
          <input className="input" aria-label={`Séries do exercício ${i + 1}`} type="number" min={1} max={30} value={e.sets} onChange={(x) => patch(i, { sets: Math.max(1, Number(x.target.value)) })} />
          <input className="input" aria-label={`Repetições do exercício ${i + 1}`} value={e.reps} onChange={(x) => patch(i, { reps: x.target.value })} />
          <input className="input" aria-label={`Descanso do exercício ${i + 1}`} type="number" min={0} max={1800} step={1} value={e.rest} onChange={(x) => patch(i, { rest: Number(x.target.value) })} />
          <span className="row" style={{ gap: 0 }}>
            <button className="icon-btn sm" aria-label={`Subir ${e.name || "exercício"}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
            <button className="icon-btn sm" aria-label={`Descer ${e.name || "exercício"}`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
            <button className="icon-btn sm" aria-label={`Excluir ${e.name || "exercício"}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </span>
        </div>
      ))}
      <button className="inline-add" onClick={() => setList((l) => [...l, { id: uid(), name: '', sets: 3, reps: '10-12', rest: 60 }])}>
        <span className="plus"><Plus size={15} /></span> Adicionar exercício
      </button>
      <div className="row split-editor-actions" style={{ marginTop: 10 }}>
        {split && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: '#ff8a8d' }}
            onClick={() => {
              if (confirm(`Transformar ${WEEKDAYS[weekdayNum]} em dia de descanso?`)) {
                useStore.getState().remove('splits', split.id);
                cancelRest();
                onDone();
              }
            }}
          >
            <Sofa size={14} /> Virar descanso
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Salvar divisão</button>
      </div>
    </div>
  );
}

/* ---------- sessão ---------- */

function ExerciseBlock({
  entry,
  index,
  exercise,
  last,
  onChange,
  onSetDone,
  defaultOpen,
  onRemove,
  locked,
}: {
  entry: WorkoutEntry;
  index: number;
  exercise?: Exercise;
  last?: { w: number | null; r: number | null }[];
  onChange: (e: WorkoutEntry) => void;
  onSetDone: (rest: number) => void;
  defaultOpen: boolean;
  onRemove: () => void;
  locked: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const doneSets = entry.sets.filter((s) => s.done).length;
  const complete = doneSets === entry.sets.length && entry.sets.length > 0;
  const setSet = (i: number, p: Partial<WorkoutEntry['sets'][number]>) =>
    onChange({ ...entry, sets: entry.sets.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <div className="exercise">
      <button className="ex-head" onClick={() => setOpen((o) => !o)}>
        <span className={`ex-num ${complete ? 'done' : ''}`}>{complete ? <Check size={15} strokeWidth={3} /> : index + 1}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{entry.name}</div>
          <div className="small muted">
            {exercise ? `${exercise.sets} × ${exercise.reps} · descanso ${exercise.rest}s` : `${entry.sets.length} séries`}
            {last?.length ? ` · anterior ${last[0].w ?? '–'}kg × ${last[0].r ?? '–'}` : ''}
          </div>
        </span>
        <span className="small muted tnum">{doneSets}/{entry.sets.length}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={16} className="dim" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="ex-sets">
              <div className="set-row headrow">
                <span className="n">Série</span>
                <span>Carga (kg)</span>
                <span>Reps</span>
                <span />
              </div>
              {entry.sets.map((s, i) => (
                <div key={i} className={`set-row ${s.done ? 'done' : ''}`}>
                  <span className="n">{i + 1}</span>
                  <input
                    className="input tnum"
                    aria-label={`Carga de ${entry.name}, série ${i + 1}`}
                    disabled={locked}
                    min={0}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder={last?.[i]?.w != null ? String(last[i].w) : '–'}
                    value={s.w ?? ''}
                    onChange={(e) => setSet(i, { w: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                  />
                  <input
                    className="input tnum"
                    type="number"
                    aria-label={`Repetições de ${entry.name}, série ${i + 1}`}
                    disabled={locked}
                    min={0}
                    inputMode="numeric"
                    placeholder={last?.[i]?.r != null ? String(last[i].r) : exercise?.reps ?? '–'}
                    value={s.r ?? ''}
                    onChange={(e) => setSet(i, { r: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                  />
                  <motion.button
                    aria-label={`${s.done ? "Desmarcar" : "Concluir"} série ${i + 1} de ${entry.name}`}
                    disabled={locked}
                    whileTap={{ scale: 0.85 }}
                    className={`set-check ${s.done ? 'on' : ''}`}
                    onClick={() => {
                      const done = !s.done;
                      const fill = done
                        ? { w: s.w ?? last?.[i]?.w ?? null, r: s.r ?? last?.[i]?.r ?? (Number(exercise?.reps.split('-').pop()) || null) }
                        : {};
                      setSet(i, { done, ...fill });
                      if (done) onSetDone(exercise?.rest ?? 60);
                    }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </motion.button>
                </div>
              ))}
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" disabled={locked} onClick={() => onChange({ ...entry, sets: [...entry.sets, { w: entry.sets.at(-1)?.w ?? null, r: null, done: false }] })}>
                  <Plus size={13} /> Série
                </button>
                {entry.sets.length > 1 && (
                  <button className="btn btn-ghost btn-sm" disabled={locked} onClick={() => {
                    if (entry.sets.at(-1)?.done && !confirm('Remover esta série já concluída?')) return;
                    onChange({ ...entry, sets: entry.sets.slice(0, -1) });
                  }}>
                    Remover última
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" disabled={locked} onClick={onRemove}><Trash2 size={13} /> Remover exercício deste dia</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Session({ date, split }: { date: string; split: Split }) {
  const log = useWorkoutLog(date);
  const prefs = usePrefs();
  const last = useLastByExercise(date);
  const entries = log ? log.entries : buildEntries(split);
  const started = !!log?.started_at;
  const finished = !!log?.finished_at;
  useTick(1000, started && !finished);
  const elapsed = log?.started_at ? ((log.finished_at ? new Date(log.finished_at).getTime() : Date.now()) - new Date(log.started_at).getTime()) / 60000 : 0;
  const totalSets = entries.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const shine = useShine();

  const write = (next: WorkoutEntry[]) =>
    setWorkoutLog(date, {
      split_id: split.id === 'history' ? null : split.id,
      name: split.name,
      entries: next,
      started_at: log?.started_at ?? new Date().toISOString(),
    });

  return (
    <div className="stack">
      <motion.div className="glass card" {...shine} {...stagger(0)}>
        <div className="shine" />
        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="eyebrow">
              {WEEKDAYS[weekday(date)]} · {entries.length} exercícios
            </div>
            <h2 className={`display ${finished ? 'grad-ok' : 'grad-hot'}`} style={{ fontSize: 34, margin: '6px 0' }}>
              {log?.name || split.name}
            </h2>
            <div className="row small muted" style={{ gap: 14, flexWrap: 'wrap' }}>
              <span className="tnum">
                {doneSets}/{totalSets} séries · <CountUp value={totalSets ? Math.round((doneSets / totalSets) * 100) : 0} suffix="%" />
              </span>
              {started && (
                <span className="row" style={{ gap: 5 }}>
                  <Timer size={13} /> {durationLabel(elapsed)}
                </span>
              )}
              {log && <span>Volume {Math.round(volume(log)).toLocaleString('pt-BR')} kg</span>}
            </div>
            <div className="bar" style={{ height: 4, marginTop: 12 }}>
              <i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="row">
            {!started && (
              <>
                <motion.button whileTap={{ scale: 0.95 }} className="btn btn-lg" onClick={() => restWorkout(date)}>
                  <Sofa size={16} /> Descanso
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} className="btn btn-hot btn-lg" onClick={() => write(entries)}>
                  <Play size={16} fill="#fff" /> Começar treino
                </motion.button>
              </>
            )}
            {started && !finished && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="btn btn-ok btn-lg"
                onClick={() => {
                  setWorkoutLog(date, { finished_at: new Date().toISOString() });
                  cancelRest();
                  celebrate('big');
                  if (prefs.sound) chime();
                }}
              >
                <Trophy size={16} /> Finalizar
              </motion.button>
            )}
            {finished && (
              <button className="btn" onClick={() => setWorkoutLog(date, { finished_at: null })}>
                Reabrir
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {!entries.length && <div className="glass card small muted">Nenhum exercício neste dia. Use Editar divisão para adicionar exercícios e aplicar ao treino.</div>}
      <motion.div className="glass" {...stagger(1)} style={{ overflow: 'hidden' }}>
        {entries.map((e, i) => (
          <ExerciseBlock
            key={e.exercise_id}
            entry={e}
            locked={finished}
            index={i}
            exercise={e.rest !== undefined ? { id: e.exercise_id, name: e.name, sets: e.sets.length, rest: e.rest, reps: e.reps ?? '' } : split.exercises.find((x) => x.id === e.exercise_id)}
            last={last[e.name.toLowerCase()]}
            defaultOpen={!finished && i === entries.findIndex((x) => x.sets.some((s) => !s.done))}
            onChange={(ne) => write(entries.map((x, j) => (j === i ? ne : x)))}
            onRemove={() => {
              if (e.sets.some((s) => s.done) && !confirm('Remover este exercício e suas séries do treino deste dia?')) return;
              const previous = entries;
              write(entries.filter((_, j) => j !== i));
              cancelRest();
              toast('Exercício removido deste dia.', { label: 'Desfazer', run: () => write(previous) });
            }}
            onSetDone={(sec) => {
              if (prefs.sound) tick();
              if (sec > 0) startRest(sec, date, e.name);
            }}
          />
        ))}
      </motion.div>


    </div>
  );
}

/* ---------- cardio ---------- */

/** Marca descanso no treino do dia, com desfazer. */
export function restWorkout(date: string) {
  setDayLog(date, { workout_rest: true });
  toast('Descanso: o treino passa para o próximo dia', { label: 'Desfazer', run: () => setDayLog(date, { workout_rest: false }) });
}

export function restCardio(date: string) {
  setDayLog(date, { cardio_rest: true, cardio_done: false });
  toast('Descanso no cardio de hoje', { label: 'Desfazer', run: () => setDayLog(date, { cardio_rest: false }) });
}

export function useCardioStreak() {
  const logs = useStore((s) => s.day_logs);
  const t = today();
  const done = (d: string) => !!logs[dayLogId(d)]?.cardio_done;
  // descanso escolhido não conta nem quebra a sequência
  const rest = (d: string) => !done(d) && !!logs[dayLogId(d)]?.cardio_rest;
  let streak = 0;
  let d = done(t) || rest(t) ? t : addDays(t, -1);
  for (let guard = 0; guard < 400 && (done(d) || rest(d)); guard++) {
    if (done(d)) streak++;
    d = addDays(d, -1);
  }
  return { streak, done, rest };
}

export function CardioCard({ date = today(), full = false }: { date?: string; full?: boolean }) {
  const log = useStore((s) => s.day_logs[dayLogId(date)]);
  const prefs = usePrefs();
  const { streak, done, rest } = useCardioStreak();
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const on = !!log?.cardio_done;
  const resting = !on && !!log?.cardio_rest;
  const shine = useShine();
  return (
    <div className="glass card" {...shine}>
      <div className="shine" />
      <div className="card-title">
        <h3>
          <Footprints size={16} color="#ff7a4d" /> Cardio em jejum
        </h3>
        <span className="tag" style={{ background: streak ? 'rgba(255,91,54,0.14)' : undefined, color: streak ? '#ffb38a' : undefined }}>
          <Flame size={12} /> {streak} dia{streak === 1 ? '' : 's'} seguidos
        </span>
      </div>
      {/* mesmo desenho do card "Treino de hoje": nome grande + resumo à esquerda, botão à direita */}
      <div className="row act-row" style={{ gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`display ${resting ? 'rest-title' : on ? 'grad-ok' : 'grad-hot'}`} style={{ fontSize: 26 }}>{resting ? 'Descanso' : 'Caminhada'}</div>
          <div className="small muted">
            {resting ? 'Caminhada fica para amanhã' : on ? `${log?.cardio_min ?? prefs.cardio_goal} min · feita hoje` : `${prefs.cardio_goal} min em jejum`}
          </div>
        </div>
        {resting ? (
          <motion.button whileTap={{ scale: 0.95 }} className="btn" title="Desfazer descanso" onClick={() => setDayLog(date, { cardio_rest: false })}>
            <Sofa size={15} /> Descanso
          </motion.button>
        ) : (
        <div className="act-btns">
        {!on && (
          <motion.button whileTap={{ scale: 0.95 }} className="btn btn-sm btn-ghost rest-btn" onClick={() => restCardio(date)}>
            <Sofa size={15} /> Descanso
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          className={`btn ${on ? '' : 'btn-hot'}`}
          title={on ? 'Desmarcar caminhada' : undefined}
          onClick={() => {
            const next = !on;
            setDayLog(date, { cardio_done: next, cardio_rest: false, cardio_min: next ? log?.cardio_min ?? prefs.cardio_goal : log?.cardio_min ?? null });
            if (next) {
              celebrate('small');
              if (prefs.sound) chime();
            }
          }}
        >
          <Check size={15} /> {on ? 'Feito' : 'Marcar como feito'}
        </motion.button>
        </div>
        )}
      </div>
      {full && (
        <>
          {on && (
            <label className="row small muted" style={{ marginTop: 14, gap: 10 }}>
              Minutos
              <input
                className="input tnum"
                type="number"
                style={{ width: 80, textAlign: 'center' }}
                value={log?.cardio_min ?? ''}
                onChange={(e) => setDayLog(date, { cardio_min: Number(e.target.value) || null })}
              />
            </label>
          )}
          <div className="streak-dots" style={{ marginTop: 14 }}>
            {days.map((d) => (
              <i key={d} className={`${done(d) ? 'on' : rest(d) ? 'rest' : ''} ${d === t ? 'today' : ''}`} title={labelDate(d) + (rest(d) ? ' · descanso' : '')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function History() {
  const logs = useRows('workout_logs')
    .filter((l) => l.finished_at)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  return (
    <div className="glass card">
      <div className="card-title">
        <h3>Histórico</h3>
      </div>
      {!logs.length && <div className="small dim">Seus treinos finalizados aparecem aqui.</div>}
      {logs.map((l) => (
        <div key={l.id} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <Dumbbell size={15} className="dim" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{l.name}</div>
            <div className="small muted">{labelDate(l.date)}</div>
          </div>
          <span className="spacer" />
          <span className="small tnum muted">{Math.round(volume(l)).toLocaleString('pt-BR')} kg</span>
        </div>
      ))}
    </div>
  );
}

export function WorkoutPage() {
  const [params, setParams] = useSearchParams();
  const queryDate = params.get('data');
  const date = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) && !Number.isNaN(Date.parse(queryDate)) ? queryDate : today();
  const setDate = (d: string) => { setParams({ data: d }); };
  const plan = useSplitPlan(date);
  const split = plan(date);
  const splits = useRows('splits');
  // a edição mexe na divisão fixa do dia da semana, não no treino empurrado pela fila
  const ownSplit = splits.find((s) => s.weekday === weekday(date));
  const logs = useStore((s) => s.workout_logs);
  const dayLogs = useStore((s) => s.day_logs);
  const rested = (d: string) => !!dayLogs[dayLogId(d)]?.workout_rest && !logs[workoutLogId(d)]?.started_at;
  const [editing, setEditing] = useState(false);
  const log = useWorkoutLog(date);
  const sessionSplit: Split | undefined = log ? { id: log.split_id ?? 'history', weekday: weekday(date), name: log.name, exercises: split?.exercises ?? [], sort: 0, updated_at: log.updated_at } : split;
  const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(date, i - ((weekday(date) + 6) % 7)));
  const weekDone = thisWeek.filter((d) => logs[workoutLogId(d)]?.finished_at && !logs[workoutLogId(d)]?.deleted).length;
  const weekPlanned = thisWeek.filter((d) => plan(d) && !rested(d)).length;
  useEffect(() => setEditing(false), [date]);
  return (
    <div className="page wide">
      <div className="page-head">
        <div className="row">
          <div>
            <div className="eyebrow">
              {weekDone}/{weekPlanned} treinos na semana
            </div>
            <h1 className="display h1 grad" style={{ marginTop: 10 }}>Treino</h1>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}><Link className="btn btn-sm" to="/relatorio-treino"><BarChart3 size={14} /> Relatório de treino</Link>
          <button className="btn btn-sm" onClick={() => setEditing((e) => !e)}>
            <Pencil size={14} /> {editing ? 'Fechar edição' : 'Editar divisão'}
          </button></div>
        </div>
        <p>{longDate(date)}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <WeekPicker
          value={date}
          onChange={setDate}
          sub={(d) => (rested(d) ? 'Descanso' : plan(d)?.name ?? 'Descanso')}
          done={(d) => !!logs[workoutLogId(d)]?.finished_at && !logs[workoutLogId(d)]?.deleted}
        />
      </div>
      <div className="grid grid-12">
        <div className="span-8 stack">
          {editing ? (
            <SplitEditor key={date} split={ownSplit} weekdayNum={weekday(date)} date={date} onDone={() => setEditing(false)} />
          ) : sessionSplit && rested(date) ? (
            <div className="glass card">
              <div className="empty" style={{ padding: '40px 10px' }}>
                <div className="orb"><Sofa size={34} color="#fff" strokeWidth={1.6} /></div>
                <h3>Descanso hoje</h3>
                <div>Recuperação também é treino. {sessionSplit.name} passa para o próximo dia e a divisão anda junto.</div>
                <button className="btn" style={{ marginTop: 16 }} onClick={() => setDayLog(date, { workout_rest: false })}>
                  <Play size={14} /> Treinar hoje mesmo assim
                </button>
              </div>
            </div>
          ) : sessionSplit ? (
            <Session key={date} date={date} split={sessionSplit} />
          ) : (
            <div className="glass card">
              <div className="empty" style={{ padding: '40px 10px' }}>
                <div className="orb"><Sofa size={34} color="#fff" strokeWidth={1.6} /></div>
                <h3>Dia de descanso</h3>
                <div>Recuperação também é treino. O cardio da manhã continua valendo.</div>
                <button className="btn" style={{ marginTop: 16 }} onClick={() => setEditing(true)}>
                  <Plus size={14} /> Montar treino para {WEEKDAYS[weekday(date)]}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="span-4 stack">
          <CardioCard date={date} full />
          <RestAlerts />
          <WeightTracker compact />
          <History />
        </div>
      </div>
    </div>
  );
}

function RestAlerts() {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void pushState().then(setState); }, []);
  return <div className="glass card">
    <div className="card-title"><h3><Bell size={16} /> Alertas de descanso</h3></div>
    <p className="small muted">O descanso começa ao concluir uma série. Você recebe um aviso no início e outro ao terminar.</p>
    {state === 'on' ? <span className="small">Notificações ativadas neste aparelho.</span> : <button className="btn btn-sm" disabled={busy || ['denied', 'unsupported', 'needs-install'].includes(state)} onClick={async () => {
      setBusy(true);
      try { await enablePush(); setState(await pushState()); toast('Alertas ativados.'); } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível ativar.'); } finally { setBusy(false); }
    }}>{busy ? 'Ativando…' : 'Ativar notificações'}</button>}
    <p className="small muted">{state === 'needs-install' ? 'No iPhone, adicione o PUCS à Tela de Início e ative por lá.' : state === 'denied' ? 'Libere as notificações do PUCS nas configurações do aparelho.' : 'Som segue a opção em Ajustes. Com o app fechado, o push depende de internet e pode levar até 1 minuto após o fim.'}</p>
  </div>;
}

import { ArrowLeft, CalendarDays, Dumbbell, Timer, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WeightTracker } from '../components/WeightTracker';
import { WorkoutChart } from '../components/WorkoutChart';
import { addDays, diffDays, fromISO, startOfWeek, today } from '../lib/dates';
import { useRows } from '../lib/store';
import { exerciseKey, exerciseProgress, summarizeWorkouts, volume, workoutMinutes } from '../lib/workout';

const fmt = (n: number, digits = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits });

export function WorkoutReportPage() {
  const all = useRows('workout_logs').filter((l) => l.finished_at && l.date <= today()).sort((a, b) => a.date.localeCompare(b.date));
  const dayLogs = useRows('day_logs');
  const [period, setPeriod] = useState('30');
  const [chosen, setChosen] = useState('');
  const [limit, setLimit] = useState(15);
  const end = today();
  const days = Number(period);
  const first = [all[0]?.date ?? end, ...dayLogs.filter((l) => (l.cardio_done || l.weight_kg != null) && l.date <= end).map((l) => l.date)].sort()[0];
  const since = days ? addDays(end, 1 - days) : first;
  const logs = all.filter((l) => l.date >= since);
  const summary = summarizeWorkouts(logs);
  const previous = days ? summarizeWorkouts(all.filter((l) => l.date >= addDays(since, -days) && l.date < since)) : null;
  const change = previous && previous.count ? `${summary.count - previous.count >= 0 ? '+' : ''}${summary.count - previous.count} vs. período anterior` : 'Treinos finalizados no período';
  const names = new Map<string, string>();
  const latestNames = new Map<string, string>();
  all.forEach((l) => l.entries.forEach((e) => latestNames.set(e.exercise_id, e.name)));
  latestNames.forEach((name) => names.set(exerciseKey(name), name));
  const exercise = names.has(chosen) ? chosen : [...names.keys()][0] ?? '';
  const progress = exerciseProgress(logs, exercise, all);
  const allProgress = exerciseProgress(all, exercise);
  const record = allProgress.length ? Math.max(...allProgress.map((p) => p.load)) : null;
  const weekly = new Map<string, number>();
  // Janela completa: semanas sem treino também aparecem com zero.
  for (let date = startOfWeek(since); date <= end; date = addDays(date, 7)) weekly.set(date, 0);
  logs.forEach((l) => { const w = startOfWeek(l.date); weekly.set(w, (weekly.get(w) ?? 0) + 1); });
  const dailyVolume = new Map<string, number>();
  logs.forEach((l) => dailyVolume.set(l.date, (dailyVolume.get(l.date) ?? 0) + volume(l)));
  const cardio = dayLogs.filter((l) => l.date >= since && l.date <= end && l.cardio_done);
  const weeks = Math.max(1, (diffDays(end, since) + 1) / 7);
  return <div className="page wide workout-report">
    <div className="page-head"><div className="row"><div><div className="eyebrow">Sua evolução, registro por registro</div><h1 className="display h1 grad" style={{ marginTop: 10 }}>Relatório de treino</h1></div><Link to="/treino" className="btn btn-sm"><ArrowLeft size={14} /> Treino</Link></div><p>Cargas, volume, frequência e peso. Somente treinos finalizados entram nas métricas.</p></div>
    <div className="report-filters"><div className="segmented" aria-label="Período do relatório">{[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['0', 'Tudo']].map(([v, label]) => <button key={v} aria-pressed={period === v} className={period === v ? 'active' : ''} onClick={() => { setPeriod(v); setLimit(15); }}>{label}</button>)}</div><span className="small muted">{fromISO(since).toLocaleDateString('pt-BR')} a {fromISO(end).toLocaleDateString('pt-BR')}</span></div>
    <div className="report-kpis">
      <Metric icon={<Dumbbell size={17} />} label="Treinos" value={fmt(summary.count)} sub={change} />
      <Metric icon={<TrendingUp size={17} />} label="Volume total" value={`${fmt(summary.volume)} kg`} sub="Carga × repetições das séries feitas" />
      <Metric icon={<CalendarDays size={17} />} label="Frequência" value={`${fmt(summary.count / weeks, 1)}/sem`} sub={`${summary.sets} séries concluídas`} />
      <Metric icon={<Timer size={17} />} label="Duração média" value={summary.averageMinutes === null ? 'Sem dados' : `${fmt(summary.averageMinutes)} min`} sub={`${fmt(summary.minutes)} min de treino no período`} />
    </div>
    <div className="report-grid">
      <section className="glass card"><div className="card-title"><h3>Frequência semanal</h3></div><p className="small muted">Treinos finalizados por semana, iniciando na segunda. As semanas nas bordas podem estar incompletas.</p><WorkoutChart points={[...weekly].map(([date, value]) => ({ date, value }))} label="Treinos" unit="treinos" bars /></section>
      <section className="glass card"><div className="card-title"><h3>Volume por treino</h3></div><p className="small muted">Compare dias com exercícios e quantidades de séries semelhantes.</p><WorkoutChart points={[...dailyVolume].map(([date, value]) => ({ date, value }))} label="Volume" unit="kg" /></section>
      <section className="glass card"><div className="card-title"><h3>Evolução por exercício</h3></div><label className="field"><span>Exercício</span><select aria-label="Exercício do relatório" className="input" value={exercise} onChange={(e) => setChosen(e.target.value)} disabled={!names.size}>{!names.size && <option value="">Nenhum exercício registrado</option>}{[...names].sort((a, b) => a[1].localeCompare(b[1])).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label><p className="small muted">Maior carga de uma série concluída em cada treino. {record !== null ? `Recorde registrado: ${fmt(record, 1)} kg.` : ''}</p><WorkoutChart points={progress.map((p) => ({ date: p.date, value: p.load }))} label="Maior carga" unit="kg" /></section>
      <WeightTracker since={days ? since : ''} />
    </div>
    <section className="glass card" style={{ marginTop: 20 }}><div className="card-title"><h3>Histórico completo</h3><span className="tag">Cardio: {cardio.length} dias · {fmt(cardio.reduce((n, l) => n + (l.cardio_min ?? 0), 0))} min</span></div>{!logs.length ? <div className="report-empty">Finalize seu primeiro treino para começar o relatório.</div> : <><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Data</th><th>Treino</th><th>Séries feitas</th><th>Volume</th><th>Duração</th></tr></thead><tbody>{[...logs].reverse().slice(0, limit).map((l) => <tr key={l.id}><td><Link to={`/treino?data=${l.date}`}>{fromISO(l.date).toLocaleDateString('pt-BR')}</Link></td><td>{l.name || 'Treino'}</td><td>{l.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)}</td><td>{fmt(volume(l))} kg</td><td>{workoutMinutes(l) === null ? 'Sem registro' : `${fmt(workoutMinutes(l)!)} min`}</td></tr>)}</tbody></table></div>{logs.length > limit && <button className="btn btn-sm" onClick={() => setLimit((n) => n + 20)}>Mais treinos</button>}</>}</section>
    <p className="small muted" style={{ marginTop: 16 }}>Volume considera apenas séries marcadas como feitas com carga e repetições preenchidas. Exercícios sem carga continuam contando nas séries e na frequência.</p>
  </div>;
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return <div className="glass card report-metric"><div className="row small muted">{icon}{label}</div><div className="display tnum">{value}</div><div className="small muted">{sub}</div></div>;
}

import { Pencil, Scale, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { dayLogId, setDayLog, toast } from '../lib/actions';
import { fromISO, today } from '../lib/dates';
import { useRows, useStore } from '../lib/store';
import { WorkoutChart } from './WorkoutChart';

export function WeightTracker({ compact = false, since = '' }: { compact?: boolean; since?: string }) {
  const records = useRows('day_logs').filter((l) => l.weight_kg != null && Number.isFinite(l.weight_kg) && l.weight_kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const filtered = records.filter((l) => l.date >= since && l.date <= today());
  const latest = records.filter((l) => l.date <= today()).at(-1);
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(10);
  const format = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const reset = () => { setDate(today()); setWeight(''); setEditing(null); setError(''); };
  const change = filtered.length > 1 ? filtered.at(-1)!.weight_kg! - filtered[0].weight_kg! : null;
  return <section className="glass card" id="peso">
    <div className="card-title"><h3><Scale size={16} /> Meu peso</h3>{latest && <span className="tag tnum">{format(latest.weight_kg!)} kg</span>}</div>
    <p className="small muted">{latest ? `Última pesagem: ${fromISO(latest.date).toLocaleDateString('pt-BR')}.` : 'Registre seu peso com a data para acompanhar a evolução.'} Um registro por dia.</p>
    <form className="weight-form" onSubmit={(event) => {
      event.preventDefault();
      const kg = Number(weight.trim().replace(',', '.'));
      if (!date || date > today() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || !Number.isFinite(kg) || kg <= 0 || kg > 500) { setError('Informe uma data até hoje e um peso entre 0 e 500 kg.'); return; }
      const existing = useStore.getState().day_logs[dayLogId(date)];
      if (date !== editing && existing?.weight_kg != null && !existing.deleted && !confirm('Já existe uma pesagem nesta data. Substituir o peso?')) return;
      if (editing && editing !== date) setDayLog(editing, { weight_kg: null });
      setDayLog(date, { weight_kg: Math.round(kg * 100) / 100 });
      toast(editing ? 'Pesagem atualizada.' : 'Peso registrado.');
      reset();
    }}>
      <label className="field"><span>Data da pesagem</span><input aria-label="Data da pesagem" className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label className="field"><span>Peso (kg)</span><input aria-label="Peso em kg" className="input" inputMode="decimal" placeholder="Ex.: 82,5" value={weight} onChange={(e) => { setWeight(e.target.value); setError(''); }} required /></label>
      <button className="btn btn-primary" type="submit">{editing ? 'Salvar pesagem' : 'Registrar peso'}</button>
      {editing && <button className="btn btn-ghost" type="button" onClick={reset}>Cancelar edição</button>}
    </form>
    {error && <p className="small" role="alert">{error}</p>}
    {!compact && <>
      <div className="row" style={{ marginTop: 24 }}><h3>Evolução do peso</h3><span className="spacer" /><span className="small muted tnum">{change !== null ? `${change > 0 ? '+' : ''}${format(change)} kg no período` : 'A partir de 2 pesagens'}</span></div>
      <WorkoutChart points={filtered.map((l) => ({ date: l.date, value: l.weight_kg! }))} label="Peso" unit="kg" />
      <div className="weight-history">{[...filtered].reverse().slice(0, limit).map((l) => <div className="row" key={l.id}>
        <span className="small muted">{fromISO(l.date).toLocaleDateString('pt-BR')}</span><span className="spacer" /><b className="tnum">{format(l.weight_kg!)} kg</b>
        <button className="icon-btn sm" aria-label={`Editar peso de ${l.date}`} onClick={() => { setEditing(l.date); setDate(l.date); setWeight(String(l.weight_kg).replace('.', ',')); setError(''); }}><Pencil size={14} /></button>
        <button className="icon-btn sm" aria-label={`Excluir peso de ${l.date}`} onClick={() => {
          setDayLog(l.date, { weight_kg: null });
          if (editing === l.date) reset();
          toast('Pesagem excluída.', { label: 'Desfazer', run: () => setDayLog(l.date, { weight_kg: l.weight_kg }) });
        }}><Trash2 size={14} /></button>
      </div>)}</div>
      {filtered.length > limit && <button className="btn btn-sm" onClick={() => setLimit((n) => n + 20)}>Mais pesagens</button>}
    </>}
  </section>;
}

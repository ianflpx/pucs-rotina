import { useEffect, useRef, useState } from 'react';
import { fromISO } from '../lib/dates';

export interface ChartPoint { date: string; value: number }
const dateLabel = (date: string) => fromISO(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function WorkoutChart({ points, label, unit, bars = false }: { points: ChartPoint[]; label: string; unit: string; bars?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [hasPoints]);
  if (!points.length) return <div className="report-empty">Sem registros neste período. Seus dados vão aparecer aqui.</div>;
  const W = width, H = 220, L = 56, R = 22, T = 20, B = 32;
  const min = bars ? 0 : Math.max(0, Math.min(...points.map((p) => p.value)) * 0.95);
  const peak = Math.max(min + 1, ...points.map((p) => p.value));
  const max = bars ? Math.max(3, Math.ceil(peak / 3) * 3) : peak * 1.05;
  const times = points.map((p) => fromISO(p.date).getTime());
  const first = times[0], span = times.at(-1)! - first;
  const x = (i: number) => span ? L + ((times[i] - first) / span) * (W - L - R) : (W + L - R) / 2;
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B);
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const selected = active !== null ? points[active] : undefined;
  return <div className="workout-chart" ref={root}>
    <div className="chart-reading small muted" aria-live="polite">{selected ? `${dateLabel(selected.date)} · ${n(selected.value)} ${unit}` : 'Toque nos pontos para ver os valores.'}</div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${points.length} registros. Valores na tabela abaixo.`}>
      {[0, 1, 2, 3].map((i) => {
        const value = min + ((max - min) * i) / 3;
        return <g key={i}><line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x={L - 8} y={y(value) + 4} textAnchor="end">{n(value)}</text></g>;
      })}
      {!bars && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--hot)" strokeWidth="3" strokeLinejoin="round" />}
      {points.map((p, i) => <g key={p.date} tabIndex={0} role="button" aria-label={`${dateLabel(p.date)}: ${n(p.value)} ${unit}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i); } }}>
        <title>{dateLabel(p.date)}: {n(p.value)} {unit}</title>
        {bars ? <rect x={x(i) - Math.min(18, (W - L - R) / points.length / 3)} y={y(p.value)} width={Math.min(36, (W - L - R) / points.length * 0.65)} height={Math.max(0, y(0) - y(p.value))} rx="4" fill="var(--hot)" /> : <><circle cx={x(i)} cy={y(p.value)} r="15" fill="transparent" /><circle cx={x(i)} cy={y(p.value)} r={active === i ? 6 : 4} fill="var(--hot)" /></>}
      </g>)}
      {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{dateLabel(points[i].date)}</text>)}
    </svg>
    {points.length === 1 && <p className="small muted">Primeiro registro. A linha de evolução aparece a partir do segundo.</p>}
    <details className="chart-values"><summary>Ver valores</summary><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Data</th><th>{label} ({unit})</th></tr></thead><tbody>{points.map((p) => <tr key={p.date}><td>{fromISO(p.date).toLocaleDateString('pt-BR')}</td><td>{n(p.value)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

import { motion } from 'framer-motion';
import { Droplets, Minus, Plus } from 'lucide-react';
import { celebrate, dayLogId, setDayLog } from '../lib/actions';
import { addDays, fromISO, startOfWeek, today, weekday, WEEKDAYS_SHORT } from '../lib/dates';
import { usePrefs, useRow } from '../lib/store';
import { chime } from '../lib/fx';
import { CountUp } from './ui';

export function useDayLog(date: string) {
  return useRow('day_logs', dayLogId(date));
}

export function WaterCard({ date = today() }: { date?: string }) {
  const log = useDayLog(date);
  const prefs = usePrefs();
  const ml = log?.water_ml ?? 0;
  const pct = Math.min(1, ml / prefs.water_goal);
  const add = (n: number) => {
    const next = Math.max(0, ml + n);
    if (ml < prefs.water_goal && next >= prefs.water_goal) {
      celebrate('small');
      if (prefs.sound) chime();
    }
    setDayLog(date, { water_ml: next });
  };
  const goal = (prefs.water_goal / 1000).toFixed(1).replace('.', ',');
  return (
    <div className="glass card" style={{ padding: '14px 18px' }}>
      <div className="water-row">
        <Droplets size={16} color="#d4d4dc" />
        <span style={{ fontWeight: 600, color: '#dcdcea' }}>Água</span>
        <span className="display tnum" style={{ fontSize: 20, marginLeft: 4 }}>
          <CountUp value={ml / 1000} decimals={2} />
        </span>
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>/ {goal} L</span>
        <span className="water-btns">
        <button className="icon-btn sm" onClick={() => add(-250)} aria-label="Tirar 250 ml" disabled={!ml}>
          <Minus size={14} />
        </button>
        <motion.button whileTap={{ scale: 0.92 }} className="btn btn-primary btn-sm" onClick={() => add(250)}>
          <Plus size={13} /> 250
        </motion.button>
        <motion.button whileTap={{ scale: 0.92 }} className="btn btn-sm" onClick={() => add(500)}>
          +500
        </motion.button>
        </span>
      </div>
      <div className="bar" style={{ height: 4, marginTop: 12 }}>
        <i style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #c7c7d1, #ffffff)' }} />
      </div>
    </div>
  );
}

/** Faixa da semana (seg→dom) para escolher o dia. */
export function WeekPicker({
  value,
  onChange,
  sub,
  done,
}: {
  value: string;
  onChange: (d: string) => void;
  sub?: (d: string) => string;
  done?: (d: string) => boolean;
}) {
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(value), i));
  return (
    <div className="week-strip glass" style={{ padding: 6 }}>
      {days.map((d) => (
        <button key={d} className={`day-pill ${d === value ? 'sel' : ''} ${d === t ? 'is-today' : ''}`} onClick={() => onChange(d)}>
          {done?.(d) && <span className="pip" />}
          <span className="wd">{WEEKDAYS_SHORT[weekday(d)]}</span>
          <span className="n">{fromISO(d).getDate()}</span>
          {sub && <span className="sub">{sub(d)}</span>}
        </button>
      ))}
    </div>
  );
}

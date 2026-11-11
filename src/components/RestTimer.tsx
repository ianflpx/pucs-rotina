import { motion } from 'framer-motion';
import { Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../lib/actions';
import { chime } from '../lib/fx';
import { cancelRest, extendRest, finishRest, useRest } from '../lib/rest';
import { usePrefs } from '../lib/store';

export function RestTimer() {
  const rest = useRest((s) => s.rest);
  const prefs = usePrefs();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rest) return;
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [rest?.id]);
  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (!rest || left > 0 || rest.alerted || Date.now() < rest.endsAt) return;
    // Marcar antes de emitir, inclusive no StrictMode e após recarregar.
    useRest.setState({ rest: { ...rest, alerted: true } });
    if (Date.now() - rest.endsAt > 120_000) return;
    void finishRest(rest).then((claimed) => {
      if (!claimed || useRest.getState().rest?.id !== rest.id) return;
      if (prefs.sound) chime();
      navigator.vibrate?.([80, 60, 80]);
      toast('Descanso acabou. Bora para a próxima série!');
    });
  }, [rest, left, prefs.sound]);
  if (!rest) return null;
  return <motion.div className="rest-pill" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
    <span className="ex-num"><Timer size={18} /></span>
    <div style={{ minWidth: 0 }}>
      <Link to={`/treino?data=${rest.date}`} className="small muted">{left ? 'Descanso' : 'Descanso acabou'}</Link>
      <div className="display tnum" style={{ fontSize: 24 }} role="timer" aria-label="Tempo restante">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
      {left > 0 && !rest.remote && <div className="small muted">Mantenha o app aberto</div>}
    </div>
    <span className="spacer" />
    <button className="btn btn-sm" onClick={extendRest}>+30s</button>
    <button className="icon-btn" aria-label="Cancelar descanso" onClick={cancelRest}><X size={16} /></button>
  </motion.div>;
}

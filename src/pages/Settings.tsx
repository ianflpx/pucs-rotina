import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Briefcase,
  CalendarClock,
  Check,
  Circle,
  Database,
  Download,
  Dumbbell,
  Footprints,
  Keyboard,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Trash2,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncPill, SHORTCUTS } from '../components/Shell';
import { BrandMark } from '../components/ui';
import { setPrefs, toast } from '../lib/actions';
import { hmToMinutes, minutesToHM } from '../lib/dates';
import { uid } from '../lib/ids';
import { usePrefs, useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { signOut, syncNow, useSync } from '../lib/sync';
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push';
import type { RoutineBlock } from '../lib/types';
import { TABLES } from '../lib/types';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message === 'Email not confirmed' ? 'Confirme o e-mail pelo link que chegou na sua caixa.' : 'E-mail ou senha incorretos.');
  };
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 10 }}>
      <div className="field">
        <label>E-mail</label>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label>Senha</label>
        <input className="input" type="password" autoComplete="current-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {msg && <div className="small" style={{ color: '#ff9a9d' }}>{msg}</div>}
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Aguarde…' : 'Entrar'}
      </button>
    </form>
  );
}

export function AuthScreen() {
  return (
    <>
      <div className="bg-layer">
        <div className="glow-a" />
        <div className="glow-b" />
        <div className="glow-c" />
        <div className="noise" />
      </div>
      <div className="auth">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <motion.div style={{ color: 'var(--hot)', display: 'inline-block' }} animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
              <BrandMark size={44} />
            </motion.div>
            <div className="logo grad" style={{ marginTop: 10 }}>PUCS</div>
          </div>
          <div className="glass auth-card">
            <AuthForm />
          </div>
        </motion.div>
      </div>
    </>
  );
}

const KINDS: { value: RoutineBlock['kind']; label: string; icon: LucideIcon }[] = [
  { value: 'cardio', label: 'Cardio', icon: Footprints },
  { value: 'work', label: 'Trabalho', icon: Briefcase },
  { value: 'meal', label: 'Refeição', icon: Utensils },
  { value: 'workout', label: 'Treino', icon: Dumbbell },
  { value: 'sleep', label: 'Sono', icon: Moon },
  { value: 'other', label: 'Outro', icon: Circle },
];

/** Linha com texto à esquerda e chave liga/desliga à direita. */
function SwitchRow({ title, desc, on, onChange }: { title: string; desc?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="switch-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="sw-text">
        <b>{title}</b>
        {desc && <small>{desc}</small>}
      </span>
      <span className={`switch ${on ? 'on' : ''}`}>
        <i />
      </span>
    </button>
  );
}

/** "3h", "1h15", "45min": como a duração aparece no campo. */
function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Aceita "3h", "1h30", "1:30", "1,5h", "90min" ou só "90" (minutos). */
function parseDuration(txt: string): number | null {
  const s = txt.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let m = s.match(/^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 60) + Number(m[2] ?? 0);
  m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+)(?:m|min)?$/);
  if (m) return Number(m[1]);
  return null;
}

function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const commit = () => {
    if (txt === null) return;
    const v = parseDuration(txt);
    if (v !== null && v > 0) onChange(v);
    setTxt(null);
  };
  return (
    <input
      className="input tnum"
      aria-label="Duração"
      title="Ex.: 3h, 1h30, 45min"
      placeholder="1h30"
      inputMode="text"
      value={txt ?? fmtDuration(minutes)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = parseDuration(e.target.value);
        if (v !== null && v > 0) onChange(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function RoutineEditor() {
  const prefs = usePrefs();
  const [list, setList] = useState<RoutineBlock[]>(prefs.routine);
  const dirty = JSON.stringify(list) !== JSON.stringify(prefs.routine);
  // a rotina pode chegar do banco depois de abrir a tela: sem edição pendente, acompanha
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setList(prefs.routine);
  }, [prefs.routine, touched]);
  const edit = (fn: (l: RoutineBlock[]) => RoutineBlock[]) => {
    setTouched(true);
    setList(fn);
  };
  const patch = (i: number, p: Partial<RoutineBlock>) => edit((l) => l.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const save = () => {
    const sorted = [...list].sort((a, b) => a.time.localeCompare(b.time));
    setPrefs({ routine: sorted });
    setList(sorted);
    setTouched(false);
    toast('Rotina salva');
  };
  const lastEnd = list.length ? minutesToHM(Math.max(...list.map((b) => hmToMinutes(b.time) + b.minutes))) : '08:00';
  return (
    <div className="glass card">
      <div className="card-title top">
        <div>
          <h3><CalendarClock size={16} color="#ff7a4d" /> Rotina do dia</h3>
          <div className="card-sub">Os blocos aparecem no Painel e avisam na hora de começar.</div>
        </div>
        <button className={`btn btn-sm ${dirty ? 'btn-hot' : 'btn-ghost'}`} disabled={!dirty} onClick={save}>
          {dirty ? 'Salvar' : <><Check size={14} /> Salvo</>}
        </button>
      </div>
      <div className="rt-edit rt-head" aria-hidden>
        <span />
        <span>Início</span>
        <span>Bloco</span>
        <span>Tipo</span>
        <span>Duração</span>
        <span>Termina</span>
        <span />
      </div>
      {list.map((b, i) => {
        const K = KINDS.find((k) => k.value === b.kind) ?? KINDS[5];
        return (
          <div key={b.id} className="rt-edit">
            <span className="rt-kind" title={K.label}><K.icon size={15} /></span>
            <input className="input tnum" type="time" aria-label="Início" value={b.time} onChange={(e) => patch(i, { time: e.target.value })} />
            <input className="input" aria-label="Nome do bloco" placeholder="Nome do bloco" value={b.label} onChange={(e) => patch(i, { label: e.target.value })} />
            <select className="select" aria-label="Tipo" value={b.kind} onChange={(e) => patch(i, { kind: e.target.value as RoutineBlock['kind'] })}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <DurationInput minutes={b.minutes} onChange={(m) => patch(i, { minutes: m })} />
            <div className="rt-end">
              <b className="tnum">{minutesToHM(hmToMinutes(b.time) + b.minutes)}</b>
            </div>
            <button className="icon-btn" title="Remover bloco" aria-label="Remover bloco" onClick={() => edit((l) => l.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button className="inline-add" onClick={() => edit((l) => [...l, { id: uid(), time: lastEnd, label: '', kind: 'other', minutes: 30 }])}>
        <span className="plus"><Plus size={15} /></span> Adicionar bloco
      </button>
    </div>
  );
}

export function NotificationsCard() {
  const prefs = usePrefs();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => pushState().then(setState);
  useEffect(() => {
    refresh();
  }, []);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const routineOn = prefs.notify_routine !== false;
  const tasksOn = prefs.notify_tasks !== false;
  return (
    <div className="glass card">
      <div className="card-title">
        <h3><Bell size={16} color="#ff7a4d" /> Notificações</h3>
        {state === 'on' && <span className="st-tag done">Ativas neste aparelho</span>}
      </div>
      {state === 'needs-install' && (
        <div className="small muted">
          No iPhone, as notificações só funcionam com o PUCS na tela de início. No Safari, toque em <b style={{ color: '#fff' }}>Compartilhar → Adicionar à Tela de Início</b>,
          abra o PUCS pelo ícone e volte aqui.
        </div>
      )}
      {state === 'unsupported' && <div className="small muted">Este navegador não aceita notificações.</div>}
      {state === 'denied' && <div className="small muted">As notificações estão bloqueadas. Libere em Ajustes do aparelho → Notificações → PUCS.</div>}
      {(state === 'off' || state === 'on') && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="card-sub" style={{ marginTop: -8 }}>Chegam mesmo com o app fechado.</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {state === 'off' ? (
              <button className="btn btn-hot" disabled={busy} onClick={() => run(async () => { await enablePush(); await sendTestPush(); }, 'Notificações ativadas')}>
                <Bell size={15} /> Ativar notificações neste aparelho
              </button>
            ) : (
              <>
                <button className="btn btn-sm" disabled={busy} onClick={() => run(sendTestPush, 'Teste enviado')}>
                  <Send size={14} /> Enviar teste
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(disablePush, 'Notificações desligadas neste aparelho')}>
                  <BellOff size={14} /> Desligar aqui
                </button>
              </>
            )}
          </div>
          <div className="switch-list">
            <SwitchRow title="Horários da rotina" desc="Aviso no começo de cada bloco do dia" on={routineOn} onChange={(v) => setPrefs({ notify_routine: v })} />
            <SwitchRow title="Tarefas com hora" desc="Aviso na hora marcada e nos lembretes" on={tasksOn} onChange={(v) => setPrefs({ notify_tasks: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const prefs = usePrefs();
  const { session, lastSync, error } = useSync();
  const dirty = useStore((s) => Object.keys(s.dirty).length);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="display h1 grad">Ajustes</h1>
        <p>Conta, preferências, avisos e a rotina que aparece no Painel.</p>
      </div>
      <div className="stack">
        {session && (
          <div className="glass card acct">
            <div className="avatar">{(prefs.name || 'I').trim().charAt(0).toUpperCase()}</div>
            <div className="acct-info">
              <b>{prefs.name}</b>
              <div className="small muted acct-mail">{session.user.email}</div>
              <div className="small dim">
                {error ? (
                  <span style={{ color: '#ff9a9d' }}>{error}</span>
                ) : (
                  <>
                    Salvo na nuvem
                    {lastSync ? ` · sincronizado às ${new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    {dirty ? ` · ${dirty} na fila` : ''}
                  </>
                )}
              </div>
            </div>
            <div className="row acct-act">
              <SyncPill />
              <button className="btn btn-sm" onClick={() => syncNow()}>
                <RefreshCw size={14} /> Sincronizar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
        )}

        <div className="glass card">
          <div className="card-title"><h3><SlidersHorizontal size={16} color="#ff7a4d" /> Preferências</h3></div>
          <div className="grid grid-3">
            <div className="field">
              <label>Seu nome</label>
              <input className="input" defaultValue={prefs.name} onBlur={(e) => setPrefs({ name: e.target.value.trim() || '' })} />
            </div>
            <div className="field">
              <label>Meta de água</label>
              <span className="unit-input">
                <input className="input tnum" type="number" step={250} defaultValue={prefs.water_goal} onBlur={(e) => setPrefs({ water_goal: Number(e.target.value) || 3000 })} />
                <span>ml</span>
              </span>
            </div>
            <div className="field">
              <label>Cardio diário</label>
              <span className="unit-input">
                <input className="input tnum" type="number" step={5} defaultValue={prefs.cardio_goal} onBlur={(e) => setPrefs({ cardio_goal: Number(e.target.value) || 30 })} />
                <span>min</span>
              </span>
            </div>
          </div>
          <div className="switch-list" style={{ marginTop: 14 }}>
            <SwitchRow title="Sons e vibração" desc="Ao concluir tarefas, refeições e treino" on={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
          </div>
        </div>

        <NotificationsCard />

        <RoutineEditor />

        <div className="grid grid-2 top">
          <div className="glass card">
            <div className="card-title"><h3><Database size={16} color="#ff7a4d" /> Dados</h3></div>
            <div className="card-sub" style={{ marginTop: -8, marginBottom: 14 }}>Um arquivo com tudo: tarefas, dieta, treino e finanças.</div>
            <button
              className="btn btn-sm"
              onClick={() => {
                const s = useStore.getState();
                const data = Object.fromEntries(TABLES.map((t) => [t, Object.values(s[t])]));
                const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `pucs-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={14} /> Exportar backup
            </button>
          </div>

          <div className="glass card kbd-card">
            <div className="card-title"><h3><Keyboard size={16} color="#ff7a4d" /> Atalhos</h3></div>
            {SHORTCUTS.map(([k, l]) => (
              <div key={k} className="row small" style={{ padding: '5px 0' }}>
                <span style={{ flex: 1 }} className="muted">{l}</span>
                {k.split('  ').map((x) => (
                  <span key={x} className="kbd">{x}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

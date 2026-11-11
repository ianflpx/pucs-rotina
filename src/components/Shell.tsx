import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Dumbbell,
  FolderKanban,
  Inbox,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  Settings,
  Sprout,
  Sun,
  Tag,
  UtensilsCrossed,
  Wallet,
  Keyboard,
  ChartNoAxesCombined,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useToasts, useUI } from '../lib/actions';
import { today } from '../lib/dates';
import { fold } from '../lib/parse';
import { useRows } from '../lib/store';
import { useSync } from '../lib/sync';
import { Composer } from './Composer';
import { TaskModal } from './TaskModal';
import { BrandMark } from './ui';
import { RestTimer } from './RestTimer';

function useCounts() {
  const tasks = useRows('tasks');
  return useMemo(() => {
    const open = tasks.filter((t) => !t.completed_at && !t.parent_id);
    const t = today();
    return {
      inbox: open.filter((x) => !x.project_id).length,
      today: open.filter((x) => x.due_date && x.due_date <= t).length,
    };
  }, [tasks]);
}

export function SyncPill() {
  // Só aparece quando algo deu errado; sincronizado é o estado normal e não precisa de aviso.
  const status = useSync((s) => s.status);
  if (status !== 'error') return null;
  return (
    <span className="sync-pill error" style={{ padding: '8px 10px 2px' }}>
      <i /> Erro ao salvar, tentando de novo
    </span>
  );
}

function Sidebar() {
  const counts = useCounts();
  const open = useUI((s) => s.nav);
  const loc = useLocation();
  const close = () => useUI.setState({ nav: false });
  const item = (to: string, icon: ReactNode, label: string, count?: number) => (
    <NavLink to={to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={close}>
      {icon}
      <span>{label}</span>
      {!!count && <span className="count">{count}</span>}
    </NavLink>
  );
  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />}
      </AnimatePresence>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={close} aria-label="Ir para o Painel">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <div className="brand-name grad">PUCS</div>
        </Link>
        <button
          className="add-btn"
          onClick={() => {
            close();
            useUI.setState({ quickAdd: {} });
          }}
        >
          <span className="plus">
            <Plus size={15} strokeWidth={3} />
          </span>
          Adicionar tarefa
          <span className="kbd" style={{ marginLeft: 'auto' }}>
            Q
          </span>
        </button>
        <button className="nav-item" onClick={() => { close(); useUI.setState({ palette: true }); }}>
          <Search size={17} /> <span>Buscar</span>
          <span className="count">Ctrl K</span>
        </button>
        {item('/', <LayoutGrid size={17} />, 'Painel')}

        <div className="nav-section">Tarefas</div>
        {item('/entrada', <Inbox size={17} />, 'Entrada', counts.inbox)}
        {item('/hoje', <Sun size={17} />, 'Hoje', counts.today)}
        {item('/calendario', <CalendarDays size={17} />, 'Calendário')}
        {item('/etiquetas', <Tag size={17} />, 'Etiquetas')}
        <NavLink
          to="/projetos"
          className={({ isActive }) => `nav-item ${isActive || loc.pathname.startsWith('/projeto/') ? 'active' : ''}`}
          onClick={close}
        >
          <FolderKanban size={17} />
          <span>Projetos</span>
        </NavLink>


        <div className="nav-section">Rotina</div>
        {item('/dieta', <UtensilsCrossed size={17} />, 'Dieta')}
        {item('/treino', <Dumbbell size={17} />, 'Treino')}
        {item('/relatorio-treino', <ChartNoAxesCombined size={17} />, 'Relatório de treino')}
        {item('/habitos', <Sprout size={17} />, 'Hábitos')}
        {item('/financeiro', <Wallet size={17} />, 'Financeiro')}

        <div className="sidebar-foot">
          {item('/ajustes', <Settings size={17} />, 'Ajustes')}
          <button className="nav-item" onClick={() => useUI.setState({ help: true })}>
            <Keyboard size={17} /> <span>Atalhos</span>
            <span className="count">?</span>
          </button>
          <SyncPill />
        </div>
      </aside>
    </>
  );
}

function MobileChrome() {
  const loc = useLocation();
  const titles: Record<string, string> = {
    '/': 'Painel',
    '/entrada': 'Entrada',
    '/hoje': 'Hoje',
    '/calendario': 'Calendário',
    '/dieta': 'Dieta',
    '/treino': 'Treino',
    '/relatorio-treino': 'Relatório de treino',
    '/habitos': 'Hábitos',
    '/financeiro': 'Financeiro',
    '/ajustes': 'Ajustes',
    '/etiquetas': 'Etiquetas',
    '/projetos': 'Projetos',
  };
  const tab = (to: string, icon: ReactNode, label: string) => (
    <NavLink to={to} end className={({ isActive }) => (isActive ? 'active' : '')}>
      {icon}
      {label}
    </NavLink>
  );
  return (
    <>
      <div className="mobile-top">
        <button className="icon-btn" onClick={() => useUI.setState({ nav: true })}>
          <Menu size={20} />
        </button>
        <span className="brand-mark" style={{ width: 22 }}>
          <BrandMark size={20} />
        </span>
        <b style={{ fontFamily: 'var(--display)', letterSpacing: '-0.02em' }}>{titles[loc.pathname] ?? 'PUCS'}</b>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => useUI.setState({ palette: true })}>
          <Search size={19} />
        </button>
      </div>
      <nav className="tabbar">
        {tab('/', <LayoutGrid size={20} />, 'Painel')}
        {tab('/hoje', <Sun size={20} />, 'Hoje')}
        <button className="tab-add" onClick={() => useUI.setState({ quickAdd: {} })}>
          <span>
            <Plus size={22} strokeWidth={2.6} />
          </span>
        </button>
        {tab('/dieta', <UtensilsCrossed size={20} />, 'Dieta')}
        {tab('/treino', <Dumbbell size={20} />, 'Treino')}
      </nav>
    </>
  );
}

function QuickAddModal() {
  const qa = useUI((s) => s.quickAdd);
  const close = () => useUI.setState({ quickAdd: null });
  return (
    <AnimatePresence>
      {qa && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            className="modal"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Composer defaults={qa} onClose={close} keepOpen={false} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Palette() {
  const open = useUI((s) => s.palette);
  const tasks = useRows('tasks');
  const projects = useRows('projects');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const close = () => {
    useUI.setState({ palette: false });
    setQ('');
    setSel(0);
  };
  const pages = [
    ['Painel', '/'],
    ['Entrada', '/entrada'],
    ['Hoje', '/hoje'],
    ['Calendário', '/calendario'],
    ['Projetos', '/projetos'],
    ['Dieta', '/dieta'],
    ['Treino', '/treino'],
    ['Relatório de treino e peso', '/relatorio-treino'],
    ['Hábitos', '/habitos'],
    ['Financeiro', '/financeiro'],
    ['Ajustes', '/ajustes'],
    ...projects.map((p) => [`# ${p.name}`, `/projeto/${p.id}`]),
  ];
  const f = fold(q);
  const results = [
    ...pages.filter(([l]) => fold(l).includes(f)).map(([l, to]) => ({ key: to, label: l, kind: 'Ir para', run: () => nav(to) })),
    ...(f
      ? tasks
          .filter((t) => fold(t.title).includes(f) || fold(t.description ?? '').includes(f))
          .slice(0, 12)
          .map((t) => ({
            key: t.id,
            label: t.title,
            kind: t.completed_at ? 'Concluída' : 'Tarefa',
            run: () => useUI.setState({ openTask: t.id }),
          }))
      : []),
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="palette-input">
              <Search size={18} className="dim" />
              <input
                className="bare"
                autoFocus
                placeholder="Buscar tarefas ou ir para…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                  if (e.key === 'Enter' && results[sel]) { results[sel].run(); close(); }
                  if (e.key === 'Escape') close();
                }}
              />
            </div>
            <div className="palette-list">
              {results.map((r, i) => (
                <button key={r.key} className={`menu-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => { r.run(); close(); }}>
                  {r.label}
                  <span className="hint">{r.kind}</span>
                </button>
              ))}
              {!results.length && <div className="small dim" style={{ padding: 12 }}>Nada encontrado.</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['Q', 'Adicionar tarefa'],
  ['Ctrl K  ou  /', 'Buscar'],
  ['G  P', 'Ir para o Painel'],
  ['G  I', 'Ir para a Entrada'],
  ['G  H', 'Ir para Hoje'],
  ['G  C', 'Ir para o Calendário'],
  ['G  D', 'Ir para Dieta'],
  ['G  T', 'Ir para Treino'],
  ['G  B', 'Ir para Hábitos'],
  ['G  F', 'Ir para Financeiro'],
  ['↑ ↓', 'Navegar entre tarefas abertas'],
  ['Enter', 'Salvar no campo de criação'],
  ['Esc', 'Fechar'],
  ['?', 'Esta lista'],
];

function Help() {
  const open = useUI((s) => s.help);
  const close = () => useUI.setState({ help: false });
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div className="modal" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Keyboard size={15} /> Atalhos de teclado
            </div>
            <div style={{ padding: 10 }}>
              {SHORTCUTS.map(([k, l]) => (
                <div key={k} className="menu-item">
                  {l}
                  <span className="hint row" style={{ gap: 4 }}>
                    {k.split('  ').map((x) => (
                      <span key={x} className="kbd">{x}</span>
                    ))}
                  </span>
                </div>
              ))}
              <div className="small muted" style={{ padding: '10px 10px 4px' }}>
                No campo de criação: <b>amanhã 15h</b>, <b>sexta</b>, <b>15/11</b>, <b>dia 5</b>, <b>p1</b>, <b>#Projeto</b>, <b>@etiqueta</b>,{' '}
                <b>todo dia</b>, <b>toda segunda e quinta</b>, <b>dias úteis</b>, <b>todo dia 10</b>.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
          >
            {t.text}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function useShortcuts() {
  const nav = useNavigate();
  const g = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUI.setState({ palette: true });
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUI.getState();
      if (ui.quickAdd || ui.palette || ui.openTask) return;
      const k = e.key.toLowerCase();
      if (Date.now() - g.current < 1200) {
        g.current = 0;
        const map: Record<string, string> = { p: '/', i: '/entrada', h: '/hoje', c: '/calendario', d: '/dieta', t: '/treino', b: '/habitos', f: '/financeiro' };
        if (map[k]) {
          e.preventDefault();
          nav(map[k]);
        }
        return;
      }
      if (k === 'g') g.current = Date.now();
      else if (k === 'q' || k === 'a') {
        e.preventDefault();
        useUI.setState({ quickAdd: {} });
      } else if (k === '/') {
        e.preventDefault();
        useUI.setState({ palette: true });
      } else if (e.key === '?') useUI.setState({ help: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}

export function Shell({ children }: { children: ReactNode }) {
  useShortcuts();
  const loc = useLocation();
  return (
    <>
      <div className="bg-layer">
        <div className="glow-a" />
        <div className="glow-b" />
        <div className="glow-c" />
        <div className="noise" />
      </div>
      <div className="app">
        <Sidebar />
        <MobileChrome />
        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <QuickAddModal />
      <TaskModal />
      <Palette />
      <Help />
      <Toasts />
      <RestTimer />
    </>
  );
}

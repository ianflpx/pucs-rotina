import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Hash, MoreHorizontal, Plus, Search, Tag, Trash2, Pencil, CheckCircle2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TaskItem, TaskList } from '../components/TaskItem';
import { Popover, useAnchor } from '../components/ui';
import { createProject, PRIORITY_COLORS, resolveLabels, toast, updateTask, useUI } from '../lib/actions';
import { fromISO, labelDate, longDate, MONTHS, monthMatrix, today, weekday, WEEKDAYS_SHORT } from '../lib/dates';
import { fold } from '../lib/parse';
import { useRows, useStore } from '../lib/store';
import type { Task } from '../lib/types';

function Head({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row">
        <h1 className="display h1 grad">{title}</h1>
        {right}
      </div>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="orb">
        <CheckCircle2 size={36} color="#fff" strokeWidth={1.6} />
      </div>
      <h3>{title}</h3>
      <div>{text}</div>
    </motion.div>
  );
}

function CompletedToggle({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        <CheckCircle2 size={14} /> {open ? 'Ocultar' : 'Mostrar'} concluídas ({tasks.length})
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            {[...tasks]
              .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
              .slice(0, 50)
              .map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const top = (list: Task[]) => list.filter((t) => !t.parent_id);

export function InboxPage() {
  const tasks = top(useRows('tasks').filter((t) => !t.project_id));
  const open = tasks.filter((t) => !t.completed_at);
  return (
    <div className="page">
      <Head title="Entrada" sub={`${open.length} tarefa${open.length === 1 ? '' : 's'}`} />
      <TaskList tasks={open} showProject={false} addDefaults={{ project_id: null }} />
      {!open.length && <Empty title="Entrada zerada" text="Tudo que chega sem projeto cai aqui. Aperte Q para capturar." />}
      <CompletedToggle tasks={tasks.filter((t) => t.completed_at)} />
    </div>
  );
}

export function TodayPage() {
  const t = today();
  const tasks = top(useRows('tasks'));
  const overdue = tasks.filter((x) => !x.completed_at && x.due_date && x.due_date < t);
  const todays = tasks.filter((x) => !x.completed_at && x.due_date === t);
  const doneToday = tasks.filter((x) => x.completed_at && x.completed_at.slice(0, 10) === t);
  const total = todays.length + overdue.length;
  return (
    <div className="page">
      <Head
        title="Hoje"
        sub={
          <span className="row" style={{ gap: 14 }}>
            <span>{longDate(t)}</span>
            <span className="dim">·</span>
            <span>
              <CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> {total} pendente{total === 1 ? '' : 's'} · {doneToday.length} feita
              {doneToday.length === 1 ? '' : 's'}
            </span>
          </span>
        }
      />
      {overdue.length > 0 && (
        <div className="task-group">
          <div className="group-head">
            <h4>Atrasadas</h4>
            <span className="muted">{overdue.length}</span>
            <button
              className="act"
              onClick={() => {
                overdue.forEach((x) => updateTask(x.id, { due_date: t }));
                toast(`${overdue.length} tarefa(s) reagendada(s) para hoje`);
              }}
            >
              Reagendar
            </button>
          </div>
          <TaskList tasks={overdue} addDefaults={false} />
        </div>
      )}
      <div className="task-group">
        <div className="group-head">
          <h4 style={{ textTransform: 'capitalize' }}>
            {fromISO(t).getDate()} {MONTHS[fromISO(t).getMonth()].slice(0, 3)} · Hoje · {WEEKDAYS_SHORT[weekday(t)]}
          </h4>
          <span className="muted">{todays.length}</span>
        </div>
        <TaskList tasks={todays} showDate={false} addDefaults={{ due_date: t }} />
      </div>
      {!total && <Empty title="Dia limpo" text={doneToday.length ? `Você fechou ${doneToday.length} hoje. Respira.` : 'Nada vencendo hoje.'} />}
      <CompletedToggle tasks={doneToday} />
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const project = useRows('projects').find((p) => p.id === id);
  const tasks = top(useRows('tasks').filter((t) => t.project_id === id));
  const open = tasks.filter((t) => !t.completed_at);
  const menu = useAnchor();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  if (!project) return <div className="page"><Head title="Projeto não encontrado" /></div>;
  return (
    <div className="page">
      <Head
        title={
          editing ? (
            <input
              className="bare display h1"
              autoFocus
              defaultValue={project.name}
              onBlur={(e) => {
                if (e.target.value.trim()) useStore.getState().put('projects', { id: project.id, name: e.target.value.trim() });
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <span className="row" style={{ gap: 12 }}>
              <Hash size={30} color={project.color} />
              {project.name}
            </span>
          )
        }
        sub={`${open.length} tarefa${open.length === 1 ? '' : 's'}`}
        right={
          <button ref={menu.ref} className="icon-btn" onClick={menu.toggle}>
            <MoreHorizontal size={18} />
          </button>
        }
      />
      <TaskList tasks={open} showProject={false} addDefaults={{ project_id: project.id }} />
      {!open.length && <Empty title="Projeto em dia" text="Nenhuma tarefa aberta aqui." />}
      <CompletedToggle tasks={tasks.filter((t) => t.completed_at)} />
      <Popover anchor={menu.el} open={menu.open} onClose={menu.close}>
        <div className="row" style={{ gap: 6, padding: '6px 8px' }}>
          {['#ff4d1f', '#ff7a4d', '#ffa36b', '#ffd1a6', '#f5f5f7', '#c7c7d1', '#8a8aa0', '#5f5f70'].map((c) => (
            <button
              key={c}
              className="dot"
              style={{ width: 18, height: 18, background: c, outline: c === project.color ? '2px solid #fff' : 'none', outlineOffset: 2 }}
              onClick={() => useStore.getState().put('projects', { id: project.id, color: c })}
            />
          ))}
        </div>
        <button className="menu-item" onClick={() => { setEditing(true); menu.close(); }}>
          <Pencil size={15} /> Renomear
        </button>
        <button
          className="menu-item"
          style={{ color: '#ff8a8d' }}
          onClick={() => {
            if (!confirm(`Excluir o projeto "${project.name}"? As tarefas voltam para a Entrada.`)) return;
            tasks.forEach((t) => updateTask(t.id, { project_id: null }));
            useStore.getState().remove('projects', project.id);
            nav('/entrada');
          }}
        >
          <Trash2 size={15} /> Excluir projeto
        </button>
      </Popover>
    </div>
  );
}

/** Campo único: filtra a lista enquanto digita; Enter abre o item igual ou cria um novo. */
function SearchCreate({ value, onChange, placeholder, exists, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; exists: boolean; onSubmit: () => void }) {
  const v = value.trim();
  return (
    <form
      className="glass search-create"
      onSubmit={(e) => {
        e.preventDefault();
        if (v) onSubmit();
      }}
    >
      <Search size={16} className="dim" />
      <input className="input bare" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="icon-btn sm" aria-label="Limpar" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
      <button className={`btn btn-sm ${v && !exists ? 'btn-hot' : ''}`} disabled={!v}>
        {exists ? 'Abrir' : <><Plus size={14} /> Criar</>}
      </button>
    </form>
  );
}

export function ProjectsPage() {
  const projects = useRows('projects').sort((a, b) => a.sort - b.sort);
  const tasks = useRows('tasks').filter((x) => !x.completed_at && !x.parent_id);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const f = fold(q.trim());
  const shown = f ? projects.filter((p) => fold(p.name).includes(f)) : projects;
  const exact = projects.find((p) => fold(p.name) === f);
  return (
    <div className="page">
      <Head title="Projetos" sub="Cada frente da sua vida num lugar." />
      <SearchCreate
        value={q}
        onChange={setQ}
        placeholder="Buscar ou criar projeto (ex.: Casa, Estudos)"
        exists={!!exact}
        onSubmit={() => {
          const id = exact?.id ?? createProject(q.trim());
          if (!exact) toast(`Projeto "${q.trim()}" criado`);
          setQ('');
          nav(`/projeto/${id}`);
        }}
      />
      <div className="glass" style={{ padding: 6 }}>
        {shown.map((p) => {
          const open = tasks.filter((x) => x.project_id === p.id);
          const today_ = open.filter((x) => x.due_date && x.due_date <= today()).length;
          return (
            <Link key={p.id} to={`/projeto/${p.id}`} className="menu-item" style={{ padding: '11px 12px' }}>
              <Hash size={16} color={p.color} />
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span className="hint">
                {today_ > 0 && <span style={{ color: '#ff8a5c', marginRight: 10 }}>{today_} pra hoje</span>}
                {open.length} tarefa{open.length === 1 ? '' : 's'}
              </span>
            </Link>
          );
        })}
        {!shown.length && (
          <div className="small dim" style={{ padding: 12 }}>
            {f ? <>Nenhum projeto com "{q.trim()}". Aperte Enter para criar.</> : 'Nenhum projeto ainda.'}
          </div>
        )}
      </div>
    </div>
  );
}

export function LabelsPage() {
  const labels = useRows('labels').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const tasks = useRows('tasks').filter((t) => !t.completed_at);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  // etiqueta vira @nome no campo de tarefa: sem @ e sem espaço
  const clean = q.trim().replace(/^@+/, '').replace(/\s+/g, '-');
  const f = fold(clean);
  const shown = f ? labels.filter((l) => fold(l.name).includes(f)) : labels;
  const exact = labels.find((l) => fold(l.name) === f);
  return (
    <div className="page">
      <Head title="Etiquetas" sub="Filtre tarefas por contexto." />
      <SearchCreate
        value={q}
        onChange={setQ}
        placeholder="Buscar ou criar etiqueta (ex.: casa, ligar)"
        exists={!!exact}
        onSubmit={() => {
          if (!clean) return;
          const [name] = resolveLabels([clean]);
          if (!exact) toast(`Etiqueta @${name} criada`);
          setQ('');
          nav(`/etiqueta/${encodeURIComponent(name)}`);
        }}
      />
      <div className="glass" style={{ padding: 6 }}>
        {shown.map((l) => (
          <Link key={l.id} to={`/etiqueta/${encodeURIComponent(l.name)}`} className="menu-item" style={{ padding: '11px 12px' }}>
            <Tag size={15} color={l.color} />
            <span style={{ fontWeight: 500 }}>{l.name}</span>
            <span className="hint">
              {(() => {
                const n = tasks.filter((t) => t.labels.includes(l.name)).length;
                return `${n} tarefa${n === 1 ? '' : 's'}`;
              })()}
            </span>
          </Link>
        ))}
        {!shown.length && (
          <div className="small dim" style={{ padding: 12 }}>
            {f ? <>Nenhuma etiqueta com "{clean}". Aperte Enter para criar.</> : 'Crie aqui em cima ou escrevendo @nome no campo de tarefa.'}
          </div>
        )}
      </div>
    </div>
  );
}

export function LabelPage() {
  const { name = '' } = useParams();
  const tasks = useRows('tasks').filter((t) => !t.completed_at && t.labels.some((l) => fold(l) === fold(name)));
  return (
    <div className="page">
      <Head title={`@${name}`} sub={`${tasks.length} tarefa(s)`} />
      <TaskList tasks={tasks} addDefaults={false} emptyHint="Nenhuma tarefa com essa etiqueta." />
    </div>
  );
}

function useDropDay() {
  const [over, setOver] = useState<string | null>(null);
  const bind = (day: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('text/task')) {
        e.preventDefault();
        setOver(day);
      }
    },
    onDragLeave: () => setOver((o) => (o === day ? null : o)),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData('text/task');
      setOver(null);
      if (id) {
        updateTask(id, { due_date: day });
        toast(`Movida para ${labelDate(day)}`);
      }
    },
  });
  return { over, bind };
}

export function CalendarPage() {
  const t = today();
  const [view, setView] = useState({ y: fromISO(t).getFullYear(), m: fromISO(t).getMonth() });
  const [sel, setSel] = useState(t);
  const tasks = top(useRows('tasks'));
  const weeks = useMemo(() => monthMatrix(view.y, view.m), [view]);
  const { over, bind } = useDropDay();
  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const x of tasks) if (x.due_date) (map[x.due_date] ??= []).push(x);
    for (const k in map) map[k].sort((a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || (a.due_time ?? '99').localeCompare(b.due_time ?? '99') || a.priority - b.priority);
    return map;
  }, [tasks]);
  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  return (
    <div className="page wide">
      <Head
        title={
          <span style={{ textTransform: 'capitalize' }}>
            {MONTHS[view.m]} <span className="dim" style={{ WebkitTextFillColor: 'var(--dim)' }}>{view.y}</span>
          </span>
        }
        sub="Arraste as tarefas entre os dias para reagendar."
        right={
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" onClick={() => shift(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-sm" onClick={() => setView({ y: fromISO(t).getFullYear(), m: fromISO(t).getMonth() })}>
              Hoje
            </button>
            <button className="icon-btn" onClick={() => shift(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />
      <div className="cal glass">
        <div className="cal-head">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid">
          {weeks.flat().map((d) => {
            const list = byDay[d] ?? [];
            const out = fromISO(d).getMonth() !== view.m;
            return (
              <div
                key={d}
                className={`cal-cell ${out ? 'out' : ''} ${d === t ? 'is-today' : ''} ${over === d ? 'over' : ''} ${d === sel ? 'sel' : ''}`}
                onClick={() => setSel(d)}
                {...bind(d)}
              >
                <div className="top">
                  <span className="num">{fromISO(d).getDate()}</span>
                  <button
                    className="icon-btn sm add"
                    onClick={(e) => {
                      e.stopPropagation();
                      useUI.setState({ quickAdd: { due_date: d } });
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {list.slice(0, 4).map((x) => (
                  <div
                    key={x.id}
                    className={`cal-task ${x.completed_at ? 'done' : ''}`}
                    style={{ ['--pc' as string]: PRIORITY_COLORS[x.priority] }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/task', x.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      useUI.setState({ openTask: x.id });
                    }}
                  >
                    {x.due_time && <span className="dim">{x.due_time}</span>}
                    <span className="t">{x.title}</span>
                  </div>
                ))}
                {list.length > 4 && <span className="cal-more">+{list.length - 4} mais</span>}
                {list.length > 0 && (
                  <span className="cal-dots">
                    {list.slice(0, 3).map((x) => (
                      <i key={x.id} style={{ background: x.completed_at ? 'var(--dim)' : PRIORITY_COLORS[x.priority] }} />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cal-daylist">
        <div className="group-head">
          <h4>{longDate(sel)}</h4>
          <span className="muted">{(byDay[sel] ?? []).filter((x) => !x.completed_at).length}</span>
        </div>
        <TaskList tasks={(byDay[sel] ?? []).filter((x) => !x.completed_at)} showDate={false} addDefaults={{ due_date: sel }} emptyHint="Nada neste dia." />
      </div>
    </div>
  );
}

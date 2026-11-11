import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarDays, ChevronDown, ChevronUp, Copy, Flag, Hash, Inbox, Repeat, Tag, Trash2, X, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  completeTask,
  createTask,
  deleteTask,
  PRIORITY_COLORS,
  resolveLabels,
  uncompleteTask,
  updateTask,
  useUI,
} from '../lib/actions';
import { dateTone } from '../lib/dates';
import { recurrenceLabel } from '../lib/recurrence';
import { useRow, useRows } from '../lib/store';
import type { Task } from '../lib/types';
import { Composer } from './Composer';
import { DateMenu, dueSummary, LabelMenu, PriorityMenu, ProjectMenu, ReminderMenu, reminderLabel } from './pickers';
import { sortTasks, TaskItem } from './TaskItem';
import { Check, Popover, useAnchor } from './ui';

function AutoText({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`bare ${className ?? ''}`}
      style={{ resize: 'none', overflow: 'hidden' }}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}

export function TaskModal() {
  const openId = useUI((s) => s.openTask);
  const task = useRow('tasks', openId);
  const show = !!task && !task.deleted;
  return <AnimatePresence>{show && <TaskModalInner key={task.id} task={task} />}</AnimatePresence>;
}

function TaskModalInner({ task }: { task: Task }) {
  const projects = useRows('projects');
  const all = useRows('tasks');
  const project = projects.find((p) => p.id === task.project_id);
  const parent = all.find((t) => t.id === task.parent_id);
  const subs = sortTasks(all.filter((t) => t.parent_id === task.id));
  const [addingSub, setAddingSub] = useState(false);
  const close = () => useUI.setState({ openTask: null });
  const date = useAnchor();
  const prio = useAnchor();
  const proj = useAnchor();
  const lab = useAnchor();
  const more = useAnchor();
  const rem = useAnchor();

  const siblings = sortTasks(
    all.filter((t) => !t.completed_at && t.parent_id === task.parent_id && t.project_id === task.project_id),
  );
  const idx = siblings.findIndex((t) => t.id === task.id);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      if (e.key === 'Escape' && !typing) close();
      if (typing) return;
      if ((e.key === 'ArrowDown' || e.key === 'j') && idx >= 0 && siblings[idx + 1]) useUI.setState({ openTask: siblings[idx + 1].id });
      if ((e.key === 'ArrowUp' || e.key === 'k') && idx > 0) useUI.setState({ openTask: siblings[idx - 1].id });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const tone = dateTone(task.due_date);

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
      <motion.div
        className="modal xl"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {project ? <Hash size={14} color={project.color} /> : <Inbox size={14} />}
          <span>{project?.name ?? 'Entrada'}</span>
          {parent && (
            <>
              <span className="dim">/</span>
              <button className="muted" onClick={() => useUI.setState({ openTask: parent.id })}>
                {parent.title}
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="icon-btn sm" disabled={idx <= 0} onClick={() => idx > 0 && useUI.setState({ openTask: siblings[idx - 1].id })}>
            <ChevronUp size={16} />
          </button>
          <button
            className="icon-btn sm"
            disabled={idx < 0 || idx >= siblings.length - 1}
            onClick={() => siblings[idx + 1] && useUI.setState({ openTask: siblings[idx + 1].id })}
          >
            <ChevronDown size={16} />
          </button>
          <button ref={more.ref} className="icon-btn sm" onClick={more.toggle}>
            ···
          </button>
          <button className="icon-btn sm" onClick={close}>
            <X size={16} />
          </button>
        </div>

        <div className="task-modal">
          <div className="left">
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ paddingTop: 4 }}>
                <Check
                  size="lg"
                  on={!!task.completed_at}
                  color={PRIORITY_COLORS[task.priority]}
                  onToggle={() => (task.completed_at ? uncompleteTask(task) : completeTask(task))}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutoText
                  className="title-input"
                  value={task.title}
                  onCommit={(v) => v.trim() && updateTask(task.id, { title: v.trim() })}
                />
                <AutoText
                  className="small muted"
                  placeholder="Descrição"
                  value={task.description ?? ''}
                  onCommit={(v) => updateTask(task.id, { description: v.trim() || null })}
                />
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              {subs.length > 0 && (
                <div className="group-head" style={{ marginBottom: 0 }}>
                  <h4>Subtarefas</h4>
                  <span className="muted">
                    {subs.filter((s) => s.completed_at).length}/{subs.length}
                  </span>
                </div>
              )}
              {subs.map((s) => (
                <TaskItem key={s.id} task={s} showProject={false} />
              ))}
              {addingSub ? (
                <Composer inline defaults={{ parent_id: task.id, project_id: task.project_id }} onClose={() => setAddingSub(false)} />
              ) : (
                <button className="inline-add" onClick={() => setAddingSub(true)}>
                  <span className="plus">
                    <Plus size={15} />
                  </span>
                  Adicionar subtarefa
                </button>
              )}
            </div>
          </div>

          <div className="right">
            <div className="prop">
              <label>Projeto</label>
              <button ref={proj.ref} className="prop-btn" onClick={proj.toggle}>
                {project ? <Hash size={15} color={project.color} /> : <Inbox size={15} />}
                {project?.name ?? 'Entrada'}
              </button>
            </div>
            <div className="prop">
              <label>Data</label>
              <button ref={date.ref} className="prop-btn" onClick={date.toggle}>
                <CalendarDays size={15} className={task.due_date ? `tone-${tone}` : 'dim'} />
                <span className={task.due_date ? `tone-${tone}` : 'muted'}>{dueSummary(task)}</span>
              </button>
              {task.recurrence && (
                <div className="small muted row" style={{ gap: 6, padding: '4px 8px' }}>
                  <Repeat size={13} /> {recurrenceLabel(task.recurrence)}
                </div>
              )}
            </div>
            <div className="prop">
              <label>Lembrete</label>
              <button ref={rem.ref} className="prop-btn" onClick={rem.toggle}>
                <Bell size={15} className={task.reminder_at ? '' : 'dim'} color={task.reminder_at ? '#ff7a4d' : undefined} />
                {task.reminder_at ? reminderLabel(task.reminder_at) : <span className="muted">Adicionar</span>}
              </button>
            </div>
            <div className="prop">
              <label>Prioridade</label>
              <button ref={prio.ref} className="prop-btn" onClick={prio.toggle}>
                <Flag size={15} color={PRIORITY_COLORS[task.priority]} fill={task.priority < 4 ? PRIORITY_COLORS[task.priority] : 'none'} />
                P{task.priority}
              </button>
            </div>
            <div className="prop">
              <label>Etiquetas</label>
              <button ref={lab.ref} className="prop-btn" onClick={lab.toggle}>
                <Tag size={15} className="dim" />
                {task.labels.length ? (
                  <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {task.labels.map((l) => (
                      <span key={l} className="tag">
                        {l}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="muted">Adicionar</span>
                )}
              </button>
            </div>
            <div className="spacer" />
            <div className="small dim kbd-hint" style={{ padding: '8px 6px' }}>
              <span className="kbd">↑</span> <span className="kbd">↓</span> navegar · <span className="kbd">Esc</span> fechar
            </div>
          </div>
        </div>

        <Popover anchor={date.el} open={date.open} onClose={date.close}>
          <DateMenu value={task} onChange={(v) => updateTask(task.id, v)} onDone={date.close} />
        </Popover>
        <Popover anchor={rem.el} open={rem.open} onClose={rem.close}>
          <ReminderMenu task={task} onChange={(iso) => updateTask(task.id, { reminder_at: iso })} onDone={rem.close} />
        </Popover>
        <Popover anchor={prio.el} open={prio.open} onClose={prio.close}>
          <PriorityMenu value={task.priority} onChange={(p) => { updateTask(task.id, { priority: p }); prio.close(); }} />
        </Popover>
        <Popover anchor={proj.el} open={proj.open} onClose={proj.close}>
          <ProjectMenu
            value={task.project_id}
            onChange={(p) => {
              updateTask(task.id, { project_id: p });
              subs.forEach((s) => updateTask(s.id, { project_id: p }));
              proj.close();
            }}
          />
        </Popover>
        <Popover anchor={lab.el} open={lab.open} onClose={lab.close}>
          <LabelMenu value={task.labels} onChange={(l) => updateTask(task.id, { labels: resolveLabels(l) })} />
        </Popover>
        <Popover anchor={more.el} open={more.open} onClose={more.close}>
          <button
            className="menu-item"
            onClick={() => {
              const { id: _id, updated_at: _u, ...rest } = task;
              createTask({ ...rest, title: `${task.title} (cópia)`, completed_at: null });
              more.close();
            }}
          >
            <Copy size={15} /> Duplicar
          </button>
          <button
            className="menu-item"
            style={{ color: '#ff8a8d' }}
            onClick={() => {
              deleteTask(task);
              close();
            }}
          >
            <Trash2 size={15} /> Excluir tarefa
          </button>
        </Popover>
      </motion.div>
    </motion.div>
  );
}

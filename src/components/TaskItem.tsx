import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarDays, GitBranch, Hash, Inbox, Pencil, Plus, Repeat, Tag, Trash2, AlignLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { completeTask, deleteTask, PRIORITY_COLORS, uncompleteTask, updateTask, useUI } from '../lib/actions';
import { dateTone, labelDate } from '../lib/dates';
import { useRows } from '../lib/store';
import type { Task } from '../lib/types';
import { Composer, type ComposerDefaults } from './Composer';
import { DateMenu, reminderLabel } from './pickers';
import { Check, Popover, useAnchor } from './ui';

export function TaskItem({
  task,
  showProject = true,
  showDate = true,
  draggable,
}: {
  task: Task;
  showProject?: boolean;
  showDate?: boolean;
  draggable?: boolean;
}) {
  const projects = useRows('projects');
  const all = useRows('tasks');
  const project = projects.find((p) => p.id === task.project_id);
  const subs = all.filter((t) => t.parent_id === task.id);
  const subsDone = subs.filter((t) => t.completed_at).length;
  const tone = dateTone(task.due_date);
  const date = useAnchor();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`task ${task.completed_at ? 'done' : ''} ${dragging ? 'dragging' : ''}`}
      onClick={() => useUI.setState({ openTask: task.id })}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', task.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <Check
        on={!!task.completed_at}
        color={PRIORITY_COLORS[task.priority]}
        onToggle={() => (task.completed_at ? uncompleteTask(task) : completeTask(task))}
      />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-desc">{task.description}</div>}
        <div className="task-meta">
          {showDate && task.due_date && (
            <span className={`tone-${tone}`}>
              <CalendarDays size={12} />
              {labelDate(task.due_date)}
              {task.due_time ? ` ${task.due_time}` : ''}
              {task.recurrence && <Repeat size={11} />}
            </span>
          )}
          {!showDate && task.due_time && <span>{task.due_time}</span>}
          {!showDate && task.recurrence && (
            <span>
              <Repeat size={11} />
            </span>
          )}
          {subs.length > 0 && (
            <span>
              <GitBranch size={12} /> {subsDone}/{subs.length}
            </span>
          )}
          {task.reminder_at && (
            <span style={{ color: '#ff9a6b' }}>
              <Bell size={11} /> {reminderLabel(task.reminder_at).split(' ').pop()}
            </span>
          )}
          {task.description && !showDate && (
            <span>
              <AlignLeft size={12} />
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} style={{ color: '#d4d4dc' }}>
              <Tag size={11} /> {l}
            </span>
          ))}
        </div>
      </div>
      {showProject && (
        <span className="task-project">
          {project ? project.name : 'Entrada'}
          {project ? <Hash size={12} color={project.color} /> : <Inbox size={12} />}
        </span>
      )}
      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sm" title="Editar" onClick={() => useUI.setState({ openTask: task.id })}>
          <Pencil size={14} />
        </button>
        <button ref={date.ref} className="icon-btn sm" title="Data" onClick={date.toggle}>
          <CalendarDays size={14} />
        </button>
        <button className="icon-btn sm" title="Excluir" onClick={() => deleteTask(task)}>
          <Trash2 size={14} />
        </button>
      </div>
      <Popover anchor={date.el} open={date.open} onClose={date.close}>
        <DateMenu
          value={{ due_date: task.due_date, due_time: task.due_time, recurrence: task.recurrence }}
          onChange={(v) => updateTask(task.id, v)}
          onDone={date.close}
        />
      </Popover>
    </div>
  );
}

export function sortTasks(list: Task[]): Task[] {
  return [...list].sort(
    (a, b) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      (a.due_time ?? '99').localeCompare(b.due_time ?? '99') ||
      a.priority - b.priority ||
      (a.sort ?? 0) - (b.sort ?? 0),
  );
}

export function TaskList({
  tasks,
  showProject,
  showDate,
  addDefaults,
  draggable,
  emptyHint,
}: {
  tasks: Task[];
  showProject?: boolean;
  showDate?: boolean;
  addDefaults?: ComposerDefaults | false;
  draggable?: boolean;
  emptyHint?: string;
}) {
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => sortTasks(tasks), [tasks]);
  return (
    <div>
      <AnimatePresence initial={false}>
        {sorted.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, x: 24, transition: { duration: 0.28 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <TaskItem task={t} showProject={showProject} showDate={showDate} draggable={draggable} />
          </motion.div>
        ))}
      </AnimatePresence>
      {!sorted.length && emptyHint && <div className="small dim" style={{ padding: '12px 2px' }}>{emptyHint}</div>}
      {addDefaults !== false &&
        (adding ? (
          <Composer inline defaults={addDefaults} onClose={() => setAdding(false)} />
        ) : (
          <button className="inline-add" onClick={() => setAdding(true)}>
            <span className="plus">
              <Plus size={15} />
            </span>
            Adicionar tarefa
          </button>
        ))}
    </div>
  );
}

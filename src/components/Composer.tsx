import { CalendarDays, Flag, Hash, Inbox, Repeat, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createTask, findOrCreateProject, PRIORITY_COLORS, resolveLabels } from '../lib/actions';
import { dateTone } from '../lib/dates';
import { fold, parseQuick } from '../lib/parse';
import { recurrenceLabel } from '../lib/recurrence';
import { useRows } from '../lib/store';
import type { Priority } from '../lib/types';
import { DateMenu, dueSummary, LabelMenu, PriorityMenu, ProjectMenu, type DueValue } from './pickers';
import { Popover, useAnchor } from './ui';

export interface ComposerDefaults {
  project_id?: string | null;
  due_date?: string | null;
  parent_id?: string | null;
}

/** Campo de criação rápida com destaque dos tokens reconhecidos (data, hora, p1, #projeto, @etiqueta). */
export function Composer({
  defaults,
  onClose,
  inline,
  keepOpen = true,
}: {
  defaults?: ComposerDefaults;
  onClose: () => void;
  inline?: boolean;
  keepOpen?: boolean;
}) {
  const projects = useRows('projects');
  const [text, setText] = useState('');
  const [desc, setDesc] = useState('');
  const [manualDue, setManualDue] = useState<DueValue | null>(
    defaults?.due_date ? { due_date: defaults.due_date, due_time: null, recurrence: null } : null,
  );
  const [manualPriority, setManualPriority] = useState<Priority | null>(null);
  const [manualProject, setManualProject] = useState<string | null | undefined>(defaults?.project_id);
  const [manualLabels, setManualLabels] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const date = useAnchor();
  const prio = useAnchor();
  const proj = useAnchor();
  const lab = useAnchor();

  const parsed = useMemo(() => parseQuick(text), [text]);

  const projectFromText = parsed.project
    ? projects.find((p) => fold(p.name) === fold(parsed.project!)) ??
      projects.find((p) => fold(p.name).startsWith(fold(parsed.project!)))
    : undefined;

  const due: DueValue = {
    due_date: parsed.due_date ?? manualDue?.due_date ?? null,
    due_time: parsed.due_time ?? manualDue?.due_time ?? null,
    recurrence: parsed.recurrence ?? manualDue?.recurrence ?? null,
  };
  const priority: Priority = parsed.priority ?? manualPriority ?? 4;
  const projectId = parsed.project ? projectFromText?.id ?? 'new' : manualProject ?? null;
  const projectName =
    projectId === 'new' ? parsed.project : projectId ? projects.find((p) => p.id === projectId)?.name : 'Entrada';
  const labels = [...new Set([...manualLabels, ...parsed.labels])];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = () => {
    if (!parsed.title.trim()) return;
    const pid = projectId === 'new' ? findOrCreateProject(parsed.project!) : projectId;
    createTask({
      title: parsed.title,
      description: desc.trim() || null,
      project_id: defaults?.parent_id ? defaults.project_id ?? pid : pid,
      parent_id: defaults?.parent_id ?? null,
      due_date: due.due_date,
      due_time: due.due_time,
      recurrence: due.recurrence,
      priority,
      labels: resolveLabels(labels),
    });
    setText('');
    setDesc('');
    setManualLabels([]);
    setManualPriority(null);
    if (!keepOpen) onClose();
    inputRef.current?.focus();
  };

  const mirror = [];
  let cursor = 0;
  for (const tk of parsed.tokens) {
    if (tk.start > cursor) mirror.push(<span key={`t${cursor}`}>{text.slice(cursor, tk.start)}</span>);
    mirror.push(
      <span key={`k${tk.start}`} className={`tok tok-${tk.kind}`}>
        {text.slice(tk.start, tk.end)}
      </span>,
    );
    cursor = tk.end;
  }
  mirror.push(<span key="end">{text.slice(cursor)}</span>);

  const tone = dateTone(due.due_date);

  return (
    <div className={`composer ${inline ? 'inline' : ''}`}>
      <div className="qa-wrap">
        <div className="qa-mirror" aria-hidden>
          {mirror}
          {'​'}
        </div>
        <textarea
          ref={inputRef}
          rows={1}
          className="qa-input"
          placeholder='Ex.: "Pagar fatura amanhã 10h p1 #Pessoal"'
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\n/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
        />
      </div>
      <input
        className="bare qa-desc"
        placeholder="Descrição"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="qa-chips">
        <button ref={date.ref} className={`chip ${due.due_date ? 'on' : ''}`} onClick={date.toggle}>
          <CalendarDays size={14} className={due.due_date ? `tone-${tone}` : ''} />
          <span className={due.due_date ? `tone-${tone}` : ''}>{dueSummary(due)}</span>
          {due.recurrence && <Repeat size={12} />}
          {due.due_date && !parsed.due_date && (
            <X size={13} className="x" onClick={(e) => { e.stopPropagation(); setManualDue(null); }} />
          )}
        </button>
        <button ref={prio.ref} className={`chip ${priority < 4 ? 'on' : ''}`} onClick={prio.toggle}>
          <Flag size={14} color={PRIORITY_COLORS[priority]} fill={priority < 4 ? PRIORITY_COLORS[priority] : 'none'} />
          {priority < 4 ? `P${priority}` : 'Prioridade'}
        </button>
        <button ref={lab.ref} className={`chip ${labels.length ? 'on' : ''}`} onClick={lab.toggle}>
          <Tag size={14} /> {labels.length ? labels.map((l) => `@${l}`).join(' ') : 'Etiquetas'}
        </button>
        {due.recurrence && <span className="chip on"><Repeat size={13} /> {recurrenceLabel(due.recurrence)}</span>}
      </div>
      <div className="qa-foot">
        <button ref={proj.ref} className="chip" onClick={proj.toggle}>
          {projectId ? <Hash size={14} color={projects.find((p) => p.id === projectId)?.color ?? '#ffb38a'} /> : <Inbox size={14} />}
          {projectName}
          {projectId === 'new' && <span className="dim">(novo)</span>}
        </button>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-hot btn-sm" disabled={!parsed.title.trim()} onClick={submit}>
          Adicionar tarefa
        </button>
      </div>

      <Popover anchor={date.el} open={date.open} onClose={date.close}>
        <DateMenu value={due} onChange={setManualDue} onDone={date.close} />
      </Popover>
      <Popover anchor={prio.el} open={prio.open} onClose={prio.close}>
        <PriorityMenu value={priority} onChange={(p) => { setManualPriority(p); prio.close(); }} />
      </Popover>
      <Popover anchor={proj.el} open={proj.open} onClose={proj.close}>
        <ProjectMenu value={projectId === 'new' ? null : projectId} onChange={(p) => { setManualProject(p); proj.close(); }} />
      </Popover>
      <Popover anchor={lab.el} open={lab.open} onClose={lab.close}>
        <LabelMenu value={manualLabels} onChange={setManualLabels} />
      </Popover>
    </div>
  );
}

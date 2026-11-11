export interface Base {
  id: string;
  updated_at: string;
  deleted?: boolean;
  synced_at?: string;
}

export interface Project extends Base {
  name: string;
  color: string;
  sort: number;
  archived?: boolean;
}

export interface Label extends Base {
  name: string;
  color: string;
}

export type Priority = 1 | 2 | 3 | 4;

export interface Task extends Base {
  title: string;
  description: string | null;
  project_id: string | null;
  parent_id: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  labels: string[];
  recurrence: string | null;
  /** lembrete por notificação (ISO, hora absoluta) */
  reminder_at?: string | null;
  completed_at: string | null;
  sort: number;
}

export interface FoodOption {
  name: string;
  qty: string;
}

export interface MealItem {
  id: string;
  name: string;
  qty: string;
  free?: boolean;
  subs: FoodOption[];
}

export interface Macro {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface Meal extends Base {
  name: string;
  time: string;
  sort: number;
  items: MealItem[];
  notes: string | null;
}

export interface MealLog extends Base {
  date: string;
  meal_id: string;
  done: boolean;
  done_at: string | null;
  choices: Record<string, number>;
  dessert: boolean;
}

export interface DayLog extends Base {
  date: string;
  water_ml: number;
  weight_kg: number | null;
  cardio_done: boolean;
  cardio_min: number | null;
  sleep_h: number | null;
  notes: string | null;
  /** ids dos hábitos feitos no dia */
  habits?: string[];
  /** dia de descanso escolhido: não conta como atraso nem quebra a sequência */
  workout_rest?: boolean;
  cardio_rest?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: number;
}

export interface Split extends Base {
  weekday: number;
  name: string;
  exercises: Exercise[];
  sort: number;
}

export interface SetEntry {
  w: number | null;
  r: number | null;
  done: boolean;
}

export interface WorkoutEntry {
  exercise_id: string;
  name: string;
  sets: SetEntry[];
  /** Ficha do exercício no momento da sessão; compatível com logs antigos. */
  rest?: number;
  reps?: string;
}

export interface WorkoutLog extends Base {
  date: string;
  split_id: string | null;
  name: string;
  entries: WorkoutEntry[];
  started_at: string | null;
  finished_at: string | null;
}

export interface RoutineBlock {
  id: string;
  time: string;
  label: string;
  kind: 'cardio' | 'work' | 'meal' | 'workout' | 'sleep' | 'other';
  minutes: number;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
}

export interface Transaction extends Base {
  date: string;
  description: string;
  amount: number;
  account: string;
  kind: string;
  category: string;
  installment: string | null;
  merchant: string | null;
  oneoff: boolean;
  note: string | null;
}

export interface PrefsData {
  budgets?: Record<string, number>;
  /** categorias de gasto criadas pelo usuário, além das padrão */
  categories?: { name: string; color: string }[];
  fin_rules?: Record<string, string>;
  name: string;
  water_goal: number;
  cardio_goal: number;
  sound: boolean;
  /** notificações: horários da rotina e tarefas com hora */
  notify_routine?: boolean;
  notify_tasks?: boolean;
  routine: RoutineBlock[];
  /** hábitos diários que o usuário marca (diário de gratidão, leitura...) */
  habits?: Habit[];
}

export interface Prefs extends Base {
  data: PrefsData;
}

export interface Tables {
  projects: Record<string, Project>;
  labels: Record<string, Label>;
  tasks: Record<string, Task>;
  meals: Record<string, Meal>;
  meal_logs: Record<string, MealLog>;
  day_logs: Record<string, DayLog>;
  splits: Record<string, Split>;
  workout_logs: Record<string, WorkoutLog>;
  prefs: Record<string, Prefs>;
  transactions: Record<string, Transaction>;
}

export type TableName = keyof Tables;
export type RowOf<T extends TableName> = Tables[T][string];

export const TABLES: TableName[] = [
  'projects',
  'labels',
  'tasks',
  'meals',
  'meal_logs',
  'day_logs',
  'splits',
  'workout_logs',
  'prefs',
  'transactions',
];

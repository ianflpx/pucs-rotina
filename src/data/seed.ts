import { stableId } from '../lib/ids';
import type { Exercise, Label, Macro, Meal, MealItem, Prefs, Project, Split, Task } from '../lib/types';

/** Carimbo antigo: qualquer edição real (local ou do servidor) vence o seed. */
const SEED_AT = '2026-01-01T00:00:00.000Z';

export const MEAL_LUNCH = stableId('seed:meal:almoco');
export const MEAL_DINNER = stableId('seed:meal:jantar');

const opts = (list: [string, string][]) => list.map(([name, qty]) => ({ name, qty }));

const lunchItems: MealItem[] = [
  {
    id: 'prot',
    name: 'Carne moída cozida',
    qty: '270g',
    subs: opts([
      ['Fígado grelhado', '240g'],
      ['Filé mignon sem gordura grelhado', '240g'],
      ['Sobrecoxa de frango assada', '275g'],
      ['Contra-filé grelhado', '240g'],
      ['Tilápia cozida', '330g'],
      ['Atum assado/grelhado', '220g'],
      ['Patinho grelhado', '200g'],
      ['Peito de frango sem pele grelhado', '220g'],
      ['Costela assada', '240g'],
      ['Bisteca de porco grelhada', '240g'],
      ['Coração de frango grelhado', '305g'],
      ['Picanha grelhada/assada', '275g'],
    ]),
  },
  {
    id: 'fat',
    name: 'Azeite de oliva extravirgem',
    qty: '2 col. sopa (16ml)',
    subs: opts([
      ['Abacate', '200g'],
      ['Manteiga sem sal', '20g'],
      ['Óleo de coco', '2 col. sopa (16ml)'],
      ['Queijo', '60g'],
      ['Gema de ovo', '4 unid. médias (60g)'],
    ]),
  },
  {
    id: 'carb',
    name: 'Abóbora cabotiá cozida',
    qty: '300g',
    subs: opts([
      ['Batata inglesa cozida', '275g'],
      ['Batata doce cozida', '135g'],
      ['Banana', '135g'],
      ['Inhame cozido', '165g'],
      ['Manga', '205g'],
      ['Mandioca cozida', '110g'],
      ['Mel', '40g'],
      ['Melão', '500g'],
      ['Mamão', '315g'],
    ]),
  },
  { id: 'veg', name: 'Vegetais grelhados/assados', qty: 'à vontade', free: true, subs: [] },
];

const dinnerItems: MealItem[] = [
  {
    id: 'prot',
    name: 'Frango desfiado',
    qty: '190g',
    subs: opts([
      ['Fígado grelhado', '210g'],
      ['Carne moída cozida', '245g'],
      ['Sobrecoxa de frango assada', '245g'],
      ['Contra-filé grelhado', '210g'],
      ['Tilápia cozida', '290g'],
      ['Patinho grelhado', '175g'],
      ['Filé mignon sem gordura grelhado', '210g'],
      ['Costela assada', '210g'],
      ['Bisteca de porco grelhada', '210g'],
      ['Coração de frango grelhado', '265g'],
      ['Picanha grelhada/assada', '240g'],
    ]),
  },
  {
    id: 'fat',
    name: 'Abacate',
    qty: '100g',
    subs: opts([
      ['Azeite de oliva extravirgem', '1 col. sopa (8ml)'],
      ['Manteiga sem sal', '10g'],
      ['Óleo de coco', '1 col. sopa (8ml)'],
      ['Queijo', '30g'],
      ['Gema de ovo', '2 unid. médias (30g)'],
    ]),
  },
  {
    id: 'carb',
    name: 'Batata doce cozida',
    qty: '150g',
    subs: opts([
      ['Batata inglesa cozida', '300g'],
      ['Abóbora cabotiá cozida', '325g'],
      ['Mandioca cozida', '120g'],
      ['Inhame cozido', '175g'],
      ['Banana', '150g'],
      ['Manga', '225g'],
      ['Mel', '45g'],
      ['Melão', '625g'],
      ['Mamão', '345g'],
    ]),
  },
  { id: 'veg', name: 'Vegetais grelhados/assados', qty: 'à vontade', free: true, subs: [] },
];

const MEAL_NOTES =
  'Sobremesa opcional: morango, berries ou maracujá (200g).\n' +
  'Gordura extra (azeite etc.) só entra se a proteína for magra: filé mignon, patinho, tilápia, peito de frango.';

export const seedMeals: Meal[] = [
  { id: MEAL_LUNCH, updated_at: SEED_AT, name: 'Almoço', time: '12:00', sort: 1, items: lunchItems, notes: MEAL_NOTES },
  { id: MEAL_DINNER, updated_at: SEED_AT, name: 'Jantar', time: '19:30', sort: 2, items: dinnerItems, notes: MEAL_NOTES },
];

/** Estimativa pela tabela TACO, com a opção base de cada item (vegetais fora). */
export const MEAL_MACROS: Record<string, Macro> = {
  [MEAL_LUNCH]: { kcal: 846, p: 77, c: 32, g: 44 },
  [MEAL_DINNER]: { kcal: 522, p: 61, c: 34, g: 14 },
};

/** Quem prescreveu a dieta (aparece no topo da tela Dieta). Deixe vazio para esconder. */
export const DIET_SOURCE = {
  nutritionist: '',
  crn: '',
  prescribed: '',
};

const ex = (key: string, list: [string, number, string, number][]): Exercise[] =>
  list.map(([name, sets, reps, rest], i) => ({ id: `${key}-${i + 1}`, name, sets, reps, rest }));

const peitoOmbro = (key: string) =>
  ex(key, [
    ['Supino reto com barra', 4, '8-10', 90],
    ['Supino inclinado com halteres', 3, '10-12', 90],
    ['Crucifixo / Peck deck', 3, '12-15', 60],
    ['Desenvolvimento com halteres', 4, '8-10', 90],
    ['Elevação lateral', 4, '12-15', 60],
    ['Crucifixo invertido (posterior)', 3, '15', 60],
  ]);

const costasBraco = (key: string) =>
  ex(key, [
    ['Puxada frontal', 4, '8-12', 90],
    ['Remada curvada', 4, '8-10', 90],
    ['Remada baixa (triângulo)', 3, '10-12', 75],
    ['Rosca direta', 3, '10-12', 60],
    ['Rosca martelo', 3, '12', 60],
    ['Tríceps pulley', 3, '12', 60],
    ['Tríceps francês', 3, '10-12', 60],
  ]);

const perna = (key: string) =>
  ex(key, [
    ['Agachamento livre', 4, '6-10', 120],
    ['Leg press 45°', 4, '10-12', 90],
    ['Cadeira extensora', 3, '12-15', 60],
    ['Mesa flexora', 3, '10-12', 60],
    ['Stiff', 3, '10', 90],
    ['Panturrilha em pé', 4, '15', 45],
  ]);

export const seedSplits: Split[] = [
  { weekday: 1, name: 'Peito & Ombro', exercises: peitoOmbro('seg') },
  { weekday: 2, name: 'Costas & Braço', exercises: costasBraco('ter') },
  { weekday: 3, name: 'Perna', exercises: perna('qua') },
  { weekday: 4, name: 'Peito & Ombro', exercises: peitoOmbro('qui') },
  { weekday: 5, name: 'Costas & Braço', exercises: costasBraco('sex') },
].map((s) => ({ ...s, id: stableId(`seed:split:${s.weekday}`), updated_at: SEED_AT, sort: s.weekday }));

export const PROJECT_PESSOAL = stableId('seed:project:pessoal');
export const PROJECT_TRABALHO = stableId('seed:project:trabalho');
export const PROJECT_SAUDE = stableId('seed:project:saude');

export const seedProjects: Project[] = [
  { id: PROJECT_PESSOAL, updated_at: SEED_AT, name: 'Pessoal', color: '#ff7a4d', sort: 1 },
  { id: PROJECT_TRABALHO, updated_at: SEED_AT, name: 'Trabalho', color: '#f5f5f7', sort: 2 },
  { id: PROJECT_SAUDE, updated_at: SEED_AT, name: 'Saúde', color: '#8a8aa0', sort: 3 },
];

export const seedLabels: Label[] = [
  { id: stableId('seed:label:foco'), updated_at: SEED_AT, name: 'foco', color: '#ffa36b' },
  { id: stableId('seed:label:rapida'), updated_at: SEED_AT, name: 'rápida', color: '#c7c7d1' },
];

export function seedTasks(todayISO: string): Task[] {
  const base = {
    updated_at: SEED_AT,
    description: null,
    parent_id: null,
    due_time: null,
    labels: [],
    recurrence: null,
    completed_at: null,
  };
  return [
    {
      ...base,
      id: stableId('seed:task:quickadd'),
      title: 'Testar o atalho Q: "Ligar pro contador amanhã 15h p1 #Trabalho"',
      description: 'O PUCS entende data, hora, prioridade (p1 a p4), #projeto, @etiqueta e repetição ("todo dia", "toda segunda").',
      project_id: null,
      due_date: todayISO,
      priority: 4,
      sort: 1,
    },
  ];
}

export const seedPrefs: Prefs = {
  id: stableId('prefs'),
  updated_at: SEED_AT,
  data: {
    name: '',
    water_goal: 3000,
    cardio_goal: 30,
    sound: true,
    routine: [
      { id: 'r1', time: '06:30', label: 'Cardio em jejum', kind: 'cardio', minutes: 30 },
      { id: 'r2', time: '07:15', label: 'Trabalho', kind: 'work', minutes: 285 },
      { id: 'r3', time: '12:00', label: 'Almoço', kind: 'meal', minutes: 45 },
      { id: 'r4', time: '13:30', label: 'Treino', kind: 'workout', minutes: 75 },
      { id: 'r5', time: '15:00', label: 'Trabalho', kind: 'work', minutes: 270 },
      { id: 'r6', time: '19:30', label: 'Jantar', kind: 'meal', minutes: 45 },
      { id: 'r7', time: '23:00', label: 'Dormir', kind: 'sleep', minutes: 450 },
    ],
    habits: [
      { id: 'h-gratidao', name: 'Diário de gratidão', icon: 'pen' },
      { id: 'h-biblia', name: 'Leitura da Bíblia', icon: 'cross' },
      { id: 'h-leitura', name: 'Leitura', icon: 'book' },
    ],
  },
};

import assert from 'node:assert/strict';
import { build, transformSync } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';

const tmp = mkdtempSync(join(tmpdir(), 'pucs-rest-'));
const req = createRequire(import.meta.url);
let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const waitFor = async (test) => { for (let i = 0; i < 100; i++) { if (test()) return; await new Promise((r) => setTimeout(r, 5)); } throw Error('Tempo de teste excedido'); };
try {
  let offline = false;
  const writes = [];
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = {};
  globalThis.__qaSupabase = { from(table) {
    assert.equal(table, 'tasks');
    return { upsert(row) { return { async abortSignal() { if (offline) return { error: { message: 'offline' } }; writes.push(structuredClone(row)); return { error: null }; } }; } };
  } };
  const outfile = join(tmp, 'rest.cjs');
  await build({ stdin: { contents: "export * from './src/lib/rest'; export {useStore} from './src/lib/store'; export * from './src/lib/rest-reminder';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile,
    plugins: [{ name: 'test-only-boundaries', setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/]lib[\\/]supabase\.ts$/ }, () => ({ contents: 'export const supabase = globalThis.__qaSupabase;', loader: 'ts' }));
      build.onLoad({ filter: /[\\/]src[\\/]lib[\\/]actions\.ts$/ }, () => ({ contents: 'export function toast() {}', loader: 'ts' }));
    } }],
  });
  const api = req(outfile);
  api.startRest(60, '2026-10-28', 'Supino');
  await waitFor(() => api.useRest.getState().rest?.remote);
  const first = api.useRest.getState().rest;
  check('agenda descanso na tabela existente com RLS do usuário', () => { assert.equal(writes.length, 1); assert.equal(writes[0].id, first.id); assert(!('user_id' in writes[0])); assert(api.isRestReminder(writes[0])); });
  check('compensa janela de 15s do cron para não adiantar o aviso', () => assert.equal(Date.parse(writes[0].reminder_at), first.endsAt + 15_000));
  check('lembrete interno não tem data de tarefa nem recorrência', () => { assert.equal(writes[0].due_date, null); assert.equal(writes[0].recurrence, null); });
  check('tarefa normal não é ocultada por título semelhante', () => assert.equal(api.isRestReminder({ title: writes[0].title, labels: [] }), false));
  api.extendRest();
  await waitFor(() => api.useRest.getState().rest?.remote);
  const extended = api.useRest.getState().rest;
  check('+30s cancela o lembrete anterior antes de agendar o novo', () => { assert.notEqual(first.id, extended.id); assert.equal(extended.endsAt, first.endsAt + 30_000); const old = writes.filter((r) => r.id === first.id).at(-1); assert.equal(old.deleted, true); assert.equal(writes.at(-1).id, extended.id); });
  await api.cancelRest();
  check('cancelamento persiste exclusão soft sem excluir dados do usuário', () => { assert.equal(api.useRest.getState().rest, null); assert.equal(writes.at(-1).deleted, true); });
  offline = true;
  api.startRest(60, '2026-10-28', 'Remada');
  const offlineId = api.useRest.getState().rest.id;
  await waitFor(() => api.useStore.getState().dirty[`tasks:${offlineId}`]);
  await new Promise((r) => setTimeout(r, 10));
  check('offline mantém fila local pendente sem declarar push agendado', () => { assert.equal(api.useRest.getState().rest.remote, false); assert(api.useStore.getState().dirty[`tasks:${offlineId}`]); });
  offline = false;
  api.resumeRest();
  await waitFor(() => api.useRest.getState().rest?.remote);
  check('reconexão agenda o descanso pendente e limpa o dirty', () => assert.equal(api.useStore.getState().dirty[`tasks:${offlineId}`], undefined));
  offline = true;
  await api.cancelRest();
  check('cancelamento offline também fica pendente', () => assert(api.useStore.getState().dirty[`tasks:${offlineId}`]));
  offline = false;
  api.resumeRest();
  await waitFor(() => !api.useStore.getState().dirty[`tasks:${offlineId}`]);
  check('reconexão envia cancelamento pendente', () => assert.equal(writes.at(-1).deleted, true));

  // Handler do servidor já publicado, sem mudança de schema, função ou autenticação.
  let now = Date.parse('2026-10-28T19:00:00Z');
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const task = (n, endsAt, extra = {}) => ({ ...api.restReminder({ id: id(n), endsAt, exercise: 'Supino' }), user_id: 'owner', ...extra });
  const rows = [task(1, now), task(2, now + 1000), task(3, now, { deleted: true }), task(4, now - 300_000), task(5, now, { user_id: 'other' })];
  const notifyLog = new Map();
  const sent = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
    select() { return this; } limit() { return this; }
    eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
    is(k, v) { return this.eq(k, v); }
    gte(k, v) { this.filters.push((r) => r[k] >= v); return this; }
    lte(k, v) { this.filters.push((r) => r[k] <= v); return this; }
    lt(k, v) { this.filters.push((r) => r[k] < v); return this; }
    insert(row) { this.op = 'insert'; this.row = row; return this; }
    delete() { this.op = 'delete'; return this; }
    async exec(single = false) {
      if (this.table === 'app_config' || this.table === 'app_secrets') return { data: { value: 'mock' }, error: null };
      let data = [];
      if (this.table === 'push_subs') data = [{ id: 'sub', user_id: 'owner', endpoint: 'https://example.invalid/push', p256dh: 'mock', auth: 'mock' }];
      if (this.table === 'prefs') data = [{ user_id: 'owner', deleted: false, data: { routine: [], notify_tasks: false, notify_routine: false } }];
      if (this.table === 'tasks') data = rows;
      if (this.table === 'notify_log') {
        if (this.op === 'insert') {
          const key = `${this.row.user_id}:${this.row.key}`;
          if (notifyLog.has(key)) return { error: { code: '23505' } };
          notifyLog.set(key, { ...this.row, sent_at: new ClockDate().toISOString() });
          return { data: null, error: null };
        }
        data = [...notifyLog.values()];
      }
      data = data.filter((r) => this.filters.every((f) => f(r)));
      return { data: single ? data[0] ?? null : data, error: null };
    }
    maybeSingle() { return this.exec(true); }
    then(resolve, reject) { return this.exec().then(resolve, reject); }
  }
  let handler;
  const source = readFileSync('supabase/functions/notify/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'iife', target: 'es2022' }).code, {
    createClient: () => ({ from: (t) => new Query(t) }), webpush: { setVapidDetails() {}, async sendNotification(_s, p) { sent.push(JSON.parse(p)); } },
    Deno: { env: { get: () => 'mock' }, serve: (fn) => { handler = fn; } }, Request, Response, Date: ClockDate, console,
  });
  const cron = () => handler(new Request('https://example.invalid/notify', { method: 'POST', headers: { 'x-cron-secret': 'mock', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cron' }) }));
  const res = await cron();
  check('cron existente aceita e envia o novo lembrete sem deploy de backend', () => { assert.equal(res.status, 200); assert.equal(sent.length, 1); assert.equal(sent[0].tag, `lembrete-${id(1)}`); });
  check('cron ignora futuro, cancelado, antigo e outra conta', () => assert.equal(sent.length, 1));
  await cron();
  check('dedupe existente no servidor impede segundo envio do mesmo timer', () => assert.equal(sent.length, 1));

  // Service worker real + IndexedDB transacional (fake-indexeddb, sem navegador/conta).
  const indexedDB = new IDBFactory();
  const notices = [];
  const swSource = readFileSync('public/sw.js', 'utf8');
  function worker() {
    const listeners = {};
    vm.runInNewContext(swSource, {
      indexedDB, Date: ClockDate, Map, Promise,
      self: {
        addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting() {}, clients: { claim: async () => {} },
        registration: {
          async showNotification(title, options) { notices.push({ title, ...options, closed: false }); },
          async getNotifications({ tag }) { return notices.filter((n) => n.tag === tag && !n.closed).map((n) => ({ close() { n.closed = true; } })); },
        },
      },
    });
    return {
      async push(payload) { let work; listeners.push({ data: { json: () => payload }, waitUntil: (p) => { work = p; } }); await work; },
      async message(action, n, endsAt = now, show = true) { let work, reply; listeners.message({ data: { action, id: id(n), endsAt, exercise: 'Supino', date: '2026-10-28', show }, ports: [{ postMessage: (v) => { reply = v; } }], waitUntil: (p) => { work = p; } }); await work; return reply; },
    };
  }
  const sw = worker();
  await sw.push(sent[0]);
  check('push é exibido como fim do descanso e abre Treino', () => { assert.equal(notices[0].title, 'Descanso acabou'); assert.equal(notices[0].data.url, '/treino'); assert(!notices[0].body.includes('PUCS ')); });
  let reply = await sw.message('pucs-rest-finish', 1);
  check('retomar app após push não repete o alarme', () => { assert.equal(reply.claimed, false); assert.equal(notices.length, 1); });
  await Promise.all([sw.message('pucs-rest-finish', 6), sw.message('pucs-rest-finish', 6)]);
  check('duas abas concorrentes emitem um único alerta', () => assert.equal(notices.filter((n) => n.tag === `pucs-rest-${id(6)}`).length, 1));
  await sw.message('pucs-rest-cancel', 7);
  await sw.push({ title: `Lembrete: Descanso PUCS ${now}: Supino`, tag: `lembrete-${id(7)}` });
  check('cancelamento bloqueia push que já estava em trânsito', () => assert.equal(notices.filter((n) => n.tag === `pucs-rest-${id(7)}`).length, 0));
  await sw.message('pucs-rest-finish', 8, now + 1000);
  await sw.message('pucs-rest-finish', 9, now - 121_000);
  check('SW rejeita aviso adiantado ou expirado', () => assert.equal(notices.filter((n) => n.tag.endsWith(id(8)) || n.tag.endsWith(id(9))).length, 0));
  reply = await sw.message('pucs-rest-finish', 10, now, false);
  check('sem permissão de notificação o app ainda pode tocar e avisar na tela', () => { assert.equal(reply.claimed, true); assert.equal(notices.filter((n) => n.tag.endsWith(id(10))).length, 0); });
  const restarted = worker();
  await restarted.push(sent[0]);
  check('dedupe sobrevive ao reinício do service worker', () => assert.equal(notices.filter((n) => n.tag.endsWith(id(1))).length, 1));
  await sw.message('pucs-rest-cancel', 6);
  check('cancelar fecha a notificação daquele descanso', () => assert(notices.find((n) => n.tag.endsWith(id(6))).closed));
  await sw.push({ title: 'Minha tarefa', body: 'Agora', tag: 'tarefa-normal', url: '/hoje' });
  check('notificação de tarefa normal mantém conteúdo e destino', () => { assert.equal(notices.at(-1).title, 'Minha tarefa'); assert.equal(notices.at(-1).data.url, '/hoje'); });
  console.log(`${checks} verificações de descanso passaram; banco e notificações reais não foram acessados.`);
} finally { rmSync(tmp, { recursive: true, force: true }); }

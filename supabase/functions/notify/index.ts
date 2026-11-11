// Função "notify" do PUCS (Supabase Edge Function, Deno).
// - action "pubkey": devolve a chave VAPID pública (gera o par na primeira vez e guarda em app_config/app_secrets).
// - action "test":   manda uma notificação de teste para os aparelhos do usuário logado (JWT no Authorization).
// - action "cron":   chamada a cada minuto pelo pg_cron (header x-cron-secret); dispara rotina, tarefas com hora e lembretes.
// Deploy pelo painel (Edge Functions > notify). A verificação de JWT do gateway fica ligada (aceita apikey público
// e o JWT ES256 do usuário); a autorização de cada ação é feita aqui dentro.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

// chave de servidor: a nova (SUPABASE_SECRET_KEYS.default) ou a legada (SUPABASE_SERVICE_ROLE_KEY)
const SERVER_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default;
const supa = createClient(Deno.env.get('SUPABASE_URL')!, SERVER_KEY, { auth: { persistSession: false } });

// TROQUE pelo endereço onde o seu app está publicado (ex.: https://meu-pucs.vercel.app)
const APP_URL = 'https://SEU-APP.vercel.app';
const ALLOWED_ORIGINS = [APP_URL, 'http://localhost:5199'];
const TZ = 'America/Sao_Paulo';

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

async function getValue(table: 'app_config' | 'app_secrets', key: string): Promise<string | null> {
  const { data } = await supa.from(table).select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

let ready: Promise<string> | null = null;

/** Garante o par VAPID e o segredo do cron; devolve a chave pública. */
function setup(): Promise<string> {
  ready ??= (async () => {
    let pub = await getValue('app_config', 'vapid_public');
    let priv = await getValue('app_secrets', 'vapid_private');
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      await supa.from('app_secrets').upsert({ key: 'vapid_private', value: priv });
      await supa.from('app_config').upsert({ key: 'vapid_public', value: pub });
    }
    if (!(await getValue('app_secrets', 'cron_secret'))) {
      await supa.from('app_secrets').upsert({ key: 'cron_secret', value: crypto.randomUUID() + crypto.randomUUID() });
    }
    webpush.setVapidDetails(APP_URL, pub, priv);
    return pub;
  })();
  return ready;
}

interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Envia para todos os aparelhos do usuário; inscrição expirada (404/410) é apagada. */
async function sendToUser(userId: string, payload: Payload): Promise<number> {
  const { data: subs } = await supa.from('push_subs').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        TTL: 3600,
        urgency: 'high',
      });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await supa.from('push_subs').delete().eq('id', s.id);
      else console.error('push falhou', code, (e as Error).message);
    }
  }
  return sent;
}

function nowParts() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}`, weekday: wd };
}

const ROUTINE_TEXT: Record<string, (label: string, min: number) => string> = {
  cardio: (_l, m) => `Hora da caminhada em jejum: ${m} min. Bora.`,
  meal: (l) => `${l} agora. Siga o plano: proteína primeiro, vegetais à vontade.`,
  workout: (l) => `${l}. Abre o PUCS e marca as séries.`,
  work: (_l, m) => `Bloco de trabalho de ${Math.round(m / 60)}h começando.`,
  sleep: () => 'Hora de desligar. Sono também é treino.',
  other: (l) => l,
};

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Mesmo plano do app (planSplits): descanso num dia de treino empurra a divisão um dia. */
async function splitFor(userId: string, date: string): Promise<string | null> {
  const from = addDay(date, -60);
  const [{ data: splits }, { data: rests }, { data: started }] = await Promise.all([
    supa.from('splits').select('weekday, name').eq('user_id', userId).eq('deleted', false),
    supa.from('day_logs').select('date').eq('user_id', userId).eq('deleted', false).eq('workout_rest', true).gte('date', from).lt('date', date),
    supa.from('workout_logs').select('date').eq('user_id', userId).eq('deleted', false).not('started_at', 'is', null).gte('date', from).lt('date', date),
  ]);
  const trained = new Set((started ?? []).map((r) => r.date as string));
  const rested = new Set((rests ?? []).map((r) => r.date as string).filter((d) => !trained.has(d)));
  const queue: string[] = [];
  let today: string | null = null;
  for (let d = from; d <= date; d = addDay(d, 1)) {
    const own = (splits ?? []).find((s) => s.weekday === weekdayOf(d))?.name as string | undefined;
    let split = own ?? null;
    if (queue.length) {
      split = queue.shift()!;
      if (own) queue.push(own);
    }
    if (d === date) today = split;
    else if (split && rested.has(d)) queue.unshift(split);
  }
  return today;
}

async function runCron(): Promise<{ users: number; sent: number }> {
  const { date, hm } = nowParts();
  const now = Date.now();
  const { data: subUsers } = await supa.from('push_subs').select('user_id');
  const users = [...new Set((subUsers ?? []).map((u) => u.user_id as string))];
  let sent = 0;

  for (const userId of users) {
    const items: (Payload & { key: string })[] = [];
    const { data: prefsRow } = await supa.from('prefs').select('data').eq('user_id', userId).eq('deleted', false).limit(1).maybeSingle();
    const prefs = (prefsRow?.data ?? {}) as {
      routine?: { id: string; time: string; label: string; kind: string; minutes: number }[];
      notify_routine?: boolean;
      notify_tasks?: boolean;
    };

    if (prefs.notify_routine !== false) {
      // descanso marcado no dia: sem aviso de cardio/treino
      const { data: dayRow } = await supa
        .from('day_logs')
        .select('workout_rest, cardio_rest')
        .eq('user_id', userId)
        .eq('deleted', false)
        .eq('date', date)
        .limit(1)
        .maybeSingle();
      for (const b of prefs.routine ?? []) {
        if (b.time !== hm) continue;
        if ((b.kind === 'cardio' && dayRow?.cardio_rest) || (b.kind === 'workout' && dayRow?.workout_rest)) continue;
        let label = b.label;
        if (b.kind === 'workout') {
          const split = await splitFor(userId, date);
          if (!split) continue; // dia de descanso
          label = `Treino de hoje: ${split}`;
        }
        const text = (ROUTINE_TEXT[b.kind] ?? ROUTINE_TEXT.other)(label, b.minutes);
        items.push({
          key: `r:${date}:${b.id}`,
          title: b.kind === 'workout' ? label : b.label,
          body: text,
          url: b.kind === 'meal' ? '/dieta' : b.kind === 'cardio' || b.kind === 'workout' ? '/treino' : '/',
          tag: `rotina-${b.id}`,
        });
      }
    }

    if (prefs.notify_tasks !== false) {
      const { data: due } = await supa
        .from('tasks')
        .select('id, title')
        .eq('user_id', userId)
        .eq('deleted', false)
        .is('completed_at', null)
        .eq('due_date', date)
        .eq('due_time', hm);
      for (const t of due ?? []) items.push({ key: `t:${t.id}:${date}T${hm}`, title: t.title, body: `Agora · ${hm}`, url: '/hoje', tag: `tarefa-${t.id}` });
    }

    // lembretes explícitos: qualquer horário nos últimos 2 min ainda não enviado
    const { data: rem } = await supa
      .from('tasks')
      .select('id, title, reminder_at, due_time')
      .eq('user_id', userId)
      .eq('deleted', false)
      .is('completed_at', null)
      .gte('reminder_at', new Date(now - 120_000).toISOString())
      .lte('reminder_at', new Date(now + 15_000).toISOString());
    for (const t of rem ?? [])
      items.push({
        key: `l:${t.id}:${t.reminder_at}`,
        title: `Lembrete: ${t.title}`,
        body: t.due_time ? `Marcada para ${t.due_time}` : 'Toque para abrir',
        url: '/hoje',
        tag: `lembrete-${t.id}`,
      });

    for (const it of items) {
      // dedupe: só envia se conseguiu registrar a chave agora
      const { error } = await supa.from('notify_log').insert({ user_id: userId, key: it.key });
      if (error) continue;
      sent += await sendToUser(userId, it);
    }
  }
  // limpeza do log com mais de 3 dias
  await supa.from('notify_log').delete().lt('sent_at', new Date(now - 3 * 86_400_000).toISOString());
  return { users: users.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method' }, 405);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const pub = await setup();

  if (body.action === 'pubkey') return json(req, { publicKey: pub });

  if (body.action === 'cron') {
    const secret = await getValue('app_secrets', 'cron_secret');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json(req, { error: 'forbidden' }, 403);
    return json(req, await runCron());
  }

  if (body.action === 'test') {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data.user) return json(req, { error: 'login' }, 401);
    const sent = await sendToUser(data.user.id, {
      title: 'PUCS',
      body: 'Notificações ativas. Você vai receber os horários da rotina e os lembretes das tarefas.',
      url: '/',
      tag: 'teste',
    });
    return json(req, { sent });
  }

  return json(req, { error: 'action' }, 400);
});

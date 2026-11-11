import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bike,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CreditCard,
  Dices,
  Dumbbell,
  HandHeart,
  HeartPulse,
  Landmark,
  Layers,
  Lightbulb,
  PiggyBank,
  Plus,
  Repeat,
  Scissors,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Building2,
  Store,
  Tag,
  Ticket,
  Undo2,
  Upload,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CountUp, Popover, stagger, useAnchor } from '../components/ui';
import { setPrefs, toast } from '../lib/actions';
import { addDays, diffDays, fromISO, labelDate, MONTHS, MONTHS_SHORT, toISO, today, WEEKDAYS_SHORT } from '../lib/dates';
import { ACCOUNT_LABEL, allCategories, cashFlow, CUSTOM_COLORS, detectAndParse, SYSTEM_CATEGORIES, type Account, type RawTx } from '../lib/finance';
import { fold } from '../lib/parse';
import { getPrefsRow, usePrefs, useRows, useStore } from '../lib/store';
import type { Transaction } from '../lib/types';

const OUT_COLOR = '#e8602c';
/** referência neutra (média) no gráfico de ritmo */
const REF_COLOR = '#8a8aa0';
/** entrada x saída: verde e vermelho validados para daltonismo */
const POS_COLOR = '#21a07a';
const NEG_COLOR = '#e8553f';
const SPEND_KINDS = ['expense', 'fee', 'refund'];

const brl = (n: number, cents = false) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/* ---------- importação ---------- */

export function importTransactions(raw: RawTx[]): number {
  const store = useStore.getState();
  const rules = getPrefsRow().data.fin_rules ?? {};
  let added = 0;
  for (const r of raw) {
    if (store.transactions[r.id]) continue;
    store.put('transactions', {
      id: r.id,
      date: r.date,
      description: r.description,
      amount: r.amount,
      account: r.account,
      kind: r.kind,
      category: (r.kind === 'expense' && r.merchant && rules[r.merchant]) || r.category,
      installment: r.installment,
      merchant: r.merchant,
      oneoff: !!r.oneoff,
      note: null,
    });
    added++;
  }
  return added;
}

function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn btn-sm" onClick={() => input.current?.click()} title="Importar extratos">
        <Upload size={14} /> <span className="lbl-full">Importar extratos</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.json,.txt"
        hidden
        onChange={async (e) => {
          let added = 0;
          for (const f of Array.from(e.target.files ?? [])) {
            try {
              added += importTransactions(detectAndParse(f.name, await f.text()));
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err));
            }
          }
          toast(added ? `${added} lançamentos novos importados` : 'Nada novo nesses arquivos');
          e.target.value = '';
        }}
      />
    </>
  );
}

/* ---------- análise ---------- */

interface Period {
  key: string;
  label: string;
  from: string;
  to: string;
  /** meses que o intervalo cobre, para as médias "por mês" */
  n: number;
}

function useAnalysis(txs: Transaction[], period: Period) {
  return useMemo(() => {
    const inP = txs.filter((t) => t.date >= period.from && t.date <= period.to);
    const n = period.n;
    const spendTx = inP.filter((t) => SPEND_KINDS.includes(t.kind));
    const recurring = spendTx.filter((t) => !t.oneoff);
    const spend = -recurring.reduce((a, t) => a + t.amount, 0);
    const oneoff = -spendTx.filter((t) => t.oneoff).reduce((a, t) => a + t.amount, 0);
    const income = inP.filter((t) => t.kind === 'income' && !t.oneoff).reduce((a, t) => a + t.amount, 0);
    const incomeOneoff = inP.filter((t) => t.kind === 'income' && t.oneoff).reduce((a, t) => a + t.amount, 0);
    const reserve = inP.filter((t) => t.kind === 'investment').reduce((a, t) => a + t.amount, 0);
    // devoluções: as que têm categoria (ex.: um amigo devolvendo a parte dele de uma conta) abatem daquela categoria;
    // as genéricas ("Reembolsos") só abatem do total. O gasto (spend) já é líquido de todas elas.
    const refunds = inP.filter((t) => t.kind === 'refund' && !t.oneoff && t.category === 'Reembolsos').reduce((a, t) => a + t.amount, 0);

    const byCat: Record<string, { v: number; n: number }> = {};
    for (const t of recurring) {
      if (t.kind === 'refund' && t.category === 'Reembolsos') continue;
      byCat[t.category] ??= { v: 0, n: 0 };
      byCat[t.category].v -= t.amount;
      if (t.kind !== 'refund') byCat[t.category].n++;
    }
    const cats = Object.entries(byCat)
      .map(([name, x]) => ({ name, total: x.v, monthly: x.v / n, count: x.n }))
      .filter((c) => c.total > 0.5)
      .sort((a, b) => b.total - a.total);

    const byMerchant: Record<string, { v: number; n: number; accounts: Set<string>; cat: string; months: Set<string> }> = {};
    for (const t of recurring.filter((t) => t.kind !== 'refund')) {
      const k = t.merchant || fold(t.description);
      byMerchant[k] ??= { v: 0, n: 0, accounts: new Set(), cat: t.category, months: new Set() };
      byMerchant[k].v -= t.amount;
      byMerchant[k].n++;
      byMerchant[k].accounts.add(t.account);
      byMerchant[k].months.add(t.date.slice(0, 7));
    }

    const people: Record<string, { out: number; in: number }> = {};
    for (const t of inP.filter((t) => t.account === 'unicred' && (t.category === 'PIX para pessoas' || t.kind === 'refund'))) {
      const k = t.merchant ?? t.description;
      people[k] ??= { out: 0, in: 0 };
      if (t.amount < 0) people[k].out -= t.amount;
      else people[k].in += t.amount;
    }

    const { cash, saved, cardOpen } = cashFlow(txs, period.from, period.to);
    return { inP, n, spend, oneoff, income, incomeOneoff, reserve, refunds, cats, byMerchant, people, cash, saved, cardOpen };
  }, [txs, period]);
}

type Analysis = ReturnType<typeof useAnalysis>;

function insights(a: Analysis) {
  const out: { tone: 'bad' | 'warn' | 'good' | 'info'; title: string; text: string }[] = [];
  const per = a.n > 1 ? '/mês' : '';
  const m = (v: number) => v / a.n;
  // gasto da empresa (pago com retirada) fica fora das contas pessoais
  // pelo caixa: fatura conta quando é paga, não quando a compra é feita
  const balance = a.cash;
  if (a.income > 0) {
    if (balance < 0)
      out.push({
        tone: 'bad',
        title: `Saiu ${brl(m(-balance))}${per} a mais do que entrou`,
        text: a.reserve > 0 ? `O buraco foi coberto com ${brl(m(a.reserve))}${per} resgatados da reserva. Nesse ritmo a reserva acaba.` : 'Sem reserva sendo usada, isso vira cheque especial.',
      });
    else
      out.push({
        tone: 'good',
        title: `Sobrou ${brl(m(balance))}${per} no caixa`,
        text: a.saved > 0 ? `${brl(m(a.saved))}${per} já foram para a reserva.${a.cardOpen > 0 ? ` O cartão deste período (${brl(m(a.cardOpen))}${per}) só é cobrado na próxima fatura.` : ''}` : 'Mande o que sobra para a reserva no dia em que o dinheiro entra.',
      });
  }
  const top = a.cats.slice(0, 3);
  if (top.length && a.spend > 0)
    out.push({
      tone: 'info',
      title: `${top.map((c) => c.name).join(', ')} = ${Math.round((top.reduce((s, c) => s + c.total, 0) / (a.spend * 1)) * 100)}% do gasto`,
      text: 'É aqui que qualquer corte faz diferença de verdade.',
    });
  const deliv = a.cats.find((c) => c.name === 'Delivery');
  if (deliv && deliv.monthly > 150)
    out.push({
      tone: 'warn',
      title: `Delivery: ${brl(deliv.monthly)}${per} em ${Math.round(deliv.count / a.n)} pedidos`,
      text: 'Seu plano alimentar tem só almoço e jantar com comida de verdade. Pedido fora do plano custa duas vezes: no bolso e na dieta. Meta sugerida: até R$ 150.',
    });
  const freq = Object.entries(a.byMerchant)
    .filter(([, x]) => x.n / a.n >= 4 && x.v / x.n < 80 && !['Mercado', 'Transporte'].includes(x.cat))
    .sort((x, y) => y[1].v - x[1].v)[0];
  if (freq)
    out.push({
      tone: 'warn',
      title: `Vazamento: ${freq[0]} (${freq[1].n} compras)`,
      text: `${brl(freq[1].v)} no período, média de ${brl(freq[1].v / freq[1].n)} por vez. Compra pequena e frequente é a que menos se percebe.`,
    });
  const uber = a.byMerchant['uber'];
  const nine = a.byMerchant['99'];
  const rides = (uber?.v ?? 0) + (nine?.v ?? 0);
  if (rides / a.n > 250)
    out.push({
      tone: 'warn',
      title: `Uber e 99: ${brl(rides / a.n)}${per} em ${Math.round(((uber?.n ?? 0) + (nine?.n ?? 0)) / a.n)} corridas`,
      text: 'Agrupar saídas e trocar corrida curta por caminhada (já entra como cardio) corta fácil um terço disso.',
    });
  const dupes = Object.entries(a.byMerchant).filter(([, x]) => x.cat === 'Assinaturas' && x.accounts.size > 1);
  for (const [k, x] of dupes)
    out.push({ tone: 'bad', title: `Assinatura duplicada: ${k}`, text: `Cobrada em ${[...x.accounts].map((s) => ACCOUNT_LABEL[s as Account] ?? s).join(' e ')}. Cancele uma.` });
  const fees = a.cats.find((c) => c.name === 'Tarifas e juros');
  if (fees)
    out.push({
      tone: 'bad',
      title: `Tarifas e juros: ${brl(fees.total, true)}`,
      text: 'Dinheiro jogado fora: anuidade do cartão Unicred, IOF de compra internacional e tarifa por deixar a conta negativa. Cartão que você quase não usa não deveria cobrar anuidade.',
    });
  const bets = a.cats.find((c) => c.name === 'Jogos e apostas');
  if (bets) out.push({ tone: 'warn', title: `Jogos e apostas: ${brl(bets.total)}`, text: 'Pouco, mas fica de olho para não virar hábito.' });
  const pixNet = Object.values(a.people).reduce((s, p) => s + p.out - p.in, 0);
  if (pixNet / a.n > 400)
    out.push({
      tone: 'info',
      title: `PIX para pessoas: ${brl(pixNet / a.n)}${per} líquido`,
      text: 'Já descontando o que voltou. Classifique os recorrentes (aluguel, rateio, diarista…) para separar custo fixo de rolê.',
    });
  return out;
}

/* ---------- gráficos ---------- */

function MonthBars({ data }: { data: { month: string; income: number; spend: number }[] }) {
  const [hover, setHover] = useState<{ i: number; s: 'income' | 'spend' } | null>(null);
  const W = 560;
  const H = 210;
  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spend])) * 1.1;
  const groupW = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(34, groupW / 3.2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bar = (x: number, v: number) => {
    const top = y(v);
    const base = H - pad.b;
    const r = Math.min(4, (base - top) / 2);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`;
  };
  return (
    <div style={{ position: 'relative' }}>
      <div className="row small" style={{ gap: 16, marginBottom: 8 }}>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: POS_COLOR }} /> Entrou</span>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: NEG_COLOR }} /> Saiu</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f / 1.1)} y2={y(max * f / 1.1)} stroke="rgba(255,255,255,0.05)" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.15)" />
        {data.map((d, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          const x1 = cx - barW - 1;
          const x2 = cx + 1;
          return (
            <g key={d.month}>
              {(['income', 'spend'] as const).map((s) => (
                <g key={s} onMouseEnter={() => setHover({ i, s })}>
                  <rect x={s === 'income' ? x1 - 6 : x2 - 2} y={pad.t} width={barW + 8} height={H - pad.t - pad.b} fill="transparent" />
                  <motion.path
                    d={bar(s === 'income' ? x1 : x2, s === 'income' ? d.income : d.spend)}
                    fill={s === 'income' ? POS_COLOR : NEG_COLOR}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: hover && (hover.i !== i || hover.s !== s) ? 0.45 : 1, scaleY: 1 }}
                    style={{ transformOrigin: `0px ${H - pad.b}px` }}
                    transition={{ duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  />
                </g>
              ))}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11.5" fill="#9393a6">
                {MONTHS_SHORT[Number(d.month.slice(5)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="toast"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            top: 20,
            left: `${((hover.i + 0.5) / data.length) * 100}%`,
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
          }}
        >
          <span className="small muted" style={{ textTransform: 'capitalize' }}>{MONTHS[Number(data[hover.i].month.slice(5)) - 1]}</span>
          <span className="tnum">Entrou {brl(data[hover.i].income)}</span>
          <span className="tnum">Saiu {brl(data[hover.i].spend)}</span>
        </div>
      )}
    </div>
  );
}

function CategoryBars({ a, onPick, picked }: { a: Analysis; onPick: (c: string | null) => void; picked: string | null }) {
  const prefs = usePrefs();
  const budgets = prefs.budgets ?? {};
  const total = a.cats.reduce((x, c) => x + c.monthly, 0) || 1;
  const top = a.cats.slice(0, 7);
  const rest = a.cats.slice(7);
  const rows = rest.length
    ? [...top, { name: `Outras ${rest.length}`, monthly: rest.reduce((x, c) => x + c.monthly, 0), total: 0, count: 0, folded: true }]
    : top;
  const max = Math.max(1, ...rows.map((c) => Math.max(c.monthly, budgets[c.name] ?? 0)));
  return (
    <div>
      {rows.map((c, i) => {
        const b = budgets[c.name];
        const over = b && c.monthly > b;
        const folded = 'folded' in c;
        return (
          <motion.button
            key={c.name}
            className="cat-row"
            disabled={folded}
            style={{ background: picked === c.name ? 'var(--glass-2)' : undefined }}
            onClick={() => onPick(picked === c.name ? null : c.name)}
            {...stagger(i)}
          >
            <span className="cat-top">
              <span className="cat-name">
                <span className="cat-ic">
                  <CategoryIcon name={c.name} size={13} />
                </span>
                {c.name}
              </span>
              <span className="tnum">
                {brl(c.monthly)}
                <span className="dim"> · {Math.round((c.monthly / total) * 100)}%</span>
              </span>
            </span>
            <span className="cat-track">
              <motion.i
                style={{ background: over ? '#ef6a6a' : folded ? '#5f5f70' : OUT_COLOR }}
                initial={{ width: 0 }}
                animate={{ width: `${(c.monthly / max) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
              />
              {b ? <b style={{ left: `${(b / max) * 100}%` }} title={`Teto ${brl(b)}`} /> : null}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Gasto acumulado dia a dia do mês em foco contra a média dos outros meses. */
function PaceChart({ txs, months, focus }: { txs: Transaction[]; months: string[]; focus: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const daily = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const arr = new Array(new Date(y, mo, 0).getDate()).fill(0);
    for (const t of txs) if (t.date.startsWith(m) && SPEND_KINDS.includes(t.kind) && !t.oneoff) arr[Number(t.date.slice(8)) - 1] -= t.amount;
    let acc = 0;
    return arr.map((v) => (acc += v));
  };
  const cur = daily(focus);
  const others = months.filter((m) => m !== focus).map(daily);
  const ref = cur.map((_, i) => (others.length ? others.reduce((x, o) => x + o[Math.min(i, o.length - 1)], 0) / others.length : null));
  const lastTx = txs.filter((t) => t.date.startsWith(focus)).reduce((m, t) => (t.date > m ? t.date : m), `${focus}-01`);
  const lastIdx = focus === today().slice(0, 7) ? Math.min(Number(today().slice(8)), Number(lastTx.slice(8))) - 1 : cur.length - 1;
  const W = 640;
  const H = 220;
  const pad = { l: 6, r: 6, t: 12, b: 24 };
  const max = Math.max(1, ...cur.slice(0, lastIdx + 1), ...ref.map((v) => v ?? 0)) * 1.08;
  const x = (i: number) => pad.l + (i / (cur.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = (vals: (number | null)[], upto: number) =>
    vals
      .slice(0, upto + 1)
      .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`)
      .join(' ');
  const curPath = line(cur, lastIdx);
  const area = `${curPath} L${x(lastIdx)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const now = cur[lastIdx];
  const refNow = ref[lastIdx];
  const diff = refNow ? (now - refNow) / refNow : 0;
  const hi = hover ?? lastIdx;
  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div className="display grad" style={{ fontSize: 30 }}>{brl(now)}</div>
          <div className="small muted">
            gasto em {MONTHS[Number(focus.slice(5)) - 1]} até o dia {lastIdx + 1}
          </div>
        </div>
        {refNow ? (
          <span className={`st-tag ${diff > 0.05 ? 'late' : 'done'}`}>
            {diff > 0 ? '+' : ''}
            {Math.round(diff * 100)}% vs média no mesmo dia
          </span>
        ) : null}
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block' }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const rel = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(cur.length - 1, Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (cur.length - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={OUT_COLOR} stopOpacity="0.32" />
              <stop offset="100%" stopColor={OUT_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={pad.l} x2={W - pad.r} y1={y((max / 1.08) * f)} y2={y((max / 1.08) * f)} stroke="rgba(255,255,255,0.05)" />
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.14)" />
          {others.length > 0 && <path d={line(ref, cur.length - 1)} fill="none" stroke={REF_COLOR} strokeWidth="2" strokeDasharray="5 5" />}
          <motion.path d={area} fill="url(#pace-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
          <motion.path
            d={curPath}
            fill="none"
            stroke={OUT_COLOR}
            strokeWidth="2.5"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          {[1, 8, 15, 22, cur.length].map((d) => (
            <text key={d} x={x(d - 1)} y={H - 6} textAnchor={d === 1 ? 'start' : d === cur.length ? 'end' : 'middle'} fontSize="11" fill="#9393a6">
              {d}
            </text>
          ))}
          <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.18)" />
          {hi <= lastIdx && <circle cx={x(hi)} cy={y(cur[hi])} r="5" fill={OUT_COLOR} stroke="#101016" strokeWidth="2" />}
          {ref[hi] != null && others.length > 0 && <circle cx={x(hi)} cy={y(ref[hi]!)} r="4.5" fill={REF_COLOR} stroke="#101016" strokeWidth="2" />}
        </svg>
        {hover != null && (
          <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <span className="small muted">Dia {hover + 1}</span>
            {hover <= lastIdx && <span className="tnum">Este mês {brl(cur[hover])}</span>}
            {ref[hover] != null && others.length > 0 && <span className="tnum dim">Média {brl(ref[hover]!)}</span>}
          </div>
        )}
      </div>
      <div className="row small" style={{ gap: 16, marginTop: 8 }}>
        <span className="row" style={{ gap: 6 }}>
          <i className="dot" style={{ background: OUT_COLOR }} /> {MONTHS[Number(focus.slice(5)) - 1]}
        </span>
        {others.length > 0 && (
          <span className="row" style={{ gap: 6 }}>
            <i className="dot" style={{ background: REF_COLOR }} /> média dos outros {others.length} meses
          </span>
        )}
      </div>
    </div>
  );
}

function WeekdayBars({ txs, from, to }: { txs: Transaction[]; from: string; to: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  const end = to < today() ? to : today();
  for (let d = from; d <= end; d = addDays(d, 1)) counts[fromISO(d).getDay()]++;
  for (const t of txs)
    if (t.date >= from && t.date <= end && SPEND_KINDS.includes(t.kind) && !t.oneoff) sums[fromISO(t.date).getDay()] -= t.amount;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const avg = order.map((d) => (counts[d] ? sums[d] / counts[d] : 0));
  const max = Math.max(1, ...avg);
  const top = avg.indexOf(Math.max(...avg));
  return (
    <div>
      <div className="wk-bars" onMouseLeave={() => setHover(null)}>
        {avg.map((v, i) => (
          <div key={i} className="wk-col" onMouseEnter={() => setHover(i)}>
            <span className="tnum small" style={{ opacity: hover === i || (hover == null && i === top) ? 1 : 0 }}>
              {brl(v)}
            </span>
            <motion.i
              style={{ background: i === top ? OUT_COLOR : 'rgba(232, 96, 44, 0.38)' }}
              initial={{ height: 0 }}
              animate={{ height: `${(v / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            />
            <span className="small dim">{WEEKDAYS_SHORT[order[i]]}</span>
          </div>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 10 }}>
        Média por dia. Seu dia mais caro é <b style={{ color: '#fff' }}>{WEEKDAYS_SHORT[order[top]]}</b>.
      </div>
    </div>
  );
}

function TopMerchants({ a }: { a: Analysis }) {
  const list = Object.entries(a.byMerchant)
    .filter(([, x]) => !['PIX para pessoas', 'Pagamento de fatura'].includes(x.cat))
    .sort((p, q) => q[1].v - p[1].v)
    .slice(0, 6);
  const max = Math.max(1, ...list.map(([, x]) => x.v));
  return (
    <div>
      {list.map(([k, x], i) => (
        <motion.div key={k} className="merchant" {...stagger(i)}>
          <span className="m-rank">{i + 1}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="m-name">{k}</span>
            <span className="m-track">
              <i style={{ width: `${(x.v / max) * 100}%` }} />
            </span>
          </span>
          <span style={{ textAlign: 'right' }}>
            <span className="tnum" style={{ display: 'block', fontWeight: 600 }}>{brl(x.v)}</span>
            <span className="small dim">{x.n}× · {brl(x.v / x.n)}</span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- lista ---------- */

function addCategory(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const custom = getPrefsRow().data.categories ?? [];
  const existing = allCategories(custom).find((c) => fold(c.name) === fold(clean));
  if (existing) return existing.name;
  setPrefs({ categories: [...custom, { name: clean, color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length] }] });
  return clean;
}

function CategoryPicker({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const prefs = usePrefs();
  const [all, setAll] = useState(true);
  const [q, setQ] = useState('');
  const apply = (cat: string) => {
    const store = useStore.getState();
    if (all && tx.merchant) {
      const same = Object.values(store.transactions).filter((t) => !t.deleted && t.merchant === tx.merchant && SPEND_KINDS.includes(t.kind));
      same.forEach((t) => store.put('transactions', { id: t.id, category: cat }));
      setPrefs({ fin_rules: { ...(getPrefsRow().data.fin_rules ?? {}), [tx.merchant]: cat } });
      toast(`${same.length} lançamento(s) de "${tx.merchant}" → ${cat}`);
    } else store.put('transactions', { id: tx.id, category: cat });
    onClose();
  };
  const options = allCategories(prefs.categories).filter((c) => !SYSTEM_CATEGORIES.includes(c.name) && fold(c.name).includes(fold(q)));
  const canCreate = q.trim() && !allCategories(prefs.categories).some((c) => fold(c.name) === fold(q.trim()));
  return (
    <div style={{ width: 270 }}>
      <input
        className="input"
        style={{ height: 34, marginBottom: 6 }}
        autoFocus
        placeholder="Buscar ou criar categoria"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const name = options[0]?.name ?? addCategory(q);
          if (name) apply(name);
        }}
      />
      {tx.merchant && (
        <label className="menu-item" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Aplicar a todos de "{tx.merchant.slice(0, 22)}"
        </label>
      )}
      <button
        className={`menu-item ${tx.oneoff ? 'sel' : ''}`}
        onClick={() => {
          useStore.getState().put('transactions', { id: tx.id, oneoff: !tx.oneoff });
          toast(tx.oneoff ? 'Voltou a contar como gasto pessoal' : 'Marcado como gasto da empresa (fora da conta)');
          onClose();
        }}
      >
        <Building2 size={14} color="#ffb38a" /> {tx.oneoff ? 'Tirar de "empresa"' : 'Gasto da empresa (fora da conta)'}
      </button>
      <div className="menu-sep" />
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {options.map((c) => (
          <button key={c.name} className={`menu-item ${c.name === tx.category ? 'sel' : ''}`} onClick={() => apply(c.name)}>
            <i className="dot" style={{ background: c.color }} /> {c.name}
            {c.name === tx.category && <Check size={14} style={{ marginLeft: 'auto' }} />}
          </button>
        ))}
        {canCreate && (
          <button className="menu-item" onClick={() => { const n = addCategory(q); if (n) apply(n); }}>
            <Plus size={14} /> Criar "{q.trim()}"
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, typeof Tag> = {
  Mercado: ShoppingCart,
  Delivery: Bike,
  'Restaurantes e bares': UtensilsCrossed,
  'Empório / conveniência': Store,
  Transporte: Car,
  Saúde: HeartPulse,
  Academia: Dumbbell,
  Assinaturas: Repeat,
  'Telefone e internet': Smartphone,
  'Compras e roupas': ShoppingBag,
  'Cuidados pessoais': Scissors,
  Lazer: Ticket,
  'PIX para pessoas': Users,
  'Tarifas e juros': Landmark,
  Doações: HandHeart,
  'Jogos e apostas': Dices,
  Outros: CircleDashed,
  Renda: Wallet,
  Reembolsos: Undo2,
  'Pagamento de fatura': CreditCard,
  Investimentos: PiggyBank,
};

export function CategoryIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = name.startsWith('Outras ') ? Layers : CATEGORY_ICONS[name] ?? Tag;
  return <Icon size={size} />;
}

function TxRow({ tx }: { tx: Transaction }) {
  const a = useAnchor();
  const positive = tx.amount > 0;
  const transfer = tx.kind === 'card_payment' || tx.kind === 'investment';
  const name = tx.account === 'unicred' && tx.merchant ? tx.merchant.replace(/\b\w/g, (c) => c.toUpperCase()) : tx.description;
  const editable = !transfer && SPEND_KINDS.includes(tx.kind);
  return (
    <div className="tx-row" style={{ opacity: transfer ? 0.55 : 1 }}>
      <span className="tx-ic" style={{ background: transfer ? 'var(--glass-2)' : positive ? 'rgba(95,211,160,0.13)' : 'rgba(255,143,143,0.12)' }}>
        {positive ? (
          <ArrowDownLeft size={16} color={transfer ? '#9393a6' : '#5fd3a0'} />
        ) : tx.account === 'unicred' ? (
          <ArrowUpRight size={16} color={transfer ? '#9393a6' : '#ff8f8f'} />
        ) : (
          <CreditCard size={15} color={transfer ? '#9393a6' : '#ff8f8f'} />
        )}
      </span>
      <div className="tx-body">
        <div className="tx-name">{name}</div>
        <div className="tx-meta">
          <span>{ACCOUNT_LABEL[tx.account as Account] ?? tx.account}</span>
          {tx.installment && <span>· parcela {tx.installment}</span>}
        </div>
      </div>
      <div className="tx-cat">
        {tx.oneoff && (
          <span className="cat-tag company" title="Gasto da empresa: aparece aqui, mas não entra nas contas">
            <Building2 size={12} /> Empresa
          </span>
        )}
        {editable ? (
          <button ref={a.ref} className="cat-tag" onClick={a.toggle}>
            <CategoryIcon name={tx.category} size={12} /> {tx.category}
          </button>
        ) : (
          <span className="cat-tag static">
            <CategoryIcon name={tx.category} size={12} /> {tx.category}
          </span>
        )}
      </div>
      <span className="tx-amt tnum" style={{ color: transfer || tx.oneoff ? 'var(--muted)' : positive ? '#5fd3a0' : '#ff8f8f', textDecoration: tx.oneoff ? 'line-through' : undefined }}>
        {positive ? '+' : ''}
        {brl(tx.amount, true)}
      </span>
      <button
        className="icon-btn sm tx-oneoff"
        title={tx.oneoff ? 'Voltar a contar como gasto pessoal' : 'Marcar como da empresa (pago com retirada, fora das suas contas)'}
        onClick={() => useStore.getState().put('transactions', { id: tx.id, oneoff: !tx.oneoff })}
        style={{ color: tx.oneoff ? '#ffd1a6' : undefined }}
      >
        <Building2 size={14} />
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close}>
        <CategoryPicker tx={tx} onClose={a.close} />
      </Popover>
    </div>
  );
}

const PAGE_SIZE = 30;
const SHORT_LABEL: Record<string, string> = { this: 'Este mês', last: 'Passado', '3m': '3 meses', custom: 'Período' };

/** Números de página com reticências: 1 … 4 5 6 … 10 (índices base 0; null = reticências). */
function pageList(cur: number, total: number): (number | null)[] {
  const keep = new Set([0, total - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < total));
  const out: (number | null)[] = [];
  [...keep].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i && p - arr[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

function TxList({ txs, category }: { txs: Transaction[]; category: string | null }) {
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState<string>('all');
  const [showTransfers, setShowTransfers] = useState(false);
  const [onlyCompany, setOnlyCompany] = useState(false);
  const [page, setPage] = useState(0);
  const f = fold(q);
  const list = txs
    .filter((t) => showTransfers || !['card_payment', 'investment'].includes(t.kind))
    .filter((t) => !onlyCompany || t.oneoff)
    .filter((t) => acc === 'all' || t.account === acc)
    .filter((t) => !category || t.category === category)
    .filter((t) => !f || fold(`${t.description} ${t.merchant ?? ''} ${t.category}`).includes(f))
    .sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  // filtro, busca ou período novo volta para a primeira página
  useEffect(() => setPage(0), [q, acc, showTransfers, onlyCompany, category, txs.length]);
  const groups: [string, Transaction[]][] = [];
  for (const t of list.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE)) {
    const g = groups.at(-1);
    if (g && g[0] === t.date) g[1].push(t);
    else groups.push([t.date, [t]]);
  }
  return (
    <div className="glass card">
      <div className="card-title" style={{ flexWrap: 'wrap' }}>
        <h3>Lançamentos {category ? `· ${category}` : ''}</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="row input" style={{ height: 32, padding: '0 10px', width: 190, gap: 6 }}>
            <Search size={14} className="dim" />
            <input className="bare" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ height: 32, padding: '0 10px', width: 'auto' }} value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="all">Todas as contas</option>
            {Object.entries(ACCOUNT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className={`chip ${onlyCompany ? 'on' : ''}`} onClick={() => setOnlyCompany((s) => !s)}>
            <Building2 size={13} /> Empresa
          </button>
          <button className={`chip ${showTransfers ? 'on' : ''}`} onClick={() => setShowTransfers((s) => !s)}>
            Faturas e reserva
          </button>
        </div>
      </div>
      {groups.map(([d, items]) => (
        <div key={d} style={{ marginBottom: 6 }}>
          <div className="small dim" style={{ padding: '10px 2px 2px', textTransform: 'capitalize' }}>
            {['Hoje', 'Ontem'].includes(labelDate(d)) ? `${labelDate(d)} · ` : ''}
            {WEEKDAYS_SHORT[fromISO(d).getDay()]}, {fromISO(d).getDate()} {MONTHS_SHORT[fromISO(d).getMonth()]}
          </div>
          {items.map((t) => (
            <TxRow key={t.id} tx={t} />
          ))}
        </div>
      ))}
      {!list.length && <div className="small dim" style={{ padding: 12 }}>Nenhum lançamento.</div>}
      {pages > 1 && (
        <div className="pager">
          <span className="small muted tnum">
            {cur * PAGE_SIZE + 1}–{Math.min(list.length, (cur + 1) * PAGE_SIZE)} de {list.length}
          </span>
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Página anterior">
              <ChevronLeft size={15} />
            </button>
            {pageList(cur, pages).map((p, i) =>
              p === null ? (
                <span key={`gap${i}`} className="small dim" style={{ padding: '0 4px' }}>…</span>
              ) : (
                <button key={p} className={`page-btn ${p === cur ? 'on' : ''}`} onClick={() => setPage(p)}>
                  {p + 1}
                </button>
              ),
            )}
            <button className="icon-btn sm" disabled={cur === pages - 1} onClick={() => setPage(cur + 1)} aria-label="Próxima página">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- página ---------- */

function KpiStrip({ items }: { items: { label: string; value: number; sub?: string; tone?: string }[] }) {
  return (
    <div className="glass kpi-strip">
      {items.map((k) => (
        <div key={k.label} className="kpi">
          <div className="small muted">{k.label}</div>
          <div className={`display ${k.tone ?? 'grad'} tnum`} style={{ fontSize: 28, marginTop: 6 }}>
            {k.value < 0 ? '−' : ''}R$ <CountUp value={Math.abs(Math.round(k.value))} />
          </div>
          {k.sub && <div className="small dim">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function FinancePage() {
  const txs = useRows('transactions');
  const months = useMemo(() => {
    const count: Record<string, number> = {};
    for (const t of txs) count[t.date.slice(0, 7)] = (count[t.date.slice(0, 7)] ?? 0) + 1;
    return Object.keys(count).filter((m) => count[m] >= 15).sort();
  }, [txs]);
  const t0 = today();
  const thisMonth = `${t0.slice(0, 7)}-01`;
  const lastMonthStart = (() => {
    const d = fromISO(thisMonth);
    d.setMonth(d.getMonth() - 1);
    return toISO(d);
  })();
  const threeAgo = (() => {
    const d = fromISO(t0);
    d.setMonth(d.getMonth() - 3);
    return addDays(toISO(d), 1);
  })();
  const [pk, setPk] = useState<string>('this');
  const [custom, setCustom] = useState({ from: threeAgo, to: t0 });
  const span = (from: string, to: string) => Math.max(1, Math.round((diffDays(to, from) + 1) / 30.44));
  const periods: Period[] = [
    { key: 'this', label: 'Este mês', from: thisMonth, to: t0, n: 1 },
    { key: 'last', label: 'Mês passado', from: lastMonthStart, to: addDays(thisMonth, -1), n: 1 },
    { key: '3m', label: 'Últimos 3 meses', from: threeAgo, to: t0, n: 3 },
    { key: 'custom', label: 'Personalizado', from: custom.from, to: custom.to, n: span(custom.from, custom.to) },
  ];
  const period = periods.find((p) => p.key === pk) ?? periods[0];
  const a = useAnalysis(txs, period);
  const [cat, setCat] = useState<string | null>(null);
  const list = useMemo(() => txs.filter((t) => t.date >= period.from && t.date <= period.to), [txs, period.from, period.to]);
  const monthly = months.map((m) => {
    const inM = txs.filter((t) => t.date.startsWith(m) && !t.oneoff);
    return {
      month: m,
      income: inM.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
      spend: -inM.filter((t) => SPEND_KINDS.includes(t.kind)).reduce((s, t) => s + t.amount, 0),
    };
  });
  const per = a.n > 1 ? ' /mês' : '';
  const result = a.cash;
  const perMonth = (v: number) => (a.n > 1 ? `≈ ${brl(v / a.n)} por mês` : undefined);

  if (!txs.length)
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="display h1 grad">Financeiro</h1>
        </div>
        <div className="glass card">
          <div className="empty">
            <div className="orb"><Wallet size={34} color="#fff" strokeWidth={1.6} /></div>
            <h3>Traga seus extratos</h3>
            <div style={{ marginBottom: 16 }}>CSV do Nubank, CSV da fatura Unicred ou o arquivo convertido do extrato da conta.</div>
            <ImportButton />
          </div>
        </div>
      </div>
    );

  const focus = period.to.slice(0, 7);

  return (
    <div className="page wide">
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div className="row">
          <div>
            <div className="eyebrow">{txs.length} lançamentos · Nubank + Unicred</div>
            <h1 className="display h1 grad" style={{ marginTop: 8 }}>Financeiro</h1>
          </div>
          <div className="fin-controls">
            <div className="segmented">
              {periods.map((p) => (
                <button key={p.key} className={p.key === period.key ? 'on' : ''} onClick={() => setPk(p.key)}>
                  <span className="lbl-full">{p.label}</span>
                  <span className="lbl-short">{SHORT_LABEL[p.key]}</span>
                </button>
              ))}
            </div>
            <ImportButton />
          </div>
        </div>
      </div>

      {pk === 'custom' && (
        <div className="row" style={{ gap: 8, margin: '-6px 0 14px', justifyContent: 'flex-end' }}>
          <span className="small muted">de</span>
          <input type="date" className="input" style={{ width: 160, height: 34 }} value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
          <span className="small muted">até</span>
          <input type="date" className="input" style={{ width: 160, height: 34 }} value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      )}

      <KpiStrip
        items={[
          { label: 'Entrou', value: a.income, tone: 'grad-pos', sub: perMonth(a.income) ?? 'pró-labore e repasses' },
          { label: 'Gasto do dia a dia', value: a.spend, tone: 'grad-neg', sub: perMonth(a.spend) ?? 'pessoal, já sem o que voltou' },
          { label: 'Sobrou no caixa', value: result, tone: result < 0 ? 'grad-neg' : 'grad-pos', sub: perMonth(result) ?? 'entrou − faturas pagas − PIX e débitos' },
          a.reserve > 0
            ? { label: 'Tirado da reserva', value: a.reserve, tone: 'grad-neg', sub: perMonth(a.reserve) ?? 'resgates de aplicação' }
            : { label: 'Guardado', value: -a.reserve, tone: 'grad-pos', sub: perMonth(-a.reserve) ?? 'foi para a caixinha' },
        ]}
      />

      {a.oneoff > 0 && (
        <div className="small muted row" style={{ gap: 6, margin: '10px 4px 0' }}>
          <Building2 size={13} /> {brl(a.oneoff)} em gastos da empresa pagos com retirada ficaram fora das suas contas.
        </div>
      )}

      <div className="grid grid-12" style={{ marginTop: 14 }}>
        <div className="span-8 glass card">
          <div className="card-title"><h3>Ritmo de gastos</h3><span className="small muted">acumulado, só pessoal</span></div>
          <PaceChart txs={txs} months={months} focus={focus} />
        </div>
        <div className="span-4 glass card">
          <div className="card-title">
            <h3>Para onde foi{a.n > 1 ? ' · média por mês' : ''}</h3>
            {cat && <button className="link" onClick={() => setCat(null)}>limpar</button>}
          </div>
          <CategoryBars a={a} picked={cat} onPick={setCat} />
          {a.refunds > 0 && <div className="small dim" style={{ marginTop: 10 }}>Fora das categorias: amigos devolveram {brl(a.refunds / a.n)}{per} por PIX, já descontado do gasto.</div>}
        </div>

        <motion.div className="span-7 glass card" {...stagger(0)}>
          <div className="card-title">
            <h3><Lightbulb size={16} color="#ffd1a6" /> Raio-X do PURCS</h3>
            <span className="small muted">{period.label}</span>
          </div>
          {insights(a).map((it, i) => (
            <motion.div key={it.title} {...stagger(i)} className="insight">
              <span className={`ins-dot ${it.tone}`} />
              <div>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                <div className="small muted">{it.text}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <div className="span-5 stack">
          <div className="glass card">
            <div className="card-title"><h3>Entrou × saiu por mês</h3><span className="small muted">só pessoal</span></div>
            <MonthBars data={monthly} />
          </div>
          <div className="glass card">
            <div className="card-title"><h3>Gasto por dia da semana</h3></div>
            <WeekdayBars txs={txs} from={period.from} to={period.to} />
          </div>
        </div>

        <div className="span-8">
          <TxList txs={list} category={cat} />
        </div>
        <div className="span-4 stack">
          <div className="glass card">
            <div className="card-title"><h3>Onde você mais gasta</h3></div>
            <TopMerchants a={a} />
          </div>
          <div className="glass card">
            <div className="card-title"><h3><Repeat size={16} /> Recorrentes</h3></div>
            {Object.entries(a.byMerchant)
              .filter(([, x]) => x.months.size >= Math.min(2, a.n) && ['Assinaturas', 'Academia', 'Saúde', 'Telefone e internet'].includes(x.cat))
              .sort((x, y) => y[1].v - x[1].v)
              .map(([k, x]) => (
                <div key={k} className="row small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, textTransform: 'capitalize' }}>{k}</span>
                  <span className="dim">{x.cat}</span>
                  <span className="tnum" style={{ width: 80, textAlign: 'right', fontWeight: 600 }}>{brl(x.v / a.n)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

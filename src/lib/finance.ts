import { stableId } from './ids';
import { fold } from './parse';

export type Account = 'unicred' | 'unicred_cartao' | 'nubank' | 'nubank_conta';
export type TxKind = 'expense' | 'income' | 'refund' | 'card_payment' | 'investment' | 'fee';

export interface RawTx {
  id: string;
  date: string;
  description: string;
  amount: number; // negativo = saída
  account: Account;
  kind: TxKind;
  category: string;
  installment: string | null;
  merchant: string;
  oneoff?: boolean;
}

/**
 * Seu nome como aparece nos extratos (ex.: /joao da silva|minha empresa ltda/). Transferência que chega com
 * esse nome é sua mesma (entre contas), não devolução. Ajuste para o seu.
 */
export const OWN_NAMES = /coloque seu nome aqui/;

/** Contas de dinheiro (não cartão). O que entra e sai delas é o caixa de verdade. */
export const BANK_ACCOUNTS = ['unicred', 'nubank_conta'];

/**
 * Caixa do período: tudo que entrou e saiu das contas de dinheiro, menos o que
 * foi para a reserva (aplicação/resgate). Fatura paga conta no mês em que foi paga, não no da compra, então o
 * começo do mês não parece sobra. Retirada que a empresa manda e o gasto da empresa se anulam sozinhos.
 * Caixa + o que foi para a reserva = quanto o saldo da conta variou.
 */
export function cashFlow(txs: { date: string; amount: number; account: string; kind: string; oneoff?: boolean }[], from: string, to: string) {
  const inP = txs.filter((t) => t.date >= from && t.date <= to);
  const cash = inP.filter((t) => BANK_ACCOUNTS.includes(t.account) && t.kind !== 'investment').reduce((a, t) => a + t.amount, 0);
  const saved = -inP.filter((t) => t.kind === 'investment').reduce((a, t) => a + t.amount, 0);
  // compras no cartão do período: as faturas fecham perto do dia 1, então é o que vence no mês seguinte
  const cardOpen = -inP
    .filter((t) => !BANK_ACCOUNTS.includes(t.account) && ['expense', 'fee', 'refund'].includes(t.kind) && !t.oneoff)
    .reduce((a, t) => a + t.amount, 0);
  return { cash, saved, cardOpen };
}

export const ACCOUNT_LABEL: Record<Account, string> = {
  unicred: 'Unicred · conta',
  unicred_cartao: 'Unicred · cartão',
  nubank: 'Nubank · cartão',
  nubank_conta: 'Nubank · conta',
};

export const CATEGORIES: { name: string; color: string; essential: boolean }[] = [
  { name: 'Mercado', color: '#ffa36b', essential: true },
  { name: 'Delivery', color: '#ff5b36', essential: false },
  { name: 'Restaurantes e bares', color: '#ff8f6b', essential: false },
  { name: 'Empório / conveniência', color: '#ffd1a6', essential: false },
  { name: 'Transporte', color: '#d4d4dc', essential: true },
  { name: 'Saúde', color: '#ffd9c4', essential: true },
  { name: 'Academia', color: '#ffc4a3', essential: true },
  { name: 'Assinaturas', color: '#ffb38a', essential: false },
  { name: 'Telefone e internet', color: '#d4d4dc', essential: true },
  { name: 'Compras e roupas', color: '#ffa36b', essential: false },
  { name: 'Cuidados pessoais', color: '#ff9a6b', essential: false },
  { name: 'Lazer', color: '#ff5a5f', essential: false },
  { name: 'PIX para pessoas', color: '#94a3b8', essential: false },
  { name: 'Tarifas e juros', color: '#ef4444', essential: false },
  { name: 'Doações', color: '#ffd1a6', essential: false },
  { name: 'Jogos e apostas', color: '#dc2626', essential: false },
  { name: 'Outros', color: '#6b7280', essential: false },
  { name: 'Renda', color: '#ffa36b', essential: false },
  { name: 'Reembolsos', color: '#e5e5ec', essential: false },
  { name: 'Pagamento de fatura', color: '#475569', essential: false },
  { name: 'Investimentos', color: '#c7c7d1', essential: false },
];

export const SYSTEM_CATEGORIES = ['Renda', 'Reembolsos', 'Pagamento de fatura', 'Investimentos'];
export const CUSTOM_COLORS = ['#ff7a4d', '#ffd1a6', '#f5f5f7', '#c7c7d1', '#ff4d1f', '#ffa36b', '#8a8aa0', '#ffe2d3'];

/** Categorias padrão + as criadas pelo usuário (guardadas nas preferências). */
export function allCategories(custom: { name: string; color: string }[] = []) {
  return [...CATEGORIES, ...custom.filter((c) => !CATEGORIES.some((d) => d.name === c.name)).map((c) => ({ ...c, essential: false }))];
}

export const categoryColor = (name: string, custom: { name: string; color: string }[] = []) =>
  allCategories(custom).find((c) => c.name === name)?.color ?? '#6b7280';

const ALIASES: [RegExp, string][] = [
  [/uber/, 'uber'],
  [/99app/, '99'],
  [/ifood club/, 'ifood club'],
  [/bistek/, 'bistek'],
  [/emporio exclusive/, 'emporio exclusive'],
  [/openai|chatgpt/, 'chatgpt'],
];

export function merchantKey(desc: string): string {
  const f = fold(desc);
  const person = f.match(/(?:deb pix|cred pix|pgto pix|tef pix)[^/]*\/\s*([^)]+)/);
  if (person) return person[1].replace(/^[\d. ]+/, '').replace(/\s+/g, ' ').trim();
  for (const [re, name] of ALIASES) if (re.test(f) && !/^iof/.test(f)) return name;
  return f
    .replace(/ - parcela \d+\/\d+/, '')
    .replace(/^(ifd\*|pg \*|mp \*|app\*|uber \*|uber uber \*|99app \*)/, '')
    .replace(/\(.*?doc\.:\s*/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RULES: [RegExp, string][] = [
  [/multicine|cinema|ingresso|associacao atletica|show|festa/, 'Lazer'],
  [/fast gaming|\bbet\b|bet365|aposta|blaze|sportingbet|esportes da sorte/, 'Jogos e apostas'],
  [/pix marketplace/, 'Compras e roupas'],
  [/ifood club|apple\.com|nubank croma|spotify|netflix|youtube|prime video|chatgpt|openai|google one/, 'Assinaturas'],
  [/^ifd\*|ifood|delivery hero|rappi|ze delivery/, 'Delivery'],
  [/bistek|koch|angeloni|giassi|mercado|combo atacadista|atacad|fort atacad|supermerc|hortifruti/, 'Mercado'],
  [/emporio exclusive|togg bebidas|comercio varejista|oreiconveniencia|conveniencia|tabacaria/, 'Empório / conveniência'],
  [/uber|99app|99 app|blablacar|onibus|passagem|itaguacu administrado|estacion|park|pista \d|campinas av kennedy/, 'Transporte'],
  [/posto/, 'Transporte'],
  [/drajoyce|gfarma|nutricao|nutri|villanutri|dimed|panvel|drogaria|farmac|raia|santa luzia|clinica|laborat|medic|psico/, 'Saúde'],
  [/academia|force one|smart fit|gympass|wellhub/, 'Academia'],
  [/telefonica|vivo|claro|tim |oi /, 'Telefone e internet'],
  [/barbearia|salao|cabeleir/, 'Cuidados pessoais'],
  [/saintgermain|shopping|renner|riachuelo|zara|cea |shein|amazon|mercadolivre|mercado livre|galo sh|tiktok|mycell/, 'Compras e roupas'],
  [/restaurante|di valli|bar |pub|pizz|burguer|burger|lanchonete|cafe/, 'Restaurantes e bares'],
  [/vakinha/, 'Doações'],
  [/tarifa|anuidade|juros|iof|multa|adiantamento a depositante/, 'Tarifas e juros'],
];

export function categorize(desc: string, kind: TxKind): string {
  if (kind === 'card_payment') return 'Pagamento de fatura';
  if (kind === 'investment') return 'Investimentos';
  if (kind === 'income') return 'Renda';
  if (kind === 'refund') return 'Reembolsos';
  if (kind === 'fee') return 'Tarifas e juros';
  const d = fold(desc);
  for (const [re, cat] of RULES) if (re.test(d)) return cat;
  if (/deb pix|pgto pix|transferencia pix|tef pix|transferencia enviada/.test(d)) return 'PIX para pessoas';
  return 'Outros';
}

const money = (s: string) => {
  const neg = /-/.test(s);
  const n = Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
  return neg ? -n : n;
};

const br = (d: string) => {
  const [dd, mm, yy] = d.split('/');
  return `${yy}-${mm}-${dd}`;
};

function finish(list: Omit<RawTx, 'id' | 'category' | 'merchant'>[]): RawTx[] {
  const seen: Record<string, number> = {};
  return list.map((t) => {
    const k = `${t.account}|${t.date}|${t.description}|${t.amount.toFixed(2)}`;
    seen[k] = (seen[k] ?? 0) + 1;
    return {
      ...t,
      id: stableId(`tx:${k}:${seen[k]}`),
      category: categorize(t.description, t.kind),
      merchant: merchantKey(t.description),
    };
  });
}

/** CSV do Nubank (cartão): date,title,amount — positivo = compra. */
export function parseNubankCSV(text: string): RawTx[] {
  const rows: Omit<RawTx, 'id' | 'category' | 'merchant'>[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}),(.*),("[^"]*"|[^,"]*)$/);
    if (!m) continue;
    const [, date, title, amt] = m;
    const v = money(amt);
    const inst = title.match(/Parcela (\d+\/\d+)/i)?.[1] ?? null;
    const desc = title.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
    const isPayment = /pagamento recebido/i.test(desc);
    const isFee = /^iof |juros|anuidade|multa/i.test(desc);
    rows.push({
      date,
      description: desc,
      amount: -v,
      account: 'nubank',
      kind: isPayment ? 'card_payment' : isFee ? 'fee' : v < 0 ? 'refund' : 'expense',
      installment: inst,
    });
  }
  return finish(rows);
}

/** CSV da fatura do cartão Unicred (separado por ;). */
export function parseUnicredCardCSV(text: string): RawTx[] {
  const rows: Omit<RawTx, 'id' | 'category' | 'merchant'>[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const c = line.split(';');
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(c[0] ?? '') || !c[3]) continue;
    const v = money(c[3]);
    const desc = c[2].trim();
    const isPayment = /pagamento recebido/i.test(desc);
    const isFee = /anuidade|juros|^iof|multa/i.test(desc);
    rows.push({
      date: br(c[0]),
      description: desc,
      amount: -v,
      account: 'unicred_cartao',
      kind: isPayment ? 'card_payment' : isFee ? 'fee' : v < 0 ? 'refund' : 'expense',
      installment: desc.match(/(\d+\/\d+)/)?.[1] ?? null,
    });
  }
  return finish(rows);
}

/**
 * Texto do extrato da conta Unicred (pdftotext -raw). Cada lançamento: linha com data + descrição,
 * continuações da descrição, depois duas linhas de valor (saldo e lançamento, em qualquer ordem —
 * conferido pelo saldo corrido).
 */
export function parseUnicredStatement(text: string, ownNames = OWN_NAMES): RawTx[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const opening = text.match(/Saldo em \d{2}\/\d{2}\/\d{4}: (-?\s*R\$\s*-?[\d.]+,\d{2})/);
  let balance = opening ? money(opening[1]) : 0;
  const entries: { date: string; desc: string[]; vals: number[] }[] = [];
  let cur: (typeof entries)[number] | null = null;
  // Valores podem vir em linha própria (layout antigo) ou no fim da linha da descrição, os dois
  // juntos ("R$ 217,04 R$ 0,10") — o pdftotext do Mac (poppler 26) junta assim.
  const MONEY = /-?\s*R\$\s*-?[\d.]+,\d{2}/g;
  for (const raw of lines) {
    const d = raw.match(/^(\d{2}\/\d{2}\/\d{4}) (.+)$/);
    if (d && /^\d{2}:\d{2}/.test(d[2])) {
      cur = null;
      continue;
    }
    let l = raw;
    if (d) {
      cur = { date: br(d[1]), desc: [], vals: [] };
      entries.push(cur);
      l = d[2];
    }
    if (!cur) continue;
    const vals = l.match(MONEY) ?? [];
    const textPart = (vals.length ? l.slice(0, l.search(MONEY)) : l).trim();
    if (textPart && cur.vals.length === 0) cur.desc.push(textPart);
    for (const v of vals) if (cur.vals.length < 2) cur.vals.push(money(v));
  }
  const rows: Omit<RawTx, 'id' | 'category' | 'merchant'>[] = [];
  for (const e of entries) {
    if (e.vals.length < 2) continue;
    const [a, b] = e.vals;
    let value = b;
    let saldo = a;
    if (Math.abs(balance + b - a) > 0.009 && Math.abs(balance + a - b) <= 0.009) {
      value = a;
      saldo = b;
    }
    balance = saldo;
    const desc = e.desc.join(' ').replace(/\s+/g, ' ').trim();
    const f = fold(desc);
    let kind: TxKind = value < 0 ? 'expense' : 'income';
    if (/nu pagamentos|cobranca propria/.test(f)) kind = 'card_payment';
    else if (/aplicacao financeira/.test(f)) kind = 'investment';
    else if (/tarifa|juros|iof/.test(f)) kind = 'fee';
    else if (value > 0 && !ownNames.test(f)) kind = 'refund';
    rows.push({ date: e.date, description: desc, amount: value, account: 'unicred', kind, installment: null });
  }
  return finish(rows);
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Fatura do cartão Unicred em PDF. O texto do pdftotext sai com as letras espaçadas
 * ("UBE R * PE ND I NG"), então o script reconstrói as linhas pelas posições dos glifos
 * (pdftotext -bbox) e passa aqui as linhas já limpas: "30/set UBER * PENDING R$ 9,95".
 * Compra internacional vem com a descrição numa linha vizinha ("LOJA EXEMPLO - USD 1").
 */
export function parseUnicredCardPDF(lines: string[], refYear: number, refMonth: number): RawTx[] {
  const rows: Omit<RawTx, 'id' | 'category' | 'merchant'>[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{2})\/([a-z]{3}) ?(.*?)\s*(-?\s*R\$\s*[\d.]+,\d{2})$/i);
    if (!m) continue;
    const mi = MES.indexOf(m[2].toLowerCase());
    if (mi < 0) continue;
    let desc = m[3].trim();
    if (!desc) {
      const fx = /\s+-\s+[A-Z]{3}\s+[\d.,]+$/;
      const near = [lines[i - 1], lines[i + 1], lines[i + 2]].find((x) => x && fx.test(x));
      desc = near ? near.replace(fx, '').trim() : 'Compra internacional';
    }
    const year = mi > refMonth ? refYear - 1 : refYear;
    const v = money(m[4]);
    const isPayment = /pagamento recebido/i.test(desc);
    const isFee = /anuidade|juros|^iof|multa/i.test(desc);
    rows.push({
      date: `${year}-${String(mi + 1).padStart(2, '0')}-${m[1]}`,
      description: desc,
      amount: -v,
      account: 'unicred_cartao',
      kind: isPayment ? 'card_payment' : isFee ? 'fee' : v < 0 ? 'refund' : 'expense',
      installment: desc.match(/(\d+\/\d+)/)?.[1] ?? null,
    });
  }
  return finish(rows);
}

/** Extrato da conta Nubank em PDF (pdftotext -raw): "04 NOV 2026 Total de entradas + 17.500,00". */
export function parseNubankAccountStatement(text: string, ownNames = OWN_NAMES): RawTx[] {
  const rows: Omit<RawTx, 'id' | 'category' | 'merchant'>[] = [];
  let date = '';
  let sign = 0;
  let desc: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    const day = l.match(/^(\d{2}) ([A-Z]{3}) (\d{4}) Total de (entradas|saídas)/i);
    const total = l.match(/^Total de (entradas|saídas)/i);
    if (day || total) {
      if (day) date = `${day[3]}-${String(MES.indexOf(day[2].toLowerCase()) + 1).padStart(2, '0')}-${day[1]}`;
      sign = /entradas/i.test((day ?? total)![day ? 4 : 1]) ? 1 : -1;
      desc = [];
      continue;
    }
    if (!sign || !date) continue;
    if (/^O saldo líquido/i.test(l)) break;
    if (/^[\d.]+,\d{2}$/.test(l)) {
      const full = desc.join(' ').replace(/\s+/g, ' ').trim();
      const description = full.split(' - ')[0].trim();
      const f = fold(full);
      const value = sign * money(l);
      let kind: TxKind = value < 0 ? 'expense' : 'income';
      if (/pagamento de fatura/.test(f)) kind = 'card_payment';
      else if (/aplicacao|resgate|rdb|caixinha/.test(f)) kind = 'investment';
      else if (/tarifa|juros|iof/.test(f)) kind = 'fee';
      else if (value > 0 && !ownNames.test(f)) kind = 'refund';
      rows.push({ date, description, amount: value, account: 'nubank_conta', kind, installment: null });
      desc = [];
      continue;
    }
    desc.push(l);
  }
  return finish(rows);
}

/**
 * Gasto grande (>= R$ 1.000) entra como pontual, fora da média do mês. Se no mesmo dia entrou o
 * mesmo valor (empresa bancando ou reembolsando), a entrada também vira pontual.
 */
export function markOneoffs(list: RawTx[]): RawTx[] {
  const big = list.filter((t) => t.kind === 'expense' && t.amount <= -1000);
  for (const t of big) {
    t.oneoff = true;
    const pair =
      list.find((x) => x.date === t.date && Math.abs(x.amount + t.amount) < 0.01 && x.amount > 0) ??
      // retirada que chegou em outra conta até 3 dias antes: mesma ordem de valor, só entrada de renda ainda pessoal
      list.find((x) => {
        const gap = (Date.parse(t.date) - Date.parse(x.date)) / 864e5;
        return x.kind === 'income' && !x.oneoff && gap >= 0 && gap <= 3 && Math.abs(x.amount + t.amount) <= 5;
      });
    if (pair) pair.oneoff = true;
  }
  return list;
}

export function detectAndParse(name: string, text: string): RawTx[] {
  if (/^date,title,amount/m.test(text)) return markOneoffs(parseNubankCSV(text));
  if (/Final do cart/.test(text)) return markOneoffs(parseUnicredCardCSV(text));
  if (/Lan.amentos/.test(text) && /Saldo em/.test(text)) return markOneoffs(parseUnicredStatement(text));
  if (/Movimentações/.test(text) && /Total de (entradas|saídas)/.test(text)) return markOneoffs(parseNubankAccountStatement(text));
  if (name.endsWith('.json')) return JSON.parse(text) as RawTx[];
  throw new Error(`Formato não reconhecido: ${name}`);
}

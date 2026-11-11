// Converte os extratos num JSON normalizado: CSV Nubank (cartão), PDF extrato conta Nubank,
// CSV ou PDF da fatura Unicred, PDF extrato conta Unicred.
// Uso: node scripts/import-finance.cjs --base import/financas.json <arquivos...> > /tmp/novo.json
// (a saída é a base + os novos; conferir e depois substituir import/financas.json por ela)
// Requer pdftotext (poppler): no Mac `brew install poppler`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { detectAndParse, markOneoffs, parseUnicredCardPDF, type RawTx } from '../src/lib/finance';

const pdf = (f: string, mode: string) => execFileSync('pdftotext', [mode, '-enc', 'UTF-8', f, '-']).toString('utf8');

/** Linhas do PDF remontadas pela posição dos glifos (a fatura Unicred espaça cada letra). */
function bboxLines(f: string): string[] {
  const html = pdf(f, '-bbox');
  const out: string[] = [];
  for (const page of html.split('<page ').slice(1)) {
    const byY = new Map<number, { x0: number; x1: number; w: string }[]>();
    for (const m of page.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)) {
      const y = Math.round(Number(m[2]));
      const w = m[4].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x0: Number(m[1]), x1: Number(m[3]), w });
    }
    for (const y of [...byY.keys()].sort((a, b) => a - b)) {
      const ws = byY.get(y)!.sort((a, b) => a.x0 - b.x0);
      let line = ws[0].w;
      for (let i = 1; i < ws.length; i++) line += (ws[i].x0 - ws[i - 1].x1 > 2 ? ' ' : '') + ws[i].w;
      out.push(line);
    }
  }
  return out;
}

// --base <json>: o último financas.json importado. Lançamento antigo que ficou sem par exato
// (mesmo id) dentro do período dos arquivos novos é casado 1 para 1 com um novo da mesma conta e
// valor, até 3 dias de diferença e mesmo estabelecimento (ou ambos tarifa), e o novo sai.
// Pega o Nubank mudando a data quando a fatura fecha e a fatura Unicred em PDF descrevendo o IOF
// diferente do CSV. Sem isso o app duplicaria (ele só pula id igual).
const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const base: RawTx[] = bi >= 0 ? JSON.parse(readFileSync(args.splice(bi, 2)[1], 'utf8')) : [];

const all: RawTx[] = [];
for (const f of args) {
  if (!f.toLowerCase().endsWith('.pdf')) {
    all.push(...detectAndParse(f, readFileSync(f, 'utf8')));
    continue;
  }
  const raw = pdf(f, '-raw');
  if (/LAN.AMENTOS\s*–\s*VISA|R EF\.:/.test(raw)) {
    const lines = bboxLines(f);
    const ref = lines.join('\n').match(/REF\.:\s*([a-z]{3})\/\s*(\d{4})/i);
    if (!ref) throw new Error(`Fatura Unicred sem referência (REF.: mês/ano): ${f}`);
    const mi = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(ref[1].toLowerCase());
    all.push(...markOneoffs(parseUnicredCardPDF(lines, Number(ref[2]), mi)));
    continue;
  }
  all.push(...detectAndParse(f, raw));
}
// segunda passada com todos os arquivos juntos: a retirada e a compra da empresa podem estar em extratos diferentes
let uniq = markOneoffs([...new Map(all.map((t) => [t.id, t])).values()].sort((a, b) => a.date.localeCompare(b.date)));
if (base.length) {
  const ids = new Set(uniq.map((t) => t.id));
  const baseIds = new Set(base.map((t) => t.id));
  const span = new Map<string, [string, string]>();
  for (const t of uniq) {
    const s = span.get(t.account);
    span.set(t.account, s ? [s[0] < t.date ? s[0] : t.date, s[1] > t.date ? s[1] : t.date] : [t.date, t.date]);
  }
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  const orphans = base.filter((t) => {
    const s = span.get(t.account);
    return s && t.date >= s[0] && t.date <= s[1] && !ids.has(t.id);
  });
  const drop = new Set<string>();
  for (const o of orphans) {
    const twin = uniq.find(
      (t) =>
        !baseIds.has(t.id) && !drop.has(t.id) && t.account === o.account && Math.abs(t.amount - o.amount) < 0.005 &&
        days(t.date, o.date) <= 3 && (t.merchant === o.merchant || (t.kind === 'fee' && o.kind === 'fee')),
    );
    if (twin) {
      drop.add(twin.id);
      process.stderr.write(`já importado: ${o.date} ${o.description} ${o.amount} (novo: ${twin.date} ${twin.description})\n`);
    }
  }
  uniq = [...base.filter((t) => !ids.has(t.id)), ...uniq.filter((t) => !drop.has(t.id))].sort((a, b) => a.date.localeCompare(b.date));
}
process.stdout.write(JSON.stringify(uniq, null, 1));

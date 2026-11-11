import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const tmp = mkdtempSync(join(tmpdir(), 'pucs-workout-'));
let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
try {
  const outfile = join(tmp, 'workout.cjs');
  buildSync({ entryPoints: ['src/lib/workout.ts'], bundle: true, platform: 'node', format: 'cjs', outfile });
  const { buildEntries, reconcileEntries, volume, summarizeWorkouts, exerciseProgress, exerciseKey, workoutMinutes, planSplits } = createRequire(import.meta.url)(outfile);
  const split = { id: 's', name: 'A', exercises: [{ id: 'a', name: 'Supino', sets: 3, reps: '10', rest: 60 }, { id: 'b', name: 'Remada', sets: 2, reps: '10', rest: 60 }] };
  const entries = buildEntries(split);
  entries[0].sets[0] = { w: 40, r: 10, done: true };
  entries[0].sets[2] = { w: 45, r: 8, done: true };
  const updated = { ...split, exercises: [{ ...split.exercises[0], sets: 1, name: 'Supino reto' }] };
  check('edição exclui exercício e renomeia pelo id', () => { const r = reconcileEntries(updated, entries); assert.equal(r.length, 1); assert.equal(r[0].name, 'Supino reto'); });
  check('redução de séries preserva todas as séries já feitas', () => { const r = reconcileEntries(updated, entries); assert.equal(r[0].sets.length, 3); assert.equal(r[0].sets[2].w, 45); });
  check('lista vazia permanece vazia ao reconciliar', () => assert.deepEqual(reconcileEntries({ ...split, exercises: [] }, entries), []));
  check('adição de séries cria campos vazios sem duplicar carga', () => { const r = reconcileEntries({ ...split, exercises: [{ ...split.exercises[0], sets: 5 }] }, entries); assert.equal(r[0].sets.length, 5); assert.equal(r[0].sets[4].w, null); assert.equal(r[0].sets[0].w, 40); });
  check('reordenar preserva os valores do exercício correto', () => assert.equal(reconcileEntries({ ...split, exercises: [...split.exercises].reverse() }, entries)[1].sets[0].w, 40));
  check('sessão guarda descanso e repetições sem depender de edição futura', () => { assert.equal(entries[0].rest, 60); const r = reconcileEntries({ ...split, exercises: [{ ...split.exercises[0], rest: 90 }] }, entries); assert.equal(r[0].rest, 90); assert.equal(entries[0].rest, 60); });
  const log = { id: 'l', date: '2026-10-01', entries, started_at: '2026-10-01T12:00:00Z', finished_at: '2026-10-01T12:40:00Z' };
  check('volume só soma séries concluídas', () => assert.equal(volume(log), 760));
  check('relatório ignora sessões abertas e excluídas', () => { const r = summarizeWorkouts([log, { ...log, id: 'open', finished_at: null }, { ...log, id: 'deleted', deleted: true }]); assert.equal(r.count, 1); assert.equal(r.sets, 2); assert.equal(r.volume, 760); assert.equal(r.averageMinutes, 40); });
  check('duração ausente não reduz média para zero', () => assert.equal(summarizeWorkouts([log, { ...log, started_at: null }]).averageMinutes, 40));
  check('duração invertida é descartada', () => assert.equal(workoutMinutes({ ...log, started_at: '2026-10-01T13:00:00Z' }), null));
  check('histórico por exercício normaliza acentos e espaços', () => assert.equal(exerciseKey('  ELEVAÇÃO   Lateral '), exerciseKey('elevacao lateral')));
  check('carga máxima e volume vêm das séries feitas', () => { const r = exerciseProgress([log], 'supino'); assert.equal(r[0].load, 45); assert.equal(r[0].volume, 760); });
  check('renomear exercício mantém a evolução anterior pelo id', () => { const renamed = { ...log, date: '2026-10-10', entries: [{ ...entries[0], name: 'Supino reto' }] }; const r = exerciseProgress([log, renamed], 'supino reto'); assert.equal(r.length, 2); assert.equal(r[0].date, '2026-10-01'); });
  check('relatório vazio não inventa duração', () => assert.equal(summarizeWorkouts([]).averageMinutes, null));

  const week = [[1, 'Peito'], [2, 'Costas'], [3, 'Perna'], [4, 'Peito'], [5, 'Costas']].map(([weekday, name]) => ({ id: `w${weekday}`, weekday, name, exercises: [] }));
  const names = (rests) => { const p = planSplits('2026-10-26', '2026-11-03', week, (d) => rests.includes(d)); return Object.values(p).map((s) => s?.name ?? '-').join(' '); };
  check('sem descanso a divisão segue o dia da semana', () => assert.equal(names([]), 'Peito Costas Perna Peito Costas - - Peito Costas'));
  check('descanso na quarta empurra Perna para quinta e o resto até sábado', () => assert.equal(names(['2026-10-28']), 'Peito Costas Perna Perna Peito Costas - Peito Costas'));
  check('dois descansos seguidos ocupam sábado e domingo', () => assert.equal(names(['2026-10-28', '2026-10-29']), 'Peito Costas Perna Perna Perna Peito Costas Peito Costas'));
  check('descanso em dia sem treino não mexe na divisão', () => assert.equal(names(['2026-11-01']), 'Peito Costas Perna Peito Costas - - Peito Costas'));

  console.log(`${checks} verificações de treino passaram.`);
} finally { rmSync(tmp, { recursive: true, force: true }); }

// 出題ロジックの単体テスト。 node tools/test-srs.mjs
import { emptyRecord, gradeRecord, orderPool, isWeak, pickDistractors } from '../srs.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const t = (name, cond, extra='') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
};
const DAY = 864e5, NOW = 1_700_000_000_000, FAST = 3000;

console.log('【gradeRecord】速さで箱の上がり方が変わる');
{
  const r = emptyRecord();
  t('はやい正解で箱が1つ上がる', gradeRecord(r, true, 1500, FAST, NOW) === 'ok' && r.box === 1);
  t('おそい正解は slow で箱すえおき', gradeRecord(r, true, 4000, FAST, NOW) === 'slow' && r.box === 1);
  t('おそくても最速記録は更新しない', r.fastest === 1500);
  t('誤答で箱が0に戻る', gradeRecord(r, false, 900, FAST, NOW) === 'ng' && r.box === 0);
  t('正答数が数えられている', r.correct === 2 && r.seen === 3);
}
{
  const r = emptyRecord();
  for (let i = 0; i < 9; i++) gradeRecord(r, true, 100, FAST, NOW);
  t('箱は5で頭打ち', r.box === 5);
  t('直近の記録は5件まで', r.recent.length === 5);
}
{
  const r = emptyRecord();
  t('自己申告（ms=null）でも箱は上がる', gradeRecord(r, true, null, FAST, NOW) === 'ok' && r.box === 1);
}

console.log('【orderPool】覚えていないものから出る');
{
  const pool = [1,2,3,4,5].map(id => ({ id }));
  const P = {
    2: { ...emptyRecord(), seen:3, box:0, lastSeen:NOW },                 // 箱0＝苦手
    3: { ...emptyRecord(), seen:3, box:2, lastSeen:NOW - 2*DAY },         // 期限切れ
    4: { ...emptyRecord(), seen:3, box:2, lastSeen:NOW },                 // まだ期限内
    5: { ...emptyRecord(), seen:3, box:5, lastSeen:NOW },                 // 習得済み・期限内
  };                                                                      // 1 は未出題
  const o = orderPool(pool, P, NOW).map(p => p.id);
  t('未出題が先頭', o[0] === 1, `→ ${o}`);
  t('つぎに箱0', o[1] === 2, `→ ${o}`);
  t('つぎに復習期限ぎれ', o[2] === 3, `→ ${o}`);
  t('期限内のものは後ろ', o.slice(3).sort().join() === '4,5', `→ ${o}`);
}
{
  const pool = [1,2,3].map(id => ({ id }));
  const P = { 1:{...emptyRecord(), seen:1, box:3, lastSeen:NOW}, 2:{...emptyRecord(), seen:1, box:1, lastSeen:NOW},
              3:{...emptyRecord(), seen:1, box:2, lastSeen:NOW} };
  P[1].box = 0; P[2].box = 0; P[3].box = 0;
  t('全部が箱0でも全件返る', orderPool(pool, P, NOW).length === 3);
}

console.log('【isWeak】にがて札のえらび方');
{
  const P = {
    1: undefined,
    2: { ...emptyRecord(), seen:5, box:1, recent:[1,1,1,1,1] },
    3: { ...emptyRecord(), seen:5, box:4, recent:[1,1,1,1,1] },
    4: { ...emptyRecord(), seen:5, box:4, recent:[0,0,1,0,0] },
    5: { ...emptyRecord(), seen:2, box:4, recent:[0,0] },
  };
  t('未出題はにがて', isWeak({id:1}, P));
  t('箱1はにがて', isWeak({id:2}, P));
  t('箱4で正答つづきはにがてでない', !isWeak({id:3}, P));
  t('箱4でも直近の正答率が低ければにがて', isWeak({id:4}, P));
  t('直近が3回未満なら正答率では判定しない', !isWeak({id:5}, P));
}

console.log('【pickDistractors】決まり字が近い札を混ぜる');
{
  const POEMS = JSON.parse(fs.readFileSync(new URL('../data/poems.json', import.meta.url)));
  const asa = POEMS.find(p => p.id === 31);              // あさぼらけあ（6字）
  const d = pickDistractors(asa, POEMS, 7);
  t('枚数がそろう', d.length === 7);
  t('正解の札は混ざらない', !d.some(p => p.id === 31));
  t('もう一方の「あさぼらけ」(64) が必ず入る', d.some(p => p.id === 64), `→ ${d.map(p=>p.id)}`);
  const kimi = POEMS.find(p => p.id === 15);             // きみがためは
  t('「きみがため」の相方(50) が必ず入る',
    pickDistractors(kimi, POEMS, 7).some(p => p.id === 50));
  const mu = POEMS.find(p => p.id === 87);               // 一字決まり「む」
  const dm = pickDistractors(mu, POEMS, 7);
  t('一字決まりでも枚数はそろう', dm.length === 7 && !dm.some(p => p.id === 87));
  const small = POEMS.slice(0, 4);                       // 1〜4番
  t('候補が少ないときは足りるだけ返す',
    pickDistractors(small[0], small, 7).length === 3);   // 自分をのぞく3枚
  t('近い札が複数あるときは全部載る',                       // 19番と88番はどちらも「なにわ」
    pickDistractors(POEMS.find(p=>p.id===19), POEMS, 7).some(p => p.id === 88));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} 件パス / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);

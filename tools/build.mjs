import fs from 'node:fs';

const GOSHOKU = {
  pink:   [86,34,22,97,40,58,73,83,72,28,66,65,16,51,4,48,1,84,13,80],
  blue:   [3,5,6,12,14,24,30,31,50,57,61,62,69,70,74,75,76,82,91,100],
  yellow: [2,7,10,18,32,33,37,39,46,47,55,60,78,79,81,85,87,89,94,96],
  green:  [8,9,11,15,17,20,23,26,29,35,36,38,41,42,54,59,68,71,92,93],
  orange: [19,21,25,27,43,44,45,49,52,53,56,63,64,67,77,88,90,95,98,99],
};
const colorOf = {};
for (const [c, ids] of Object.entries(GOSHOKU)) ids.forEach(i => colorOf[i] = c);

const rows = fs.readFileSync('tools/poems.src.tsv', 'utf8').trim().split('\n').map(l => l.split('\t'));
const poems = rows.map(([id, author, kami, shimo, kk, sk]) => ({
  id: +id, author, kaminoku: kami, shimonoku: shimo,
  kaminoku_kana: kk, shimonoku_kana: sk, color: colorOf[+id],
}));

// 決まり字は「音」で決まる。歴史的仮名遣いの表記を読みに正規化してから比較する。
// 例: 26番「をぐらやま」は「お」と読むので、5番「おくやまに」等と同じ「お」列で競合する。
// 表記（kaminoku_kana＝札の字面）は原文のまま保存し、比較用の読みだけ別に持つ。
// 26番「をぐらやま」→お、49番「ゑじ」→え、等。
// さらに長音「オー」の同一視が要る：44番「あふことの」は "おうことの"、
// 60番「おほえやま」は "おおえやま" と読むため、この3首は2字目まで同音になり
// 「あふこ／おほえ／おほけ」の3字決まりになる。文化ネットの五十音分布（お＝7首）が裏付け。
const yomi = (s) => s.replace(/を/g,'お').replace(/ゐ/g,'い').replace(/ゑ/g,'え')
                     .replace(/ぢ/g,'じ').replace(/づ/g,'ず')
                     .replace(/^あふ/,'おお').replace(/おほ/g,'おお');
for (const p of poems) p.kaminoku_yomi = yomi(p.kaminoku_kana);

// 決まり字＝他の99首のどれとも一致しなくなる最短の先頭文字列
for (const p of poems) {
  const others = poems.filter(q => q.id !== p.id).map(q => q.kaminoku_yomi);
  let n = 1;
  while (n <= p.kaminoku_yomi.length &&
         others.some(o => o.startsWith(p.kaminoku_yomi.slice(0, n)))) n++;
  p.kimariji = p.kaminoku_kana.slice(0, n);   // 表示は札の字面（をぐ）
  p.kimariji_yomi = p.kaminoku_yomi.slice(0, n); // 判定は読み（おぐ）
  p.kimariji_len = n;
}

// 取り札の改行。三澤家の五色百人一首の実物（IMG_1092〜1096）を見ると、
// 句の切れ目ではなく「3行・1行目と2行目が5文字ずつ・3行目が残り」で割られている。
//   14字 → 5/5/4  「みだれそめ／にしわれな／らなくに」
//   15字 → 5/5/5  「むべやまか／ぜをあらし／といふらむ」
//   16字 → 5/5/6  「ありあけの／つきをまち／いでつるかな」
// 札の見た目そのものが記憶の手がかりになるので、実物に合わせる。
for (const p of poems) {
  const k = p.shimonoku_kana;
  p.shimonoku_lines = [k.slice(0, 5), k.slice(5, 10), k.slice(10)].filter(Boolean);
}

// ---- 検証 ----
let pass = true;
const fail = (m) => { pass = false; console.log('  ❌ ' + m); };
const okmsg = (m) => console.log('  ✅ ' + m);

console.log('【検証1】1字決まり＝7首、頭文字が む・す・め・ふ・さ・ほ・せ');
const one = poems.filter(p => p.kimariji_len === 1);
const heads = one.map(p => p.kimariji_yomi).sort().join('');
const want = ['む','す','め','ふ','さ','ほ','せ'].sort().join('');
one.length === 7 ? okmsg(`7首（${one.map(p=>p.kimariji+p.id).join(' ')}）`) : fail(`${one.length}首`);
heads === want ? okmsg('むすめふさほせ と一致') : fail(`頭文字が不一致: ${heads}`);

console.log('【検証2】「あさぼらけ」2首が6字決まり');
[31,64].forEach(id => { const p = poems.find(x=>x.id===id);
  p.kimariji_len === 6 ? okmsg(`${id}番 ${p.kimariji}（6字）`) : fail(`${id}番 ${p.kimariji}（${p.kimariji_len}字）`); });

console.log('【検証3】決まり字の重複なし');
const km = poems.map(p=>p.kimariji); const dup = km.filter((x,i)=>km.indexOf(x)!==i);
dup.length ? fail('重複: '+dup.join(',')) : okmsg('重複なし');

console.log('【検証4】決まり字が上の句の先頭部分になっている');
poems.every(p=>p.kaminoku_kana.startsWith(p.kimariji)) ? okmsg('全100首OK') : fail('不整合あり');

console.log('【検証6】決まり字が読みベースで一意');
const ky = poems.map(p=>p.kimariji_yomi); const dky = ky.filter((x,i)=>ky.indexOf(x)!==i);
dky.length ? fail('読みで重複: '+dky.join(',')) : okmsg('読みでも重複なし');

console.log('【検証9】取り札の改行が実物どおり（3行・上2行が5文字・つなげると元に戻る）');
const badSplit = poems.filter(p => {
  const L = p.shimonoku_lines;
  return L.length !== 3 || L[0].length !== 5 || L[1].length !== 5
      || L.join('') !== p.shimonoku_kana || L[2].length < 4 || L[2].length > 6;
});
badSplit.length ? fail('不正: ' + badSplit.map(p=>p.id).join(','))
  : okmsg(`全100首OK（3行目の字数: ${[...new Set(poems.map(p=>p.shimonoku_lines[2].length))].sort().join('・')}）`);

console.log('【検証5】五色＝各20首・1〜100が過不足なく1回');
const ids = Object.values(GOSHOKU).flat();
const bad = Object.entries(GOSHOKU).filter(([,v])=>v.length!==20);
const miss = [...Array(100)].map((_,i)=>i+1).filter(i=>!ids.includes(i));
const dupi = ids.filter((x,i)=>ids.indexOf(x)!==i);
(!bad.length && !miss.length && !dupi.length) ? okmsg('5色×20＝100、重複・欠番なし')
  : fail(`枚数${JSON.stringify(bad)} 欠番${miss} 重複${dupi}`);

console.log('【検証7】字数分布が定説（1字7/2字42/3字37/4字6/5字2/6字6）と一致');
const want7 = {1:7,2:42,3:37,4:6,5:2,6:6};
const got7 = {}; poems.forEach(p=>got7[p.kimariji_len]=(got7[p.kimariji_len]||0)+1);
JSON.stringify(got7)===JSON.stringify(want7) ? okmsg('一致')
  : fail('不一致: '+JSON.stringify(got7));

console.log('【検証8】決まり字の頭音の五十音分布が文化ネットの27区分と一致');
const wantIni = {あ:16,い:3,う:2,お:7,か:4,き:3,こ:6,さ:1,し:2,す:1,せ:1,た:6,ち:3,つ:2,
                 な:8,は:4,ひ:3,ふ:1,ほ:1,み:5,む:1,め:1,も:2,や:4,ゆ:2,よ:4,わ:7};
const gotIni = {}; poems.forEach(p=>{const c=p.kimariji_yomi[0]; gotIni[c]=(gotIni[c]||0)+1;});
const diffIni = [...new Set([...Object.keys(wantIni),...Object.keys(gotIni)])]
  .filter(k=>(wantIni[k]||0)!==(gotIni[k]||0))
  .map(k=>`\${k}: 定説\${wantIni[k]||0} / 算出\${gotIni[k]||0}`);
diffIni.length ? fail(diffIni.join('  ')) : okmsg('27区分すべて一致');

console.log('\n決まり字の字数分布:');
const dist = {}; poems.forEach(p => dist[p.kimariji_len] = (dist[p.kimariji_len]||0)+1);
console.log('  ' + Object.entries(dist).map(([k,v])=>`${k}字:${v}首`).join('  '));
console.log(`\n判定: ${pass ? '✅ 全検証パス' : '❌ 要修正'}`);

if (pass) {
  fs.mkdirSync('data', {recursive: true});
  fs.writeFileSync('data/poems.json', JSON.stringify(poems, null, 1));
  fs.writeFileSync('data/goshoku.json', JSON.stringify({
    source: '三澤家所有の五色百人一首カード実物（2026-08-31 撮影 IMG_1092〜1096）',
    note: '取り札（下の句）を撮影し、下の句から歌番号に引き当てた。色名は五色百人一首協会の公式表記に従う。',
    colors: {
      // label＝学校での呼び方（なつさんが耳で聞く言葉）。アプリの表示はこちらを使う。
      // label_official＝五色百人一首協会の公式表記。データの照合に使う。
      pink:   {label:'赤',       label_official:'桃', hex:'#D95C82', ids: GOSHOKU.pink.slice().sort((a,b)=>a-b)},
      blue:   {label:'青',       label_official:'青', hex:'#5B8FD4', ids: GOSHOKU.blue.slice().sort((a,b)=>a-b)},
      yellow: {label:'黄色',     label_official:'黄', hex:'#E3C13F', ids: GOSHOKU.yellow.slice().sort((a,b)=>a-b)},
      green:  {label:'緑',       label_official:'緑', hex:'#7FB069', ids: GOSHOKU.green.slice().sort((a,b)=>a-b)},
      orange: {label:'オレンジ', label_official:'橙', hex:'#E08B45', ids: GOSHOKU.orange.slice().sort((a,b)=>a-b)},
    }}, null, 1));
  console.log('→ data/poems.json, data/goshoku.json を書き出しました');
}

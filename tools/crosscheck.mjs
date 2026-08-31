// 文化ネット（bunkanet.jp）五色分類ページとの全件照合
// 取得: tools/fetch-ref.sh（curl。要ブラウザUA）
import fs from 'node:fs';
const poems = JSON.parse(fs.readFileSync('data/poems.json','utf8'));
const g = JSON.parse(fs.readFileSync('data/goshoku.json','utf8')).colors;

// --- 参照データの読み込み（素朴なHTML抽出）---
const SLUG = {blue:'a-blue', pink:'b-pink', yellow:'c-yellow', green:'d-green', orange:'e-orange'};
const strip = h => h.replace(/<[^>]*>/g,'').replace(/&[a-z]+;/g,'').replace(/\s+/g,'').trim();
const ref = {};
for (const [color, slug] of Object.entries(SLUG)) {
  const html = fs.readFileSync(`tools/ref/bunkanet_${slug}.html`,'utf8');
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x => strip(x[1]));
    if (tds.length < 8 || !/^\d{3}$/.test(tds[0])) continue;
    ref[+tds[0]] = {color, torifuda: tds[4], kimariji: tds[6], len: +tds[7]};
  }
}
const n = Object.keys(ref).length;
console.log(`参照データ: ${n}首 読み込み${n===100?'':'  ★100首でない'}\n`);

// --- 比較用の正規化 ---
// 濁点・半濁点を落とす（かるたの取り札は清音表記）
const sei = s => s.normalize('NFD').replace(/[゙゚]/g,'').normalize('NFC');
// 音の同一視。ハ行転呼（は/わ、ひ/い、ふ/う、へ/え、ほ/お）と旧仮名を1つに畳む
const EQ = {は:'わ',ひ:'い',ふ:'う',へ:'え',ほ:'お',を:'お',ゐ:'い',ゑ:'え',ぢ:'じ',づ:'ず',む:'ん'};
const onEq = s => [...sei(s)].map(c => EQ[c] || c).join('');

let ngLen=0, ngKim=0, ngTori=0, ngCol=0;
const report = [];
for (const p of poems) {
  const r = ref[p.id];
  if (!r) { report.push(`${p.id}: 参照側に無し`); continue; }
  if (r.len !== p.kimariji_len) { ngLen++; report.push(`${p.id} 文字数: 当方${p.kimariji_len} / 文化ネット${r.len}`); }
  if (onEq(r.kimariji) !== onEq(p.kimariji_yomi)) { ngKim++;
    report.push(`${p.id} 決まり字: 当方「${p.kimariji}」(読み${p.kimariji_yomi}) / 文化ネット「${r.kimariji}」`); }
  if (onEq(r.torifuda) !== onEq(p.shimonoku_kana)) { ngTori++;
    report.push(`${p.id} 取札: 当方「${p.shimonoku_kana}」 / 文化ネット「${r.torifuda}」`); }
  if (r.color !== p.color) { ngCol++;
    report.push(`${p.id} 色: 当方${g[p.color].label_official} / 文化ネット${g[r.color].label_official}`); }
}
const line = (name, ng) => console.log(`${name.padEnd(22,'　')} ${ng===0 ? '✅ 100/100 一致' : `❌ ${100-ng}/100（相違${ng}件）`}`);
line('決まり字（音で比較）', ngKim);
line('決まり字の文字数', ngLen);
line('取札＝下の句（清音で比較）', ngTori);
line('五色の色分け', ngCol);
if (report.length) { console.log('\n--- 相違の内訳 ---'); report.forEach(r=>console.log('  '+r)); }
else console.log('\n✅ 全4項目・全100首が完全一致');

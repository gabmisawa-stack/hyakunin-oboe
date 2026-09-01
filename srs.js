// 出題ロジック（ライトナーの箱）。副作用のない純粋関数だけを置く。
// アプリから切り離してあるので tools/test-srs.mjs で単体で試せる。

// 箱ごとの復習間隔（ミリ秒）。0＝同じセッション内でまた出す
export const INTERVAL = [0, 0, 864e5, 3 * 864e5, 7 * 864e5, 14 * 864e5];
// lv＝暗記モードの到達レベル（0=まだ見せていない … 8=4択まで通った）
export const emptyRecord = () => ({ box:0, seen:0, correct:0, lastSeen:0, fastest:null, recent:[], lv:0 });

/** 1問の結果を記録に反映する。r は破壊的に更新し、判定を返す。
 *  正解でも fastMs 以上かかったら箱を上げない（§7.2 かるたは速さが勝負）。 */
export function gradeRecord(r, ok, ms, fastMs, now) {
  r.seen++; r.lastSeen = now;
  r.recent.push(ok ? 1 : 0); if (r.recent.length > 5) r.recent.shift();
  if (!ok) { r.box = 0; return 'ng'; }
  r.correct++;
  if (ms != null && (r.fastest == null || ms < r.fastest)) r.fastest = ms;
  if (ms != null && ms >= fastMs) return 'slow';      // 箱は据え置き
  r.box = Math.min(5, r.box + 1);
  return 'ok';
}

/** 出題順を決める。未出題 → 箱0 → 復習期限が来たもの → それ以外。 */
export function orderPool(pool, P, now, rnd = Math.random) {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const tier = p => {
    const r = P[p.id];
    if (!r || !r.seen) return 0;
    if (r.box === 0) return 1;
    if (now - r.lastSeen >= INTERVAL[r.box]) return 2;
    return 3;
  };
  const b = [[], [], [], []];
  pool.forEach(p => b[tier(p)].push(p));
  b.forEach(x => shuffle(x));
  b[1].sort((x, y) => (P[x.id]?.box ?? 0) - (P[y.id]?.box ?? 0));
  return [...b[0], ...b[1], ...b[2], ...b[3]];
}

/** にがて札：未出題・箱0か1・直近の正答率が6割未満 */
export function isWeak(p, P) {
  const r = P[p.id];
  if (!r || !r.seen) return true;
  if (r.box <= 1) return true;
  return r.recent.length >= 3 && r.recent.filter(x => x).length / r.recent.length < 0.6;
}

/** 誤答の札は、決まり字が近いものを優先して混ぜる（本番で迷う組をぶつける）。
 *  ★ 上の句の「読み」の頭がいちばん長く一致する札は、必ず盤に載せる。
 *    候補を集めてから一様にシャッフルすると、肝心の相方（31↔64、15↔50 など）が
 *    3回に1回しか出ず、この機能の意味がなくなる。 */
export function pickDistractors(target, pool, k, rnd = Math.random) {
  const pre = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scored = pool.filter(p => p.id !== target.id)
    .map(p => ({ p, s: pre(p.kaminoku_yomi, target.kaminoku_yomi) }))
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const top = scored[0].s;
  const must = top > 0 ? scored.filter(o => o.s === top).slice(0, k).map(o => o.p) : [];
  const rest = scored.filter(o => !must.includes(o.p))
    .slice(0, Math.max(k * 3, 12)).map(o => o.p);
  return shuffle([...must, ...shuffle(rest).slice(0, Math.max(0, k - must.length))]);
}

// ふだっち — 百人一首おぼえアプリ
// 仕様書 §5〜§8 の実装。ビルド不要・依存ライブラリなし。

import { emptyRecord, gradeRecord, orderPool, isWeak, pickDistractors } from './srs.js';

const BUILD = '1.4.0 / 2026-09-01';   // 設定画面に出す。iPadが古い版を掴んでいないかの確認用

const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c;
                          if (x != null) n.textContent = x; return n; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) {
                         const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ==================== データ ==================== */
let POEMS = [], GOSHOKU = null, BY_ID = {};
const MODES = [
  { id:'oboe',  nm:'はじめて おぼえる',
    ds:'まだ知らない5首を、上の句と下の句をならべて見せてから、その5首だけで試す。最初はここから' },
  { id:'tori',  nm:'札取り',        ds:'読み上げを聞いて、取り札をタップ。競技かるた本番に一番近い形' },
  { id:'kimari',nm:'決まり字クイズ',ds:'一文字ずつ出てくる。何文字目で分かるかを記録する' },
  { id:'match', nm:'上の句→下の句', ds:'上の句を見て下の句を選ぶ。音を出さずにできる' },
  { id:'ansho', nm:'暗唱チェック',  ds:'下の句を思い出してから答え合わせ。自己申告' },
];

/* ==================== 保存 ==================== */
// 「はやい」の基準。本物の朗詠は節回しがあり、3秒では決まり字まで読まれない（晴の指摘）。
const FAST_CHOICES = [4000, 5000, 7000];
const DEF_SETTINGS = { cardCount:8, sessionLen:20, showKana:true, colorHint:true,
                       stopOnCorrect:true, fastMs:5000, previewFlip:true, profile:'なつ' };
let S = { ...DEF_SETTINGS, ...JSON.parse(localStorage.getItem('fudacchi.settings') || '{}') };
if (!FAST_CHOICES.includes(S.fastMs)) S.fastMs = 5000;   // 旧設定(3秒)からの引っ越し
const saveSettings = () => localStorage.setItem('fudacchi.settings', JSON.stringify(S));

/* ---- つかう人（プロフィール）---- */
// 記録は fudacchi.progress.<名前> に分かれて入る。切り替えても互いに影響しない。
const PROFILES_KEY = 'fudacchi.profiles';
const profiles = () => {
  const l = JSON.parse(localStorage.getItem(PROFILES_KEY) || 'null');
  if (l && l.length) return l;
  const init = [S.profile || 'なつ'];
  localStorage.setItem(PROFILES_KEY, JSON.stringify(init));
  return init;
};
const saveProfiles = l => localStorage.setItem(PROFILES_KEY, JSON.stringify(l));

const progKey = () => `fudacchi.progress.${S.profile}`;
let P = JSON.parse(localStorage.getItem(progKey()) || '{}');
const saveProgress = () => localStorage.setItem(progKey(), JSON.stringify(P));
const rec = id => P[id] || (P[id] = emptyRecord());

/* ==================== 出題 ==================== */
const grade = (id, ok, ms) => {
  const v = gradeRecord(rec(id), ok, ms, S.fastMs, Date.now());
  saveProgress(); return v;
};
const selectPoems = (pool, n) => orderPool(pool, P, Date.now()).slice(0, n);
const distractors = (target, pool, k) => pickDistractors(target, pool, k);

/* ==================== 音声 ==================== */
const Audio_ = (() => {
  let db = null, unlocked = false, cur = null, has = new Set();
  const openDB = () => new Promise(res => {
    const rq = indexedDB.open('fudacchi', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('audio');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(null);
  });
  const tx = (mode, fn) => new Promise(res => {
    if (!db) return res(null);
    const t = db.transaction('audio', mode); const r = fn(t.objectStore('audio'));
    if (r) { r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    else t.oncomplete = () => res(true);
  });
  return {
    async init() {
      db = await openDB();
      const keys = await tx('readonly', s => s.getAllKeys());
      (keys || []).forEach(k => has.add(k));
    },
    importedCount: () => has.size,
    async put(id, blob) { await tx('readwrite', s => s.put(blob, id)); has.add(id); },
    async clear() { await tx('readwrite', s => s.clear()); has.clear(); },
    unlock() {
      if (unlocked) return; unlocked = true;
      try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; speechSynthesis.speak(u); } catch {}
      const a = new Audio(); a.muted = true; a.play().catch(() => {});
    },
    source(id) { return has.has(id) ? 'file' : 'librivox'; },
    playing() { return !!(cur && !cur.paused && !cur.ended); },
    /** いま鳴っている音が終わるまで待つ。鳴っていなければすぐ返る。 */
    whenDone() {
      if (!this.playing()) return Promise.resolve();
      const a = cur;
      return new Promise(res => {
        const done = () => { a.removeEventListener('ended', done);
                             a.removeEventListener('pause', done); res(); };
        a.addEventListener('ended', done); a.addEventListener('pause', done);
      });
    },
    stop() { if (cur) { cur.pause(); cur = null; } try { speechSynthesis.cancel(); } catch {} },
    // 取り込んだ音源 → LibriVox(PD) → iPadの合成音声 の順に落ちる
    async play(poem, onEnd) {
      this.stop();
      const tryEl = async src => new Promise(res => {
        const a = new Audio(src); cur = a;
        a.onended = () => { onEnd?.(); res(true); };
        a.onerror = () => res(false);
        a.play().then(() => {}).catch(() => res(false));
        setTimeout(() => { if (a.currentTime > 0 || !a.paused) res(true); }, 400);
      });
      if (has.has(poem.id)) {
        const blob = await tx('readonly', s => s.get(poem.id));
        if (blob && await tryEl(URL.createObjectURL(blob))) return 'file';
      }
      if (await tryEl(`audio/lv/${String(poem.id).padStart(3, '0')}.m4a`)) return 'librivox';
      try {
        const u = new SpeechSynthesisUtterance(poem.kaminoku_kana + '、' + poem.shimonoku_kana);
        u.lang = 'ja-JP'; u.rate = 0.75; u.onend = () => onEnd?.();
        speechSynthesis.speak(u); return 'synth';
      } catch { onEnd?.(); return 'none'; }
    },
  };
})();

/* ==================== 小さな選択ダイアログ ==================== */
function pickDialog(title, items) {
  return new Promise(res => {
    const bg = el('div', 'modalbg');
    const box = el('div', 'modal');
    box.append(el('h3', '', title));
    for (const it of items) {
      const b = el('button', 'modalitem' + (it.mark ? ' on' : ''), it.label);
      b.onclick = () => { bg.remove(); res(it.value); };
      box.append(b);
    }
    const cancel = el('button', 'modalitem cancel', 'やめる');
    cancel.onclick = () => { bg.remove(); res(null); };
    box.append(cancel);
    bg.append(box);
    bg.onclick = e => { if (e.target === bg) { bg.remove(); res(null); } };
    document.body.append(bg);
  });
}

/* ==================== 画面遷移 ==================== */
const SCREENS = ['home', 'session', 'result', 'stats', 'settings'];
function go(name) {
  SCREENS.forEach(s => $('#' + s).classList.toggle('on', s === name));
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  if (name === 'home') renderHome();
}
document.addEventListener('click', e => {
  Audio_.unlock();
  const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
});

/* ==================== ホーム ==================== */
// 色は複数えらべる。五色百人一首は「青を覚えたら緑を足す」と増やしていく教え方なので、
// 20首 → 40首 → 60首 …と範囲を広げられるようにする。
let picked = new Set(), pickMode = 'tori';

function poolFor(sel = picked) {
  if (sel.has('all')) return POEMS.slice();
  if (sel.has('weak')) return POEMS.filter(p => isWeak(p, P));
  if (!sel.size) return [];
  return POEMS.filter(p => sel.has(p.color));
}
const mastered = pool => pool.filter(p => (P[p.id]?.box ?? 0) >= 4).length;

function togglePick(k) {
  if (k === 'all' || k === 'weak') {            // この2つは単独
    picked.has(k) ? picked.clear() : (picked = new Set([k]));
  } else {
    picked.delete('all'); picked.delete('weak');
    picked.has(k) ? picked.delete(k) : picked.add(k);
  }
  renderHome();
}

function renderHome() {
  const cw = $('#colorPicks'); cw.innerHTML = '';
  const items = [...Object.entries(GOSHOKU.colors).map(([k, v]) => ({ k, nm: v.label, hex: v.hex })),
                 { k:'all', nm:'ぜんぶ', hex:'var(--accent)' },
                 { k:'weak', nm:'にがてだけ', hex:'var(--ng)' }];
  for (const it of items) {
    const pool = poolFor(new Set([it.k])), m = mastered(pool);
    const b = el('button', 'cbtn'); b.style.setProperty('--dot', it.hex);
    b.setAttribute('aria-pressed', String(picked.has(it.k)));
    b.append(el('span', 'nm', it.nm), el('span', 'mt', `${m} / ${pool.length}`));
    const bar = el('div', 'bar'), i = el('i'); i.style.width = pool.length ? (m / pool.length * 100) + '%' : '0';
    bar.append(i); b.append(bar);
    b.onclick = () => togglePick(it.k);
    if (!pool.length) b.disabled = true;
    cw.append(b);
  }
  // いま何首えらんでいるか
  const total = poolFor().length;
  const note = $('#pickNote');
  note.textContent = total
    ? `${total}首　（${mastered(poolFor())}首 おぼえた）`
    : 'いろを タップしてね。ふたつ以上 えらべるよ';
  note.classList.toggle('none', !total);
  const mw = $('#modePicks'); mw.innerHTML = '';
  for (const m of MODES) {
    const b = el('button', 'mbtn'); b.setAttribute('aria-pressed', String(pickMode === m.id));
    b.append(el('span', 'nm', m.nm), el('span', 'ds', m.ds));
    b.onclick = () => { pickMode = m.id; renderHome(); };
    mw.append(b);
  }
  $('#startBtn').disabled = !poolFor().length;
  const ub = $('#userBtn');
  ub.textContent = S.profile + ' ▾';
  ub.onclick = openProfilePicker;
}
function useProfile(name) {
  S.profile = name; saveSettings();
  P = JSON.parse(localStorage.getItem(progKey()) || '{}');
  renderHome();
}

async function openProfilePicker() {
  const list = profiles();
  const v = await pickDialog('だれが つかう？', [
    ...list.map(n => ({ label: n + (n === S.profile ? '　（いま）' : ''), value: n, mark: n === S.profile })),
    { label: '＋ あたらしい ひとを ふやす', value: '__new__' },
  ]);
  if (!v) return;
  if (v === '__new__') {
    const name = (prompt('なまえを いれてね') || '').trim();
    if (!name) return;
    if (list.includes(name)) { alert('もう いるよ'); return useProfile(name); }
    if (name.length > 12) { alert('なまえが ながすぎます（12文字まで）'); return; }
    saveProfiles([...list, name]);
    useProfile(name);
    alert(`${name} を ふやしました。きろくは まっさらから はじまります。`);
  } else useProfile(v);
}

$('#startBtn').onclick = () => startSession();
$('#againBtn').onclick = () => startSession();

/* ==================== セッション ==================== */
let Q = [], qi = 0, log = [], batch = [];

const OBOE_BATCH = 5;   // 一度に紹介する首数。多いと覚える前に忘れる

function startSession() {
  const pool = poolFor();
  if (pickMode === 'oboe') {
    // まだ身についていないものから5首。「見せる→2択→4択」の順に並べる
    batch = selectPoems(pool, Math.min(OBOE_BATCH, pool.length));
    Q = [
      ...batch.map(p => ({ poem: p, kind: 'show' })),
      ...shuffle(batch.map(p => ({ poem: p, kind: 'test2' }))),
      ...shuffle(batch.map(p => ({ poem: p, kind: 'test4' }))),
    ];
  } else {
    batch = [];
    Q = selectPoems(pool, Math.min(S.sessionLen, pool.length)).map(p => ({ poem: p, kind: null }));
  }
  qi = 0; log = [];
  go('session'); nextQuestion();
}
$('#quitBtn').onclick = () => { Audio_.stop(); go('home'); };

function nextQuestion() {
  Audio_.stop();
  if (qi >= Q.length) return finish();
  $('#progFill').style.width = (qi / Q.length * 100) + '%';
  $('#counter').textContent = `${qi + 1} / ${Q.length}`;
  $('#feedback').className = 'feedback'; $('#feedback').textContent = '';
  const { poem, kind } = Q[qi], pool = poolFor();
  if (pickMode === 'oboe') return (kind === 'show' ? qShow : qOboeTest)(poem, kind);
  ({ tori: qTori, kimari: qKimari, match: qMatch, ansho: qAnsho })[pickMode](poem, pool);
}

function say(msg, kind) { const f = $('#feedback'); f.textContent = msg; f.className = 'feedback ' + (kind || ''); }

const tapOnce = () => new Promise(res =>
  addEventListener('pointerdown', res, { once: true }));

async function advance(poem, ok, ms, kind) {
  if (kind === 'show') { qi++; return nextQuestion(); }   // 見せただけ。記録しない
  const g = grade(poem.id, ok, ms);
  log.push({ id: poem.id, ok, ms });
  const msg = ok ? (g === 'slow' ? `おしい！ ${(ms/1000).toFixed(1)}秒。もうすこし はやく`
                                 : `せいかい！ ${ms != null ? (ms/1000).toFixed(1) + '秒' : ''}`)
                 : `${poem.kimariji} — ${poem.shimonoku}`;
  // 「せいかいで音をとめる」を切っているときは、読み上げを最後まで聞かせる。
  // 本物の音源は1首24秒あるので、ここで待たないと下の句が一度も耳に入らない。
  if (ok && !S.stopOnCorrect && Audio_.playing()) {
    say(msg + '　……さいごまで きいてね（タップで つぎへ）', 'ok');
    await Promise.race([Audio_.whenDone(), tapOnce()]);
  } else {
    say(msg, ok ? 'ok' : 'ng');
    await sleep(ok ? 900 : 2000);
  }
  qi++; nextQuestion();
}

/* ---- 札を描く ---- */
function fudaGrid(poem, pool, n, onPick, opt = {}) {
  const board = $('#board'); board.className = 'board'; board.innerHTML = '';
  const cards = shuffle([poem, ...distractors(poem, pool, n - 1)]);
  const nodes = new Map();
  for (const c of cards) {
    const f = el('button', 'fuda');
    f.append(fudaText(c.shimonoku_lines));
    if (opt.colorHint && GOSHOKU.colors[c.color]) {
      f.style.borderColor = GOSHOKU.colors[c.color].hex;
      f.dataset.tinted = '1';       // 縁の太さは fitFuda が札の実寸から決める
    }
    f._poem = c;
    f.onclick = () => onPick(c, f, nodes);
    nodes.set(c.id, f); board.append(f);
  }
  fitFuda();
  return nodes;
}

/** 札をめくる（表＝下の句 ⇄ 裏＝上の句と作者） */
function flipFuda(f) {
  const c = f._poem; if (!c) return;
  const toBack = !f.classList.contains('flipped');
  f.classList.toggle('flipped', toBack);
  f.innerHTML = '';
  f.append(toBack ? fudaBack(c) : fudaText(c.shimonoku_lines));
  fitFuda();
}
const unflipAll = () => document.querySelectorAll('#board .fuda.flipped')
  .forEach(f => flipFuda(f));

/** 取り札の下の句を、実物と同じ「2行」に割る。
 *  自然な折り返しに任せると3列目が2文字だけ、といった半端な列ができる。
 *  行の分け方は data/poems.json の shimonoku_lines（tools/build.mjs が算出）。
 *  実物は3行・上2行が5文字・3行目が残り。句の切れ目では割らない。 */
function fudaText(lines) {
  const t = el('span', 't');
  lines.forEach((s, i) => {
    if (i) t.append(document.createElement('br'));
    t.append(document.createTextNode(s));
  });
  t.dataset.per = String(Math.max(...lines.map(s => s.length)));
  t.dataset.lines = String(lines.length);
  return t;
}

/** 盤の並びと札の実寸を決める。
 *  ★ CSSの aspect-ratio に任せてはいけない。height:100% や max-width:100% と
 *    組み合わさると比率が捨てられ、4枚のときに縦長の短冊になる（実際になった）。
 *  列数は「札がいちばん大きくなる並び」を、枚数を割り切れる候補から選ぶ。 */
const FUDA_RATIO = 53 / 73;
function layoutBoard() {
  const board = $('#board');
  const cards = [...board.querySelectorAll('.fuda')];
  if (!cards.length) return;
  const cs = getComputedStyle(board), GAP = parseFloat(cs.gap) || 8;
  const availW = board.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = board.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (availW < 40 || availH < 40) return;
  const n = cards.length;
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols) continue;                       // 端の行が欠けない並びだけ
    const rows = n / cols;
    const cw = (availW - GAP * (cols - 1)) / cols;
    const ch = (availH - GAP * (rows - 1)) / rows;
    const w = Math.min(cw, ch * FUDA_RATIO);      // はみ出さない側で決める
    if (w > 0 && (!best || w > best.w)) best = { w, h: w / FUDA_RATIO, cols };
  }
  if (!best) return;
  board.style.gridTemplateColumns = `repeat(${best.cols}, max-content)`;
  const w = Math.floor(best.w) + 'px', h = Math.floor(best.h) + 'px';
  cards.forEach(f => { f.style.width = w; f.style.height = h; });
}

/** 札の裏。上の句（決まり字は金）と作者名。
 *  五色百人一首は取り札の裏に上の句と作者名が刷ってあり、試合の合間にこれを見て覚える。
 *  向山洋一が1990年の商品化のときに入れた仕組み。 */
function fudaBack(poem) {
  const t = el('span', 't back');
  let used = 0;
  const lines = poem.kaminoku_lines || (() => {          // 古いデータでも落ちないように
    const k = poem.kaminoku_kana, n = Math.ceil(k.length / 3);
    return [k.slice(0, n), k.slice(n, n * 2), k.slice(n * 2)].filter(Boolean);
  })();
  lines.forEach((s, i) => {
    if (i) t.append(document.createElement('br'));
    // 決まり字にあたる部分だけ金にする
    const k = poem.kimariji_len;
    if (used < k) {
      const cut = Math.min(s.length, k - used);
      t.append(el('span', 'km', s.slice(0, cut)));
      if (cut < s.length) t.append(document.createTextNode(s.slice(cut)));
    } else t.append(document.createTextNode(s));
    used += s.length;
  });
  t.append(document.createElement('br'));
  t.append(el('span', 'au', poem.author));
  // 作者名は .62em で描くので、長さもその割合で見積もる。
  // そのまま数えると「後京極摂政前太政大臣」に引きずられて全体が小さくなる。
  t.dataset.per = String(Math.max(...lines.map(s => s.length),
                                  Math.ceil(poem.author.length * 0.62)));
  t.dataset.lines = String(lines.length + 1);
  return t;
}

/** 札の文字を、札の実寸いっぱいまで大きくする。
 *  縦書きなので「1列に何文字入るか」で決まる。実物の取り札は下の句を2行に書く。
 *  ★ 縁の太さを先に確定させてから測る。縁を後から太くすると中身の幅が減り、
 *    列が1つ増えて横にはみ出す（実際に踏んだ）。
 *  ★ 計算だけに頼らず、はみ出さなくなるまで実測で詰める。折り返しの切り上げが
 *    1文字ずれるだけで列数が変わるため。 */
function fitFuda() {
  layoutBoard();
  const cards = [...document.querySelectorAll('#board .fuda')];
  if (!cards.length) return;
  // 画面がまだ立ち上がっていない（ホーム画面追加の直後や、タブが裏にあるとき）と
  // 札の実寸が0に近く出る。そこで測ると2pxのまま焼き付くので、やり直しにする。
  if (cards.some(f => f.clientHeight < 40 || f.clientWidth < 30)) return;
  const LH = 1.72, MAX = 76;
  // ① 縁を先に決める（実物の五色札に合わせて札の幅の5%ほど）
  for (const f of cards) {
    if (f.dataset.tinted) {
      const outer = f.getBoundingClientRect().width;
      f.style.borderWidth = Math.max(4, Math.round(outer * 0.05)) + 'px';
    }
  }
  // ② 縁を反映させたうえで文字の大きさを出す
  for (const f of cards) {
    const t = f.querySelector('.t'); if (!t) continue;
    const H = f.clientHeight, W = f.clientWidth;
    const perCol = +t.dataset.per || t.textContent.length;
    const cols = +t.dataset.lines || 2;
    let px = Math.min(H / (perCol * 1.06), W / (cols * LH), MAX);
    // ③ 実際にはみ出さなくなるまで詰める
    for (let i = 0; i < 14; i++) {
      t.style.setProperty('--fsz', Math.floor(px) + 'px');
      if (t.scrollWidth <= W && t.scrollHeight <= H) break;
      px *= 0.94;
      if (px < 9) break;
    }
  }
}
// 盤面の大きさが変わったら測り直す。
// 決まり字クイズは上の句が1文字ずつ伸びるので、その途中で盤面が縮む。
// 最初に測った寸法のままだと札からあふれて4行になる（実際に起きた）。
let fitTimer;
const refit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitFuda, 60); };
addEventListener('resize', refit);
addEventListener('orientationchange', refit);
new ResizeObserver(refit).observe($('#board'));
const markAnswer = (nodes, poem, picked) => {
  nodes.forEach((n, id) => { n.onclick = null; if (id !== poem.id) n.classList.add('dim'); });
  nodes.get(poem.id).classList.remove('dim');
  nodes.get(poem.id).classList.add('correct');
  if (picked && picked !== poem.id) nodes.get(picked)?.classList.add('wrong');
};

/* ---- はじめて おぼえる：① 見せる ---- */
// 何も知らない状態で当てさせても、当てずっぽうにしかならない。まず全部見せる。
function qShow(poem) {
  const st = $('#stage'); st.innerHTML = '';
  st.append(el('div', 'hint', `おぼえよう　（${qi + 1} / ${OBOE_BATCH}）`));

  const kami = el('div', 'kanji');
  kami.append(el('span', 'reveal', poem.kaminoku_kana.slice(0, poem.kimariji_len)),
              el('span', '', poem.kaminoku_kana.slice(poem.kimariji_len)));
  const kamiK = el('div', 'kana', poem.kaminoku);
  const arrow = el('div', 'hint', '↓');
  const shimo = el('div', 'kanji', poem.shimonoku_kana);
  const shimoK = el('div', 'kana', `${poem.shimonoku}　　${poem.author}`);
  st.append(kami, kamiK, arrow, shimo, shimoK);
  st.append(el('div', 'hint',
    `「${poem.kimariji}」まで きこえたら、この ふだ（${poem.kimariji_len}もじ決まり）`));

  const board = $('#board'); board.className = 'selfrow'; board.innerHTML = '';
  board.style.gridTemplateColumns = '';
  const again = el('button', 'ghost big', '♪ もういちど きく');
  again.onclick = () => Audio_.play(poem);
  const next = el('button', 'yes', 'つぎへ');
  next.onclick = () => advance(poem, true, null, 'show');
  board.append(again, next);
  Audio_.play(poem);
}

/* ---- はじめて おぼえる：② その5首だけで試す ---- */
function qOboeTest(poem, kind) {
  const n = kind === 'test2' ? 2 : 4;
  const st = $('#stage'); st.innerHTML = '';
  st.append(el('div', 'hint', n === 2 ? 'どっちかな？' : 'どれかな？'));
  const line = el('div', 'kanji');
  line.append(el('span', 'reveal', poem.kaminoku_kana.slice(0, poem.kimariji_len)),
              el('span', '', poem.kaminoku_kana.slice(poem.kimariji_len)));
  st.append(line, el('div', 'kana', poem.kaminoku));

  // 選択肢は、いま覚えている5首のなかから出す
  const others = shuffle(batch.filter(p => p.id !== poem.id)).slice(0, n - 1);
  const cards = shuffle([poem, ...others]);
  const board = $('#board'); board.className = 'choices'; board.innerHTML = '';
  board.style.gridTemplateColumns = '';
  let done = false; const t0 = performance.now(); const nodes = new Map();
  for (const c of cards) {
    const b = el('button', 'choice');
    b.append(el('div', 'cmain', c.shimonoku_kana));
    if (S.showKana) b.append(el('div', 'ckana', c.shimonoku));
    b.onclick = () => {
      if (done) return; done = true;
      nodes.forEach((x, id) => { x.onclick = null; if (id === poem.id) x.classList.add('correct'); });
      if (c.id !== poem.id) {
        b.classList.add('wrong');
        // まちがえたら、その場でもう一度うしろに回す
        Q.splice(qi + 1, 0, { poem, kind });
      }
      advance(poem, c.id === poem.id, performance.now() - t0);
    };
    nodes.set(c.id, b); board.append(b);
  }
}

/* ---- モード① 札取り ---- */
function qTori(poem, pool) {
  const st = $('#stage');
  let t0 = 0, done = false, started = false;
  let onPick = (c, f) => flipFuda(f);              // 読み始めるまでは、めくるだけ
  const nodes = fudaGrid(poem, pool, S.cardCount,
    (c, f) => onPick(c, f), { colorHint: S.colorHint });

  const startReading = () => {
    started = true; unflipAll();
    st.innerHTML = '';
    st.append(el('div', 'hint', '読み上げを きいて、ふだを さがそう'));
    const bar = el('div', 'timebar'), fill = el('i'); bar.append(fill); st.append(bar);
    t0 = performance.now();
    const tick = () => { if (done) return;
      const ms = performance.now() - t0, r = Math.min(1, ms / S.fastMs);
      fill.style.width = (r * 100) + '%'; bar.classList.toggle('late', ms >= S.fastMs);
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    onPick = (c) => {
      if (done) return; done = true;
      const ms = performance.now() - t0;
      if (S.stopOnCorrect || c.id !== poem.id) Audio_.stop();
      markAnswer(nodes, poem, c.id);
      advance(poem, c.id === poem.id, ms);
    };
    Audio_.play(poem);
  };

  if (!S.previewFlip) return startReading();
  // 五色百人一首は、試合の合間に札の裏（上の句）を見て覚える。その時間をここに置く。
  st.innerHTML = '';
  st.append(el('div', 'hint', 'ふだを タップすると、うらの 上の句が 見える'));
  const go = el('button', 'start', 'よみはじめる');
  go.style.margin = '.4rem 0 0'; go.onclick = startReading;
  st.append(go);
}

/* ---- モード② 決まり字クイズ ---- */
function qKimari(poem, pool) {
  const st = $('#stage'); st.innerHTML = '';
  const line = el('div', 'big', ''); line.style.minHeight = '1.4em';   // 伸びても盤面が動かないように
  const note = el('div', 'hint', 'なんもじで わかるかな？');
  st.append(line, note);
  let shown = 0, done = false, t0 = performance.now();
  const timer = setInterval(() => {
    if (done || shown >= poem.kaminoku_kana.length) return clearInterval(timer);
    shown++;
    line.innerHTML = '';
    const k = poem.kimariji_len;
    line.append(el('span', shown >= k ? 'reveal' : '', poem.kaminoku_kana.slice(0, Math.min(shown, k))));
    if (shown > k) line.append(el('span', '', poem.kaminoku_kana.slice(k, shown)));
    if (shown === k) note.textContent = `ここまでが 決まり字（${k}もじ）`;
  }, 450);
  const nodes = fudaGrid(poem, pool, S.cardCount, (c) => {
    if (done) return; done = true; clearInterval(timer);
    const ms = performance.now() - t0, ok = c.id === poem.id;
    markAnswer(nodes, poem, c.id);
    line.innerHTML = ''; line.append(el('span', 'reveal', poem.kimariji),
                                     el('span', '', poem.kaminoku_kana.slice(poem.kimariji_len)));
    note.textContent = ok ? `${shown}もじ目で とれた（決まり字は${poem.kimariji_len}もじ）` : '';
    advance(poem, ok, ms);
  }, { colorHint: S.colorHint });
}

/* ---- モード③ 上の句→下の句 ---- */
function qMatch(poem, pool) {
  const st = $('#stage'); st.innerHTML = '';
  st.append(el('div', 'kanji', poem.kaminoku));
  if (S.showKana) st.append(el('div', 'kana', poem.kaminoku_kana));
  st.append(el('div', 'hint', 'しもの句を えらぼう'));
  const board = $('#board'); board.className = 'choices'; board.innerHTML = ''; board.style.gridTemplateColumns = '';
  const cards = shuffle([poem, ...distractors(poem, pool, 3)]);
  let done = false; const t0 = performance.now(); const nodes = new Map();
  for (const c of cards) {
    const b = el('button', 'choice');
    b.append(el('div', 'cmain', c.shimonoku));
    if (S.showKana) b.append(el('div', 'ckana', c.shimonoku_kana));
    b.onclick = () => { if (done) return; done = true;
      nodes.forEach((n, id) => { n.onclick = null; if (id === poem.id) n.classList.add('correct'); });
      if (c.id !== poem.id) b.classList.add('wrong');
      advance(poem, c.id === poem.id, performance.now() - t0); };
    nodes.set(c.id, b); board.append(b);
  }
}

/* ---- モード④ 暗唱チェック ---- */
function qAnsho(poem) {
  const st = $('#stage'); st.innerHTML = '';
  st.append(el('div', 'kanji', poem.kaminoku));
  if (S.showKana) st.append(el('div', 'kana', poem.kaminoku_kana));
  const ans = el('div', 'kanji', '　　　　　'); ans.style.opacity = '.25';
  const ansKana = el('div', 'kana', ''); st.append(ans, ansKana);
  const board = $('#board'); board.className = 'selfrow'; board.innerHTML = ''; board.style.gridTemplateColumns = '';
  const show = el('button', 'ghost big', 'こたえを みる');
  show.onclick = () => {
    ans.style.opacity = '1'; ans.textContent = poem.shimonoku;
    if (S.showKana) ansKana.textContent = poem.shimonoku_kana;
    board.innerHTML = '';
    const yes = el('button', 'yes', 'いえた'), no = el('button', 'no', 'いえなかった');
    // 自己申告なので速さは記録しない（§6 モード④）
    yes.onclick = () => advance(poem, true, null);
    no.onclick  = () => advance(poem, false, null);
    board.append(yes, no);
  };
  board.append(show);
}

/* ==================== 結果 ==================== */
function finish() {
  Audio_.stop(); $('#progFill').style.width = '100%';
  const ok = log.filter(l => l.ok).length;
  const times = log.filter(l => l.ok && l.ms != null).map(l => l.ms);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const fast = times.filter(t => t < S.fastMs).length;
  $('#resultTitle').textContent = pickMode === 'oboe'
    ? `${batch.length}首 やったね！`
    : (ok === log.length ? 'ぜんぶ せいかい！' : 'おつかれさま！');
  const rs = $('#resultStats'); rs.innerHTML = '';
  const add = (v, s) => { const d = el('div'); d.append(el('b', '', v), el('span', '', s)); rs.append(d); };
  add(`${ok}/${log.length}`, 'せいかい');
  if (avg != null) add((avg / 1000).toFixed(1) + '秒', 'へいきん');
  if (times.length) add(`${fast}`, `${(S.fastMs/1000)}秒より はやく とれた`);
  const wl = $('#resultWeak'); wl.innerHTML = '';
  const miss = log.filter(l => !l.ok).map(l => BY_ID[l.id]);
  if (miss.length) {
    wl.append(Object.assign(el('div', 'hint', 'もういちど みておこう'), { style: 'text-align:center;color:var(--sub)' }));
    for (const p of miss) {
      const w = el('div', 'w');
      w.append(el('span', 'k', p.kimariji), el('span', '', `${p.kaminoku} / ${p.shimonoku}`));
      wl.append(w);
    }
  }
  go('result');
}

/* ==================== せいせき ==================== */
function renderStats() {
  const b = $('#statsBody'); b.innerHTML = '';
  for (const [k, v] of Object.entries(GOSHOKU.colors)) {
    const pool = poolFor(new Set([k]));
    const box = [0,0,0,0,0,0]; pool.forEach(p => box[P[p.id]?.box ?? 0]++);
    const row = el('div', 'statrow');
    row.append(el('h3', '', `${v.label}札　${mastered(pool)} / ${pool.length} おぼえた`));
    const m = el('div', 'meter');
    box.forEach((n, i) => { if (!n) return; const s = el('i');
      s.style.width = (n / pool.length * 100) + '%';
      s.style.background = i === 0 ? 'var(--line)' : `color-mix(in srgb,${v.hex} ${i*20}%,var(--line))`;
      m.append(s); });
    row.append(m);
    row.append(el('div', 'legend', `まだ ${box[0]}　れんしゅう中 ${box[1]+box[2]+box[3]}　おぼえた ${box[4]+box[5]}`));
    b.append(row);
  }
  const weak = poolFor(new Set(['weak']));
  const row = el('div', 'statrow'); row.append(el('h3', '', `にがてな ふだ　${weak.length}まい`));
  const list = el('div', 'weaklist');
  for (const p of weak.slice(0, 40)) {
    const w = el('div', 'w');
    w.append(el('span', 'k', p.kimariji), el('span', '', `${p.kaminoku} / ${p.shimonoku}`));
    list.append(w);
  }
  row.append(list); b.append(row);
}

/* ==================== せってい ==================== */
function renderSettings() {
  const b = $('#settingsBody'); b.innerHTML = '';
  const card = t => { const r = el('div', 'statrow'); r.append(el('h3', '', t)); b.append(r); return r; };
  const field = (parent, label, note, control) => {
    const f = el('div', 'field'); const l = el('label');
    l.append(document.createTextNode(label)); if (note) l.append(el('span', 'note', note));
    f.append(l, control); parent.append(f); return f;
  };
  const seg = (opts, cur, on) => { const s = el('div', 'seg');
    opts.forEach(([v, t]) => { const x = el('button', '', t);
      x.setAttribute('aria-pressed', String(v === cur));
      x.onclick = () => { on(v); saveSettings(); renderSettings(); }; s.append(x); });
    return s; };

  const g = card('れんしゅう');
  field(g, 'ふだの まいすう', '札取り・決まり字クイズで画面に並ぶ枚数',
        seg([[4,'4'],[8,'8'],[16,'16']], S.cardCount, v => S.cardCount = v));
  field(g, '1かいの もんだいすう', '五色の一色ぶんは20首',
        seg([[10,'10'],[20,'20'],[100,'ぜんぶ']], S.sessionLen, v => S.sessionLen = v));
  field(g, '「はやい」の きじゅん',
        'これより遅い正解は、おぼえた扱いにしない。本物の朗詠は節回しがあるので、'
        + '3秒では決まり字まで読まれない。ふつうは5秒',
        seg([[4000,'4秒'],[5000,'5秒'],[7000,'7秒']], S.fastMs, v => S.fastMs = v));

  const d = card('ひょうじ');
  field(d, 'ふりがな（かな）を だす', '上の句→下の句・暗唱チェックで、かなを添える',
        seg([[true,'だす'],[false,'ださない']], S.showKana, v => S.showKana = v));
  field(d, 'ふだに いろを つける', '五色の色を札のふちに出す。色で覚えたいときに',
        seg([[true,'つける'],[false,'つけない']], S.colorHint, v => S.colorHint = v));
  field(d, 'よむ まえに めくれる',
        '読み始める前に、札をタップして裏（上の句と作者）を見られる。'
        + '五色百人一首は取り札の裏に上の句が刷ってあり、試合の合間にそれを見て覚える。その時間',
        seg([[true,'めくれる'],[false,'めくれない']], S.previewFlip, v => S.previewFlip = v));
  field(d, 'せいかいで 音を とめる',
        'とめる＝取れたらすぐ次へ（テンポ重視）。とめない＝下の句まで最後まで流す（耳で覚える。本物の音源は1首24秒。タップで次へ進める）',
        seg([[true,'とめる'],[false,'とめない']], S.stopOnCorrect, v => S.stopOnCorrect = v));

  const a = card('よみあげ音声');
  const n = Audio_.importedCount();
  const imp = el('div');
  // ⚠️ accept は付けない。iOSの「ファイル」では accept="audio/*" を付けると
  //    Safari が変換するUTIと合わず、mp3やm4aがグレーアウトして選べなくなる。
  //    代わりに、取り込むときに拡張子で選り分ける。
  const inp = el('input'); inp.type = 'file'; inp.multiple = true;
  inp.style.display = 'none';
  const btn = el('button', 'ghost', '★ 音源（mp3・m4a）を とりこむ');
  btn.onclick = () => inp.click();
  inp.onchange = async () => {
    const files = [...inp.files]; inp.value = '';
    await importAudio(files, msg => { btn.textContent = msg; });
    btn.textContent = '★ 音源（mp3・m4a）を とりこむ';
    renderSettings();
  };
  imp.append(btn, inp);
  field(a, `とりこみずみ ${n} 首`,
        n ? 'この端末の中だけに保存されています。' :
        'いまは同梱のパブリックドメイン音源（LibriVox）で読んでいます。本物の読み方の音源を入れると、そちらが優先されます。ファイル名の先頭の数字を歌番号として読み取ります（001.mp3 など）。',
        imp);
  if (n) { const clr = el('button', 'ghost', 'ぜんぶ消す');
    clr.onclick = async () => { if (confirm('とりこんだ音源をぜんぶ消しますか？')) { await Audio_.clear(); renderSettings(); } };
    field(a, '', '', clr); }
  const chk = el('button', 'ghost', '音源を たしかめる');
  chk.onclick = () => renderAudioCheck();
  field(a, '音と ふだが 合っているか', '100首を順に鳴らして、歌と音がずれていないか確かめる', chk);

  const k = card('きろく');
  const ex = el('button', 'ghost', '書き出す');
  ex.onclick = () => {
    const blob = new Blob([JSON.stringify({ profile:S.profile, progress:P, settings:S }, null, 1)],
                          { type:'application/json' });
    const a2 = document.createElement('a');
    a2.href = URL.createObjectURL(blob); a2.download = `fudacchi-${S.profile}.json`; a2.click();
  };
  field(k, 'きろくを 書き出す', 'iPadのデータが消えたときのため。ときどき保存しておく（§7.4）', ex);
  const imp2 = el('input'); imp2.type = 'file'; imp2.style.display = 'none';   // accept は付けない（§iOSの癖）
  const ib = el('button', 'ghost', '記録ファイルを 読みこむ'); ib.onclick = () => imp2.click();
  imp2.onchange = async () => { try {
      const j = JSON.parse(await imp2.files[0].text());
      if (j.progress) { P = j.progress; saveProgress(); }
      if (j.settings) { S = { ...S, ...j.settings }; saveSettings(); }
      alert('読みこみました'); renderSettings();
    } catch { alert('読みこめませんでした'); } };
  const iw = el('div'); iw.append(ib, imp2);
  field(k, 'きろくを 読みこむ', '書き出したファイルから元に戻す', iw);
  const who = card('つかう ひと');
  const sw = el('button', 'ghost', 'きりかえる／ふやす');
  sw.onclick = () => openProfilePicker().then(renderSettings);
  field(who, `いまは ${S.profile}`,
        `${profiles().join('・')} が登録されています。記録は人ごとに分かれます`, sw);
  if (profiles().length > 1) {
    const del = el('button', 'ghost', 'この人を けす');
    del.onclick = () => {
      if (!confirm(`${S.profile} と、その記録をぜんぶ消しますか？もどせません`)) return;
      const rest = profiles().filter(n => n !== S.profile);
      localStorage.removeItem(progKey());
      saveProfiles(rest); useProfile(rest[0]); renderSettings();
    };
    field(who, `${S.profile} を けす`, '記録もいっしょに消えます', del);
  }

  const app = card('アプリ');
  field(app, `いまの版　${BUILD}`,
        'うまく動かないときは、まずここを見る。私に伝えるときもこの番号を', el('span'));
  const upd = el('button', 'ghost', 'さいしんに する');
  upd.onclick = async () => {
    try {
      const rg = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rg.map(r => r.unregister()));
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    } catch {}
    alert('ふるいものを消しました。このあと画面が読みこみ直されます。');
    location.reload();
  };
  field(app, 'アプリを さいしんに する',
        'iPadは古い版を抱えこむことがある。押すと、ためこんだものを消して読みこみ直す。とりこんだ音源と記録は消えない',
        upd);

  const rs = el('button', 'ghost', 'ぜんぶ わすれる');
  rs.onclick = () => { if (confirm('おぼえた記録をぜんぶ消しますか？もどせません')) {
      P = {}; saveProgress(); renderSettings(); } };
  field(k, 'きろくを けす', '', rs);
}

// ファイル名の先頭の数字を歌番号として読む。読めなければ、名前順で1〜100に割り当てる。
// 配布元によってファイル名がまちまちなので、両方の道を用意しておく。
function mapFiles(files) {
  const named = files.map(f => {
    const m = f.name.match(/(\d{1,3})/);
    const id = m ? parseInt(m[1], 10) : null;
    return { f, id: (id >= 1 && id <= 100) ? id : null };
  });
  const ok = named.filter(x => x.id);
  const ids = new Set(ok.map(x => x.id));
  // 番号が読めて、しかも重複していなければ、それを信じる
  if (ok.length === files.length && ids.size === files.length) return named;
  return null;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|aif{1,2}|caf|mp4|ogg|oga|opus|flac)$/i;

async function importAudio(all, onProgress) {
  const files = all.filter(f => AUDIO_EXT.test(f.name));
  const dropped = all.length - files.length;
  if (!files.length) {
    alert(all.length ? `音のファイルが見つかりませんでした（${all.length}件えらばれましたが、音声ではないようです）`
                     : 'ファイルがえらばれませんでした');
    return;
  }
  let mapped = mapFiles(files);
  if (!mapped) {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
    const ok = confirm(
      `ファイル名から歌番号を読み取れませんでした（または番号が重なっています）。\n\n` +
      `名前順にならべて、1番から順に割り当てますか？\n` +
      `  さいしょ: ${sorted[0].name} → 1番\n` +
      `  さいご  : ${sorted[sorted.length-1].name} → ${sorted.length}番\n\n` +
      `※ 序歌が混ざっていると1首ずつずれます。とりこんだあと\n` +
      `　「音源を たしかめる」で必ず確認してください。`);
    if (!ok) return;
    mapped = sorted.map((f, i) => ({ f, id: i + 1 })).filter(x => x.id <= 100);
  }
  let n = 0;
  for (const { f, id } of mapped) {
    if (!id) continue;
    await Audio_.put(id, f); n++;
    onProgress?.(`とりこみ中… ${n} / ${mapped.length}`);
  }
  alert(`${n}首 とりこみました。` +
        (dropped ? `\n（音声でないファイル ${dropped}件 はとばしました）` : '') +
        `\n\n「音源を たしかめる」で、歌と音が合っているか確認してください。`);
}

function renderAudioCheck() {
  const b = $('#settingsBody'); b.innerHTML = '';
  const back = el('button', 'ghost', '← せっていに もどる'); back.onclick = renderSettings;
  b.append(back);
  const r = el('div', 'statrow');
  r.append(el('h3', '', '音源のたしかめ'));
  r.append(el('div', 'legend', '再生して、読まれた歌と行の歌が同じか確かめる。ずれていたら、その番号を控えて知らせてください。'));
  const list = el('div', 'checklist');
  for (const p of POEMS) {
    const c = el('div', 'c');
    const play = el('button', '', '▶');
    play.onclick = () => { Audio_.unlock(); Audio_.play(p); };
    c.append(el('span', 'n', String(p.id)), play,
             el('span', '', `${p.kaminoku} / ${p.shimonoku}`),
             Object.assign(el('span', 'n', Audio_.source(p.id) === 'file' ? '取込' : 'PD'),
                           { style: 'margin-left:auto' }));
    list.append(c);
  }
  r.append(list); b.append(r);
}

/* ==================== 起動 ==================== */
(async () => {
  const [pj, gj] = await Promise.all([
    fetch('data/poems.json').then(r => r.json()),
    fetch('data/goshoku.json').then(r => r.json()),
  ]);
  POEMS = pj; GOSHOKU = gj; POEMS.forEach(p => BY_ID[p.id] = p);
  await Audio_.init();
  go('home');
  if ('serviceWorker' in navigator) {
    // 新しい版が有効になったら、自動で読み込み直す。
    // これがないと、コードだけ新しくデータが古い、という食い違いが起きる（実際に起きた）。
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return; reloaded = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

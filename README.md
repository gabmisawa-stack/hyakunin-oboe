# ふだっち

百人一首の決まり字をおぼえる練習アプリ。iPad の Safari で動く。

三澤なつ（小4）が学校の競技かるたに向けて練習するために作った。
設計の意図と判断の根拠はすべて [仕様書.md](仕様書.md) にある。**手を入れる前にそちらを読むこと。**

## 使う

GitHub Pages の URL を Safari で開き、共有ボタンから「ホーム画面に追加」。
一度開けばオフラインでも動く（Service Worker）。横向き推奨。

## 中身

```
index.html  style.css  app.js  srs.js  sw.js  manifest.json
data/poems.json     100首。歌・かな・決まり字（算出済み）・五色
data/goshoku.json   五色の色分け。表示は学校の呼び方、照合用に協会の公式表記も持つ
audio/lv/           LibriVoxのパブリックドメイン音源を100首に分割したもの
tools/              データ生成・検証・音源分割。下記
```

## ⚠️ 音源について

`audio/lv/` に入っているのは **LibriVox のパブリックドメイン音源**だけ。
（[Ogura Hyakunin Isshu](https://archive.org/details/hyakunin_isshu_librivox) / 朗読 kaseumin / 2006 /
Public Domain Mark 1.0。LibriVoxは全録音をパブリックドメインで提供している）

**それ以外の音源を、このリポジトリに置いてはいけない。**
家庭内でしか使わなくても関係ない。GitHub Pages に置いた時点で公衆送信になり、
私的使用の複製（著作権法30条1項）の範囲を外れる。理由は仕様書 §4.0。

本物の競技かるたの読み方で練習したいときは、アプリの
`せってい › よみあげ音声 › 音源を とりこむ` から iPad に直接入れる。
取り込んだ音源は端末の IndexedDB にしか保存されず、どこにも送信されない。

## tools

```bash
node tools/build.mjs        # poems.src.tsv から決まり字を算出し、検証8本を通して data/ を書き出す
node tools/test-srs.mjs     # 出題ロジック（ライトナーの箱）の単体テスト 25本
./tools/fetch-ref.sh && node tools/crosscheck.mjs   # 文化ネットと全100首を照合
python3 tools/split-audio.py                        # LibriVox原本を100首に分割（要 tools/lvsrc/）
python3 tools/make-icons.py                         # アイコン生成
```

`build.mjs` の検証が1本でも落ちたら、`data/` は書き出されない。
歌データを直すときは `tools/poems.src.tsv` を編集して `build.mjs` を回す。
`data/poems.json` を直接いじらない。

## ローカルで見る

```bash
python3 -m http.server 8731
```

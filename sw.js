// ふだっち — オフライン用 Service Worker
// アプリ本体とデータは先にキャッシュする。音源は使った分だけ後から貯める。
const V = "fudacchi-v22";
const SHELL = ['./', './index.html', './style.css', './app.js', './srs.js', './manifest.json',
               './data/poems.json', './data/goshoku.json', './data/bgm.json',
               './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // 音源は volume が大きいので、要求されたものだけキャッシュに足していく
  if (url.pathname.includes('/audio/')) {
    e.respondWith(caches.match(request).then(hit => hit || fetch(request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(request, copy)); }
      return res;
    }).catch(() => new Response('', { status: 504 }))));
    return;
  }
  // データはネット優先。コードだけ新しくデータが古い、という食い違いを避ける。
  // つながらないときだけキャッシュを使う。
  if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request)));
    return;
  }
  // それ以外はキャッシュ優先。裏で更新を取りにいく
  e.respondWith(caches.match(request).then(hit => {
    const net = fetch(request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(request, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});

// Service Worker：オフラインでも遊べるように、ゲームのファイルを端末に保存しておく（PWA。ステップ8）
// ゲームのファイルを更新して公開するときは、CACHE の番号を上げる（古い保存は消える）
// 画像を足したり名前を変えたりしたときは、下の IMAGES も直す（assets/img/ の一覧と同じにする）
const CACHE = 'sengoku-v1';

// 起動に必要なもの（1つでも取れなければ入れ直す）
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/config.js',
  'js/data.js',
  'js/format.js',
  'js/images.js',
  'js/state.js',
  'js/systems.js',
  'js/work.js',
  'js/workview.js',
  'js/ui.js',
  'js/main.js',
  'assets/icon/icon-192.png',
  'assets/icon/icon-512.png',
];

// 画像（無いものがあっても止めない。ゲームは仮の表示で動く）
const IMAGES = [
  'assets/img/battle_boss.webp',
  'assets/img/battle_defeat.webp',
  'assets/img/battle_defense.webp',
  'assets/img/battle_field.webp',
  'assets/img/battle_normal.webp',
  'assets/img/bg_main.webp',
  'assets/img/bg_main_portrait.webp',
  'assets/img/castle_0.webp',
  'assets/img/castle_1.webp',
  'assets/img/castle_2.webp',
  'assets/img/castle_3.webp',
  'assets/img/ending.webp',
  'assets/img/event_alliance.webp',
  'assets/img/event_ikki.webp',
  'assets/img/event_marriage.webp',
  'assets/img/event_merchant.webp',
  'assets/img/event_rebellion.webp',
  'assets/img/heirloom_artofwar.webp',
  'assets/img/heirloom_crown.webp',
  'assets/img/heirloom_famedsword.webp',
  'assets/img/heirloom_secretbook.webp',
  'assets/img/heirloom_teabowl.webp',
  'assets/img/map_stage1.webp',
  'assets/img/map_stage2.webp',
  'assets/img/map_stage3.webp',
  'assets/img/map_stage4.webp',
  'assets/img/map_stage5.webp',
  'assets/img/mine_bg.webp',
  'assets/img/mine_drop.webp',
  'assets/img/mine_rock_0.webp',
  'assets/img/mine_rock_1.webp',
  'assets/img/mine_rock_vein.webp',
  'assets/img/portrait_01.webp',
  'assets/img/portrait_02.webp',
  'assets/img/portrait_03.webp',
  'assets/img/portrait_04.webp',
  'assets/img/portrait_05.webp',
  'assets/img/portrait_06.webp',
  'assets/img/portrait_07.webp',
  'assets/img/portrait_08.webp',
  'assets/img/portrait_09.webp',
  'assets/img/portrait_10.webp',
  'assets/img/portrait_11.webp',
  'assets/img/portrait_12.webp',
  'assets/img/portrait_13.webp',
  'assets/img/portrait_14.webp',
  'assets/img/portrait_15.webp',
  'assets/img/portrait_16.webp',
  'assets/img/portrait_17.webp',
  'assets/img/portrait_18.webp',
  'assets/img/portrait_19.webp',
  'assets/img/portrait_20.webp',
  'assets/img/result_recover.webp',
  'assets/img/result_stageup.webp',
  'assets/img/rice_drop.webp',
  'assets/img/rice_ear_0.webp',
  'assets/img/rice_ear_1.webp',
  'assets/img/rice_ear_2.webp',
  'assets/img/rice_ear_bumper.webp',
  'assets/img/rice_field.webp',
  'assets/img/succession_ceremony.webp',
  'assets/img/succession_heir.webp',
  'assets/img/succession_retire.webp',
  'assets/img/tool_pickaxe_0.webp',
  'assets/img/tool_pickaxe_1.webp',
  'assets/img/tool_pickaxe_2.webp',
  'assets/img/tool_pickaxe_3.webp',
  'assets/img/tool_sickle_0.webp',
  'assets/img/tool_sickle_1.webp',
  'assets/img/tool_sickle_2.webp',
  'assets/img/tool_sickle_3.webp',
  'assets/img/tool_sickle_4.webp',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(CORE).then(function () {
      return Promise.all(IMAGES.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

// 古い番号の保存を消す
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 画像は保存したものを先に使う。HTML・CSS・JS はつながっていれば新しいものを取り、つながらなければ保存したものを使う
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isImage = /\.(webp|png)$/.test(new URL(req.url).pathname);
  if (isImage) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});

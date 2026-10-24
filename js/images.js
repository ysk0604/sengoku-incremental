// 画像の読み込み（assets/img/ に WebP があれば差し替え、なければ今の仮の表示のまま）
// 低スペック対策：画像は使う場面が来たときに初めて読み込む。一度読んだものは覚えておく
// 一覧は assets/IMAGE_LIST.md
window.Game = window.Game || {};

(function () {
  const DIR = 'assets/img/';
  const cache = {}; // 名前 → { state: 'loading' | 'ok' | 'missing', img, waiters }

  function url(name) { return DIR + name + '.webp'; }

  // 読み込む（済んでいれば、すぐ cb(読めたか) を呼ぶ）
  function load(name, cb) {
    let c = cache[name];
    if (!c) {
      c = cache[name] = { state: 'loading', img: new Image(), waiters: [] };
      c.img.decoding = 'async';
      c.img.onload = function () { done(c, 'ok'); };
      c.img.onerror = function () { done(c, 'missing'); };
      c.img.src = url(name);
    }
    if (!cb) return;
    if (c.state === 'loading') c.waiters.push(cb);
    else cb(c.state === 'ok');
  }

  function done(c, state) {
    c.state = state;
    const w = c.waiters;
    c.waiters = [];
    w.forEach(function (cb) { cb(state === 'ok'); });
  }

  // Canvas 用：読めていれば画像、まだ・なければ null（初めて呼ばれたときに読み込みを始める）
  function get(name) {
    const c = cache[name];
    if (!c) { load(name); return null; }
    return c.state === 'ok' ? c.img : null;
  }

  // DOM 用：仮の表示の箱に画像を重ねる。画像があれば箱に has-img を付ける（仮の文字は CSS で隠す）
  // 同じ箱に別の画像を指定し直したら、前の画像は外す
  function fill(el, name) {
    if (el.dataset.img === name) return;
    el.dataset.img = name;
    const old = el.querySelector(':scope > .img-fill');
    if (old) old.remove();
    el.classList.remove('has-img');
    load(name, function (ok) {
      if (!ok || el.dataset.img !== name) return;
      const img = document.createElement('img');
      img.className = 'img-fill';
      img.alt = '';
      img.draggable = false;
      img.src = url(name);
      el.insertBefore(img, el.firstChild);
      el.classList.add('has-img');
    });
  }

  // 画像の名前（ファイル名から .webp を除いたもの）
  const names = {
    portrait: function (n) { return 'portrait_' + String(n).padStart(2, '0'); },
    castle: function (look) { return 'castle_' + look; },
    map: function (stage) { return 'map_stage' + stage; },
    heirloom: function (id) { return 'heirloom_' + id.toLowerCase(); },
    event: function (id) { return 'event_' + id; },
    sickle: function (i) { return 'tool_sickle_' + i; },
    pickaxe: function (i) { return 'tool_pickaxe_' + i; },
  };

  Game.images = { load: load, get: get, fill: fill, url: url, names: names };
})();

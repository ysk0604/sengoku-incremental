// 稲刈りと金山の作業画面（Canvas の描画とマウス）。ロジックは work.js
// 低スペック対策：内政タブを開いていてブラウザのタブも見えているときだけ、約30fpsで計算と描画をする
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  const W = cfg.WORK;
  const data = Game.data;
  const fmt = Game.format;
  const work = Game.work;

  const FRAME_MS = 33; // 描画の間隔（約30fps）

  const els = {};
  let ctx = null;
  let fields = {};      // 'rice' / 'mine' → 作業画面の中身（代が変わったら作り直す）
  let fieldsKey = null;
  let shownField = null; // いま計算している作業画面
  let lastFrame = 0;
  let lastDraw = 0;
  let fontFamily = 'serif';
  const cursor = { x: W.WIDTH / 2, y: W.HEIGHT / 2, inside: false };

  function $(id) { return document.getElementById(id); }
  function cur() { return Game.state.current; }
  function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
  function setClass(el, cls, on) { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }
  function setDisabled(el, v) { if (el.disabled !== v) el.disabled = v; }

  // 内政タブが開いていて、ブラウザのタブも見えているか
  function isVisible() {
    return !document.hidden && els.panel.classList.contains('active');
  }

  // 代が変わる・データが入れ替わると作り直す
  function fieldFor(s, kind) {
    const key = s.generation + ':' + s.lineage.length;
    if (key !== fieldsKey || fields.state !== s) {
      fields = { state: s };
      fieldsKey = key;
      shownField = null; // 前の代の画面は捨てる（跳ねている資源も前の代のもの）
    }
    if (!fields[kind]) fields[kind] = work.createField(s, kind);
    return fields[kind];
  }

  // 画面を閉じた・切り替えた：跳ねている資源をすぐ加えて、カーソルを外す
  function hideField(s) {
    if (!shownField) return;
    work.flush(s, shownField);
    shownField.cursor.inside = false;
    shownField = null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const s = cur();
    if (!isVisible() || s.succession) {
      work.displayed = null;
      hideField(s);
      lastFrame = now;
      return;
    }
    if (now - lastDraw < FRAME_MS) return;
    lastDraw = now;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000)); // 止まっていた分は進めない
    lastFrame = now;

    const kind = s.work.view === 'mine' && work.mineUnlocked(s) ? 'mine' : 'rice';
    const f = fieldFor(s, kind);
    if (shownField !== f) {
      hideField(s);
      shownField = f;
    }
    work.displayed = kind;
    f.cursor.x = cursor.x;
    f.cursor.y = cursor.y;
    f.cursor.inside = cursor.inside;
    work.tickField(s, f, dt);
    draw(s, f, now / 1000);
  }

  // ---- 描画 ----

  const COLORS = {
    paddy: '#8f9a5c', paddyLine: '#7d8850',
    stalk: '#5b6b2e',
    ear: ['#7fae45', '#d8bf4a', '#e7a21c'],
    bumper: '#ffd76a',
    rockTop: '#8a735a', rockDeep: '#6a5745', rockEdge: '#1e1813',
    vein: '#f2c544',
    ring: 'rgba(250, 246, 236, 0.85)',
    pop: '#fff6d0', popBig: '#ffd34d', popEdge: 'rgba(42, 38, 34, 0.8)',
    hint: 'rgba(250, 246, 236, 0.9)',
  };

  function draw(s, f, t) {
    ctx.clearRect(0, 0, W.WIDTH, W.HEIGHT);
    if (f.kind === 'rice') drawPaddy(f, t); else drawMine(s, f);
    drawDrops(f);
    drawPops(f);
    drawCursor(s, f);
  }

  function drawPaddy(f, t) {
    ctx.fillStyle = COLORS.paddy;
    ctx.fillRect(0, 0, W.WIDTH, W.HEIGHT);
    ctx.strokeStyle = COLORS.paddyLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 30; y < W.HEIGHT; y += 30) { ctx.moveTo(0, y); ctx.lineTo(W.WIDTH, y); }
    ctx.stroke();

    f.items.forEach(function (e) {
      const stage = work.earStage(e);
      if (stage === 'bumper') {
        // 光る豊作の穂（影のぼかしは重いので、半透明の円を重ねる）
        ctx.fillStyle = 'rgba(255, 230, 120, ' + (0.25 + 0.2 * Math.sin(t * 6 + e.id)) + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = COLORS.stalk;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + 16);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.fillStyle = stage === 'bumper' ? COLORS.bumper : COLORS.ear[stage];
      ctx.beginPath();
      const size = stage === 'bumper' ? 1.4 : 0.8 + 0.15 * stage;
      ctx.ellipse(e.x + 2, e.y - 2, 4 * size, 8 * size, 0.35, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMine(s, f) {
    ctx.fillStyle = COLORS.rockEdge;
    ctx.fillRect(0, 0, W.WIDTH, W.HEIGHT);
    f.items.forEach(function (r) {
      // 深い岩ほど暗く
      const deep = Math.min(1, r.row / W.MINE.ROWS + (r.depth % W.MINE.DEPTH_STEP) / (W.MINE.DEPTH_STEP * 4));
      ctx.fillStyle = deep > 0.5 ? COLORS.rockDeep : COLORS.rockTop;
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      if (r.vein) {
        ctx.fillStyle = COLORS.vein;
        ctx.fillRect(r.x + r.w * 0.3, r.y + r.h * 0.3, 6, 6);
        ctx.fillRect(r.x + r.w * 0.6, r.y + r.h * 0.55, 5, 5);
        ctx.fillRect(r.x + r.w * 0.45, r.y + r.h * 0.7, 4, 4);
      }
      if (r.hp < r.maxHp) {
        // ひび：減った耐久の分だけ濃く
        ctx.strokeStyle = 'rgba(250, 246, 236, ' + (0.2 + 0.6 * (1 - r.hp / r.maxHp)) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r.x + r.w * 0.2, r.y + r.h * 0.25);
        ctx.lineTo(r.x + r.w * 0.5, r.y + r.h * 0.5);
        ctx.lineTo(r.x + r.w * 0.4, r.y + r.h * 0.8);
        ctx.moveTo(r.x + r.w * 0.5, r.y + r.h * 0.5);
        ctx.lineTo(r.x + r.w * 0.8, r.y + r.h * 0.4);
        ctx.stroke();
      }
    });
    ctx.fillStyle = COLORS.hint;
    ctx.font = 'bold 14px ' + fontFamily;
    ctx.fillText('深さ ' + fmt.num(s.work.depth) + '間', 8, 18);
  }

  function drawDrops(f) {
    f.drops.forEach(function (d) {
      const p = d.t / W.DROP_SECONDS;
      const y = d.y - Math.sin(p * Math.PI) * 16; // 少し跳ねる
      ctx.fillStyle = f.kind === 'rice' ? '#f4e3a1' : COLORS.vein;
      ctx.beginPath();
      ctx.arc(d.x, y, d.big ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPops(f) {
    ctx.font = 'bold 15px ' + fontFamily;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    f.pops.forEach(function (p) {
      const a = 1 - p.t / W.POP_SECONDS;
      const y = p.y - p.t * 40;
      ctx.globalAlpha = Math.max(0, a);
      ctx.strokeStyle = COLORS.popEdge;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.big ? COLORS.popBig : COLORS.pop;
      ctx.fillText(p.text, p.x, y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  function drawCursor(s, f) {
    if (!f.cursor.inside) {
      if (!s.work.manualRate[f.kind]) {
        ctx.fillStyle = COLORS.hint;
        ctx.font = 'bold 16px ' + fontFamily;
        ctx.textAlign = 'center';
        ctx.fillText(f.kind === 'rice' ? 'カーソルを乗せると、円の中の稲穂を鎌で刈り取ります' : 'カーソルを乗せると、円の中の岩をツルハシで砕きます',
          W.WIDTH / 2, W.HEIGHT / 2);
        ctx.textAlign = 'start';
      }
      return;
    }
    const tool = work.tool(s, f.kind);
    ctx.strokeStyle = COLORS.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.cursor.x, f.cursor.y, tool.radius, 0, Math.PI * 2);
    ctx.stroke();
    if (f.strikeFlash > 0) {
      ctx.fillStyle = 'rgba(250, 246, 236, ' + Math.min(0.35, f.strikeFlash * 2) + ')';
      ctx.beginPath();
      ctx.arc(f.cursor.x, f.cursor.y, tool.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 横の操作パネル（ui.update から毎ティック呼ぶ）----

  function toolText(kind, i) {
    const t = work.toolList(kind)[i];
    return work.toolNames(kind)[i] + '　威力' + fmt.num(t.power) + '・範囲' + t.radius + '・' + t.speed + '回/秒';
  }

  // 「田んぼ：手作業」「金山：自動 30%（金 +12/秒）」のような今の状態
  function statusText(s, kind) {
    const name = kind === 'rice' ? '田んぼ' : '金山';
    if (work.displayed === kind) return name + '：手作業';
    const r = work.autoRatio(s, kind);
    if (r <= 0) return name + '：止まっている';
    const income = work.autoIncome(s, kind);
    const res = kind === 'rice' ? '米' : '金';
    return name + '：自動 ' + Math.round(r * 100) + '%' +
      (income > 0 ? '（' + res + ' ' + fmt.rate(income) + '）' : '（手作業の記録がまだない）');
  }

  function update(s) {
    const mine = work.mineUnlocked(s);
    const kind = s.work.view === 'mine' && mine ? 'mine' : 'rice';
    setClass(els.switchBox, 'hidden', !mine);
    setClass(els.viewRice, 'active', kind === 'rice');
    setClass(els.viewMine, 'active', kind === 'mine');

    setText(els.statusRice, statusText(s, 'rice'));
    setText(els.statusMine, mine ? statusText(s, 'mine') : '');
    setClass(els.statusMine, 'hidden', !mine);

    setText(els.toolLabel, kind === 'rice' ? '鎌' : 'ツルハシ');
    setText(els.toolName, toolText(kind, work.toolIndex(s, kind)));
    const next = work.nextToolIndex(s, kind);
    if (next < 0) {
      setText(els.toolBuy, '最高の道具');
      setDisabled(els.toolBuy, true);
    } else {
      setText(els.toolBuy, work.toolNames(kind)[next] + 'を新調（金 ' + fmt.num(work.toolList(kind)[next].price) + '）');
      setDisabled(els.toolBuy, !work.canBuyTool(s, kind));
      els.toolBuy.title = toolText(kind, next);
    }

    setClass(els.mineBox, 'hidden', kind !== 'mine');
    if (kind === 'mine') {
      setText(els.depth, '深さ ' + fmt.num(s.work.depth) + '間（この代の最深 ' + fmt.num(s.work.maxDepth) + '間）');
      const cd = s.work.blastCd;
      setText(els.blast, cd > 0 ? '発破（あと' + Math.ceil(cd) + '秒）' : '発破（金 ' + fmt.num(work.blastCost(s)) + '）');
      setDisabled(els.blast, !work.canBlast(s) || !shownField || shownField.kind !== 'mine');
    }
  }

  function setView(view) {
    const s = cur();
    if (view === 'mine' && !work.mineUnlocked(s)) return;
    s.work.view = view;
    Game.ui.update();
  }

  function init() {
    els.panel = $('tab-domestic');
    els.canvas = $('work-canvas');
    els.switchBox = $('work-switch');
    els.viewRice = $('work-view-rice');
    els.viewMine = $('work-view-mine');
    els.statusRice = $('work-status-rice');
    els.statusMine = $('work-status-mine');
    els.toolLabel = $('work-tool-label');
    els.toolName = $('work-tool-name');
    els.toolBuy = $('work-tool-buy');
    els.mineBox = $('work-mine-box');
    els.depth = $('work-depth');
    els.blast = $('work-blast');

    els.canvas.width = W.WIDTH;
    els.canvas.height = W.HEIGHT;
    ctx = els.canvas.getContext('2d');
    fontFamily = getComputedStyle(document.body).fontFamily;

    // 画面の大きさに合わせて縮んでいても、Canvas の座標に直す
    const move = function (e) {
      const rect = els.canvas.getBoundingClientRect();
      cursor.x = (e.clientX - rect.left) * (W.WIDTH / rect.width);
      cursor.y = (e.clientY - rect.top) * (W.HEIGHT / rect.height);
      cursor.inside = true;
    };
    els.canvas.addEventListener('mousemove', move);
    els.canvas.addEventListener('mouseenter', move);
    els.canvas.addEventListener('mouseleave', function () { cursor.inside = false; });

    els.viewRice.addEventListener('click', function () { setView('rice'); });
    els.viewMine.addEventListener('click', function () { setView('mine'); });
    els.toolBuy.addEventListener('click', function () {
      const s = cur();
      const kind = s.work.view === 'mine' && work.mineUnlocked(s) ? 'mine' : 'rice';
      if (work.buyTool(s, kind)) Game.ui.update();
    });
    els.blast.addEventListener('click', function () {
      if (shownField && work.blast(cur(), shownField)) Game.ui.update();
    });

    requestAnimationFrame(function (now) {
      lastFrame = now;
      requestAnimationFrame(frame);
    });
  }

  Game.workView = { init: init, update: update };
})();

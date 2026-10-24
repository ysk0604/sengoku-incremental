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
    if (!isVisible() || Game.systems.isPaused(s)) {
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
    ring: 'rgba(250, 246, 236, 0.35)', // 作業範囲の円は薄く（道具の絵が主役）
    pop: '#fff6d0', popBig: '#ffd34d', popEdge: 'rgba(42, 38, 34, 0.8)',
    hint: 'rgba(250, 246, 236, 0.9)',
  };

  // 画像（assets/img/）。読めていなければ null で、今までの図形で描く
  function img(name) { return Game.images.get(name); }

  // 稲穂の絵の大きさ（Canvas の座標。下の真ん中が根元）
  const EAR_W = 22;
  const EAR_H = 33;

  function draw(s, f, t) {
    ctx.clearRect(0, 0, W.WIDTH, W.HEIGHT);
    if (f.kind === 'rice') drawPaddy(f, t); else drawMine(s, f, t);
    drawDrops(f);
    drawPops(f);
    drawCursor(s, f, t);
  }

  function drawPaddy(f, t) {
    const bg = img('rice_field');
    if (bg) {
      ctx.drawImage(bg, 0, 0, W.WIDTH, W.HEIGHT);
    } else {
      ctx.fillStyle = COLORS.paddy;
      ctx.fillRect(0, 0, W.WIDTH, W.HEIGHT);
      ctx.strokeStyle = COLORS.paddyLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 30; y < W.HEIGHT; y += 30) { ctx.moveTo(0, y); ctx.lineTo(W.WIDTH, y); }
      ctx.stroke();
    }

    f.items.forEach(function (e) {
      const stage = work.earStage(e);
      if (stage === 'bumper') {
        // 光る豊作の穂（影のぼかしは重いので、半透明の円を重ねる）
        ctx.fillStyle = 'rgba(255, 230, 120, ' + (0.25 + 0.2 * Math.sin(t * 6 + e.id)) + ')';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      const sprite = img(stage === 'bumper' ? 'rice_ear_bumper' : 'rice_ear_' + stage);
      if (sprite) {
        const k = stage === 'bumper' ? 1.4 : 1;
        ctx.drawImage(sprite, e.x - EAR_W * k / 2, e.y + 16 - EAR_H * k, EAR_W * k, EAR_H * k);
        return;
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

  function drawMine(s, f, t) {
    const bg = img('mine_bg');
    if (bg) {
      ctx.drawImage(bg, 0, 0, W.WIDTH, W.HEIGHT);
    } else {
      ctx.fillStyle = COLORS.rockEdge;
      ctx.fillRect(0, 0, W.WIDTH, W.HEIGHT);
    }
    const rockImgs = [img('mine_rock_0'), img('mine_rock_1')];
    const veinImg = img('mine_rock_vein');
    f.items.forEach(function (r) {
      // 深い岩ほど暗く
      const deep = Math.min(1, r.row / W.MINE.ROWS + (r.depth % W.MINE.DEPTH_STEP) / (W.MINE.DEPTH_STEP * 4));
      const sprite = r.vein && veinImg ? veinImg : rockImgs[deep > 0.5 ? 1 : 0];
      if (sprite) {
        ctx.drawImage(sprite, r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      } else {
        ctx.fillStyle = deep > 0.5 ? COLORS.rockDeep : COLORS.rockTop;
        ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      }
      if (r.vein && !(sprite && sprite === veinImg)) {
        ctx.fillStyle = COLORS.vein;
        ctx.fillRect(r.x + r.w * 0.3, r.y + r.h * 0.3, 6, 6);
        ctx.fillRect(r.x + r.w * 0.6, r.y + r.h * 0.55, 5, 5);
        ctx.fillRect(r.x + r.w * 0.45, r.y + r.h * 0.7, 4, 4);
      }
      if (r.vein) {
        // 光る岩（半透明の四角を明滅させる）
        ctx.fillStyle = 'rgba(255, 220, 110, ' + (0.08 + 0.08 * Math.sin(t * 5 + r.id)) + ')';
        ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
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
    const sprite = img(f.kind === 'rice' ? 'rice_drop' : 'mine_drop');
    f.drops.forEach(function (d) {
      const p = d.t / W.DROP_SECONDS;
      const y = d.y - Math.sin(p * Math.PI) * 16; // 少し跳ねる
      if (sprite) {
        const size = d.big ? 16 : 11;
        ctx.drawImage(sprite, d.x - size / 2, y - size / 2, size, size);
        return;
      }
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

  // ---- 道具の絵（カーソルの位置に出す。OS のカーソルは CSS で隠す）----
  // 絵は 128×128。刃（ツルハシの頭）が左上、柄の握りが右下。
  // カーソルの位置に絵の HOT の点（刃の真ん中）を合わせ、PIVOT（握り）を中心に回して振る
  const TOOL_IMG = 128;
  const TOOL_SIZE = 64;                // Canvas に描く大きさ
  const HOT = { x: 40, y: 40 };
  const PIVOT = { x: 104, y: 116 };
  const SWING_ANGLE = -0.6;            // 振り下ろすときの回転（ラジアン）
  const SWING_SEC = 0.16;              // 振り下ろして戻るまで（速い道具は打つ間隔に合わせて短く）
  const NEW_TOOL_SEC = 0.9;            // 新調の演出の長さ

  // 素材ごとの色（仮の絵に使う。画像があれば画像を使う）
  const TOOL_STYLES = {
    rusty: { blade: '#8b4a2b', edge: '#b0683e', handle: '#8a5a32', chips: true },
    iron: { blade: '#7b7e83', edge: '#a6a9ad', handle: '#9a6b3e' },
    steel: { blade: '#93acc4', edge: '#eef6ff', handle: '#6e4a2c', shine: true },
    master: { blade: '#c8ccd3', edge: '#ffffff', handle: '#3f2a1c', hamon: true, cord: '#c0392b' },
    tenka: { blade: '#e2b232', edge: '#fff1b0', handle: '#5a3a1e', gold: '#f6d35a', glow: true },
  };
  const TOOL_TIERS = {
    rice: ['rusty', 'iron', 'steel', 'master', 'tenka'],
    mine: ['iron', 'steel', 'master', 'tenka'],
  };

  const placeholderTools = {}; // 'rice:2' → 仮の絵の Canvas（一度だけ描く）

  function toolImageName(kind, i) {
    return kind === 'rice' ? Game.images.names.sickle(i) : Game.images.names.pickaxe(i);
  }

  function toolStyle(kind, i) {
    return TOOL_STYLES[TOOL_TIERS[kind][i]];
  }

  // 画像があれば画像、なければ仮の絵
  function toolSprite(kind, i) {
    return img(toolImageName(kind, i)) || placeholderTool(kind, i);
  }

  function placeholderTool(kind, i) {
    const key = kind + ':' + i;
    if (placeholderTools[key]) return placeholderTools[key];
    const c = document.createElement('canvas');
    c.width = TOOL_IMG;
    c.height = TOOL_IMG;
    const g = c.getContext('2d');
    const st = toolStyle(kind, i);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // 柄
    const top = kind === 'rice' ? { x: 64, y: 52 } : { x: 54, y: 54 };
    g.strokeStyle = '#2a2018';
    g.lineWidth = 13;
    line(g, PIVOT.x, PIVOT.y, top.x, top.y);
    g.strokeStyle = st.handle;
    g.lineWidth = 9;
    line(g, PIVOT.x, PIVOT.y, top.x, top.y);
    if (st.gold) {
      // 金の金具
      g.strokeStyle = st.gold;
      g.lineWidth = 11;
      line(g, 94, 103, 90, 98);
      line(g, top.x + 8, top.y + 10, top.x + 4, top.y + 5);
    }
    if (st.cord) {
      // 朱色の飾り紐（柄に巻いて、房を垂らす）
      g.strokeStyle = st.cord;
      g.lineWidth = 4;
      line(g, 86, 90, 92, 86);
      line(g, 90, 96, 96, 92);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(92, 92);
      g.quadraticCurveTo(84, 106, 80, 120);
      g.moveTo(93, 93);
      g.quadraticCurveTo(90, 108, 88, 122);
      g.stroke();
    }

    // 刃（鎌）・頭（ツルハシ）
    g.beginPath();
    if (kind === 'rice') {
      g.moveTo(68, 48);
      g.quadraticCurveTo(42, 22, 8, 46);    // 背
      g.quadraticCurveTo(36, 36, 62, 60);   // 刃
    } else {
      g.moveTo(96, 18);
      g.quadraticCurveTo(44, 20, 8, 88);    // 外側
      g.quadraticCurveTo(58, 50, 100, 30);  // 内側（真ん中を厚く）
    }
    g.closePath();
    g.fillStyle = st.blade;
    g.fill();
    g.strokeStyle = '#1e1813';
    g.lineWidth = 2;
    g.stroke();

    // 刃の光（よく切れる刃ほど明るく）
    g.strokeStyle = st.edge;
    g.lineWidth = st.shine || st.gold ? 3 : 2;
    g.beginPath();
    if (kind === 'rice') {
      g.moveTo(14, 46);
      g.quadraticCurveTo(38, 38, 60, 57);
    } else {
      g.moveTo(18, 80);
      g.quadraticCurveTo(48, 44, 90, 31);
    }
    g.stroke();
    if (st.shine) {
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      g.beginPath();
      g.arc(kind === 'rice' ? 36 : 54, kind === 'rice' ? 36 : 38, 3, 0, Math.PI * 2);
      g.fill();
    }
    if (st.hamon) {
      // 刃文（波の模様）
      g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      g.lineWidth = 1.5;
      g.beginPath();
      if (kind === 'rice') {
        g.moveTo(16, 43);
        for (let k = 0; k < 5; k++) g.quadraticCurveTo(20 + k * 9, 36 + (k % 2) * 6, 25 + k * 9, 41 + k * 1.5);
      } else {
        g.moveTo(24, 70);
        for (let k = 0; k < 5; k++) g.quadraticCurveTo(30 + k * 11, 56 - k * 5 + (k % 2) * 6, 36 + k * 11, 60 - k * 6);
      }
      g.stroke();
    }
    if (st.gold) {
      // 金の装飾（刃の付け根の飾り）
      g.fillStyle = '#fff6c8';
      g.beginPath();
      g.arc(top.x, top.y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#a87a12';
      g.lineWidth = 1.5;
      g.stroke();
    }
    if (st.chips) {
      // 刃こぼれ（刃に欠けを入れ、錆の斑点を散らす）
      g.globalCompositeOperation = 'destination-out';
      [[24, 44], [40, 46], [52, 52]].forEach(function (p) {
        g.beginPath();
        g.arc(p[0], p[1] + 2, 3, 0, Math.PI * 2);
        g.fill();
      });
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#5e2c17';
      [[30, 36], [46, 40], [20, 42]].forEach(function (p) {
        g.beginPath();
        g.arc(p[0], p[1], 2, 0, Math.PI * 2);
        g.fill();
      });
    }
    placeholderTools[key] = c;
    return c;
  }

  function line(g, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // 道具の絵を描く（x, y = 刃の位置。angle = 振りの回転。scale = 大きさ。alpha = 透明度）
  function drawTool(sprite, x, y, angle, scale, alpha, glow) {
    const k = TOOL_SIZE / TOOL_IMG * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + (PIVOT.x - HOT.x) * k, y + (PIVOT.y - HOT.y) * k);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -PIVOT.x * k, -PIVOT.y * k, TOOL_IMG * k, TOOL_IMG * k);
    if (glow > 0) {
      // 光らせる（同じ絵を加算で重ねる）
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * glow;
      ctx.drawImage(sprite, -PIVOT.x * k, -PIVOT.y * k, TOOL_IMG * k, TOOL_IMG * k);
    }
    ctx.restore();
  }

  // 道具ごとの動きの記録（振り始めた時刻・新調した時刻）
  const toolAnim = {
    rice: { field: null, strikes: 0, swingAt: -1, index: 0, prevIndex: 0, newAt: -1 },
    mine: { field: null, strikes: 0, swingAt: -1, index: 0, prevIndex: 0, newAt: -1 },
  };

  function trackTool(s, f, t) {
    const a = toolAnim[f.kind];
    const index = work.toolIndex(s, f.kind);
    if (a.field !== f) {
      // 代が変わった・画面を作り直した：動きは引き継がない
      a.field = f;
      a.strikes = f.strikes;
      a.index = index;
      a.newAt = -1;
    }
    if (f.strikes !== a.strikes) {
      a.strikes = f.strikes;
      a.swingAt = t;
    }
    if (index > a.index) {
      a.prevIndex = a.index;
      a.newAt = t;
    }
    a.index = index;
    return a;
  }

  function swingAngle(s, f, a, t) {
    if (a.swingAt < 0) return 0;
    const dur = Math.min(SWING_SEC, 0.8 / work.tool(s, f.kind).speed);
    const p = (t - a.swingAt) / dur;
    return p >= 0 && p < 1 ? SWING_ANGLE * Math.sin(p * Math.PI) : 0;
  }

  function drawCursor(s, f, t) {
    const a = trackTool(s, f, t);
    const index = a.index;
    const newP = a.newAt >= 0 ? (t - a.newAt) / NEW_TOOL_SEC : 1;
    const showing = newP < 1; // 新調の演出中

    if (!f.cursor.inside && !showing) {
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
    const st = toolStyle(f.kind, index);
    // カーソルが外にあるとき（新調ボタンを押した直後）は、画面の真ん中で見せる
    const x = f.cursor.inside ? f.cursor.x : W.WIDTH / 2;
    const y = f.cursor.inside ? f.cursor.y : W.HEIGHT / 2;

    if (f.cursor.inside) {
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, tool.radius, 0, Math.PI * 2);
      ctx.stroke();
      if (f.strikeFlash > 0) {
        ctx.fillStyle = 'rgba(250, 246, 236, ' + Math.min(0.15, f.strikeFlash) + ')';
        ctx.beginPath();
        ctx.arc(x, y, tool.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (st.glow) {
      // 天下の道具は淡く光る
      ctx.fillStyle = 'rgba(255, 214, 90, ' + (0.16 + 0.08 * Math.sin(t * 3)) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!showing) {
      drawTool(toolSprite(f.kind, index), x, y, swingAngle(s, f, a, t), 1, 1, 0);
      return;
    }

    // ---- 新調の演出：古い道具が光って消え、新しい道具が光りながら現れる ----
    const ease = function (v) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3); };
    ctx.strokeStyle = 'rgba(255, 220, 120, ' + (0.85 * (1 - newP)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 14 + 70 * ease(newP), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4 + newP;
      const r1 = 22 + 30 * newP;
      const r2 = 34 + 46 * newP;
      ctx.moveTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
    }
    ctx.stroke();
    if (newP < 0.3) {
      const q = newP / 0.3;
      drawTool(toolSprite(f.kind, a.prevIndex), x, y, 0, 1 + 0.3 * q, 1 - q, q);
    }
    if (newP >= 0.15) {
      const q = (newP - 0.15) / 0.85;
      drawTool(toolSprite(f.kind, index), x, y, 0, 1.6 - 0.6 * ease(q * 1.6), Math.min(1, q * 3), 1 - q);
    }
    // 新しい道具の名前
    ctx.font = 'bold 16px ' + fontFamily;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.globalAlpha = Math.min(1, (1 - newP) * 3);
    const label = work.toolNames(f.kind)[index] + 'を新調！';
    const ly = y - 46 < 18 ? y + 62 : y - 46;
    ctx.strokeStyle = COLORS.popEdge;
    ctx.strokeText(label, x, ly);
    ctx.fillStyle = COLORS.popBig;
    ctx.fillText(label, x, ly);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  // 横の操作パネルの道具の小さな絵（画像があれば画像、なければ仮の絵）
  let toolIcon = { kind: null, index: -1, loaded: false };
  function updateToolIcon(kind, i) {
    const name = toolImageName(kind, i);
    const loaded = !!img(name);
    if (toolIcon.kind === kind && toolIcon.index === i && toolIcon.loaded === loaded) return;
    const upgraded = toolIcon.kind === kind && i > toolIcon.index;
    toolIcon = { kind: kind, index: i, loaded: loaded };
    els.toolIcon.style.backgroundImage = 'url("' + (loaded ? Game.images.url(name) : placeholderTool(kind, i).toDataURL()) + '")';
    if (upgraded) {
      // 新調した：小さく光らせる（アニメーションを最初からやり直す）
      els.toolIcon.classList.remove('flash');
      void els.toolIcon.offsetWidth;
      els.toolIcon.classList.add('flash');
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
    updateToolIcon(kind, work.toolIndex(s, kind));
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
    els.toolIcon = $('work-tool-icon');
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

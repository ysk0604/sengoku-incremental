// 稲刈りと金山（カーソルの周りの円の中を、道具が一定間隔で自動で打つ作業）のロジック
// 画面（Canvas）の描画とマウスは workview.js。ここは DOM を触らない（シミュレーションからも使う）
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  const W = cfg.WORK;
  const sys = Game.systems;
  const PRE = cfg.PRECEPTS;

  const work = {};
  // いま画面に出している作業（'rice' / 'mine' / null）。画面側が毎フレーム決める（セーブしない）
  work.displayed = null;

  const RESOURCE = { rice: 'rice', mine: 'gold' };
  const TOOL_KEY = { rice: 'sickle', mine: 'pickaxe' };

  work.mineUnlocked = function (s) {
    return sys.preceptLevel(s, 'kinzan') > 0;
  };

  // ---- 道具（鎌・ツルハシ。代ごとにリセット）----

  work.toolList = function (kind) {
    return kind === 'rice' ? W.SICKLES : W.PICKAXES;
  };

  work.toolNames = function (kind) {
    return kind === 'rice' ? Game.data.SICKLE_NAMES : Game.data.PICKAXE_NAMES;
  };

  work.toolIndex = function (s, kind) {
    return s.work[TOOL_KEY[kind]];
  };

  work.tool = function (s, kind) {
    return work.toolList(kind)[work.toolIndex(s, kind)];
  };

  // 次に新調できる道具の番号（もう最高なら -1）
  work.nextToolIndex = function (s, kind) {
    const i = work.toolIndex(s, kind) + 1;
    return i < work.toolList(kind).length ? i : -1;
  };

  work.canBuyTool = function (s, kind) {
    const i = work.nextToolIndex(s, kind);
    if (s.succession || i < 0 || (kind === 'mine' && !work.mineUnlocked(s))) return false;
    return s.resources.gold >= work.toolList(kind)[i].price;
  };

  work.buyTool = function (s, kind) {
    if (!work.canBuyTool(s, kind)) return false;
    const i = work.nextToolIndex(s, kind);
    s.resources.gold -= work.toolList(kind)[i].price;
    s.work[TOOL_KEY[kind]] = i;
    return true;
  };

  // 名工の伝手：代の開始時の道具の番号
  work.startToolIndex = function (s, kind) {
    const lv = sys.preceptLevel(s, 'meikou') * PRE.meikou.toolTier;
    return Math.min(work.toolList(kind).length - 1, lv);
  };

  // ---- 得られる量 ----
  // 稲穂・岩は「量の単位」を持つ（黄金の穂なら 3、金の鉱脈なら 20）。
  // 1単位あたり = (基本 × その資源にかかる倍率 ＋ その資源の毎秒生産量 × 一定割合) × 深さの倍率
  // （毎秒生産量の分は、後半でも意味があるように。深さの倍率は金山の岩だけ）
  work.valuePerUnit = function (s, kind, depthMult) {
    const res = RESOURCE[kind];
    const c = kind === 'rice' ? W.RICE : W.MINE;
    let v = (c.BASE * sys.resourceMultiplier(s, res) + c.RATE_SHARE * sys.rates(s)[res]) * (depthMult || 1);
    if (kind === 'mine') v *= 1 + sys.preceptLevel(s, 'koumyaku') * PRE.koumyaku.gold; // 鉱脈探し
    return v;
  };

  // 資源を加える（シミュレーションが集計のために差し替えられるよう、ここを通す）
  work.gain = function (s, kind, amount) {
    if (kind === 'rice') sys.gainRice(s, amount);
    else s.resources.gold += amount;
  };

  // ---- 自動で進む割合 ----
  // 画面に出している方は手作業だけ。ほかは
  //   金山の解放後、切り替えで選んでいない方：手作業の稼ぎの 30%
  //   人足：手作業の稼ぎの 20% / Lv（内政タブ以外を開いていても進む）
  work.autoRatio = function (s, kind) {
    if (kind === 'mine' && !work.mineUnlocked(s)) return 0;
    if (work.displayed === kind) return 0;
    let r = sys.preceptLevel(s, 'ninsoku') * PRE.ninsoku.auto;
    if (work.mineUnlocked(s) && s.work.view !== kind) r += W.UNSEEN_RATIO;
    return r;
  };

  // 自動で入る量（毎秒）
  work.autoIncome = function (s, kind) {
    const r = work.autoRatio(s, kind);
    const m = s.work.manualRate[kind];
    return r > 0 && m > 0 ? m * r * work.valuePerUnit(s, kind) : 0;
  };

  // ゲームの時間経過（systems.tick から呼ぶ）：自動の稼ぎと発破のクールダウン
  work.tick = function (s, dt) {
    s.work.blastCd = Math.max(0, s.work.blastCd - dt);
    ['rice', 'mine'].forEach(function (kind) {
      const v = work.autoIncome(s, kind);
      if (v > 0) work.gain(s, kind, v * dt);
    });
  };

  // 新しい代の始まり：道具・深さ・手作業の記録をリセット（坑道の記録・名工の伝手を反映）
  work.newGeneration = function (s) {
    const w = s.work;
    w.lastMaxDepth = w.maxDepth;
    w.depth = Math.floor(w.lastMaxDepth * sys.preceptLevel(s, 'koudou') * PRE.koudou.startDepth);
    w.maxDepth = w.depth;
    w.sickle = work.startToolIndex(s, 'rice');
    w.pickaxe = work.startToolIndex(s, 'mine');
    w.manualRate = { rice: 0, mine: 0 };
    w.blastCd = 0;
  };

  // ---- 作業画面（田んぼ・金山）の中身 ----
  // 画面ごとに1つ作る。稲穂・岩・跳ねている資源・数字のポップアップを持つ（セーブしない）

  work.createField = function (s, kind) {
    const f = {
      kind: kind, items: [], drops: [], pops: [],
      spawnTimer: 0, hitTimer: 0, strikeFlash: 0, nextId: 1,
      cursor: { x: W.WIDTH / 2, y: W.HEIGHT / 2, inside: false },
      windowTime: 0, windowUnits: 0, // 手作業の稼ぎを1秒ごとに測る
    };
    if (kind === 'mine') {
      for (let r = 0; r < W.MINE.ROWS; r++) addRockRow(s, f, r);
    }
    return f;
  };

  // ---- 稲刈り ----

  work.spawnRate = function (s) {
    return W.RICE.SPAWN_PER_SECOND * (1 + s.facilities.field * W.RICE.SPAWN_PER_FIELD_LEVEL) *
      (1 + sys.preceptLevel(s, 'hosaku') * PRE.hosaku.spawn);
  };

  work.bumperChance = function (s) {
    return W.RICE.BUMPER_CHANCE * (1 + sys.preceptLevel(s, 'hosaku') * PRE.hosaku.bumper);
  };

  // 稲穂の実り：0 青い穂 / 1 黄色い穂 / 2 黄金の穂 / 3 枯れた（消える）。豊作の穂は 'bumper'
  work.earStage = function (ear) {
    const R = W.RICE;
    if (ear.bumper) return ear.age < R.BUMPER_SECONDS ? 'bumper' : 3;
    if (ear.age < R.GREEN_SECONDS) return 0;
    if (ear.age < R.GREEN_SECONDS + R.YELLOW_SECONDS) return 1;
    if (ear.age < R.GREEN_SECONDS + R.YELLOW_SECONDS + R.GOLDEN_SECONDS) return 2;
    return 3;
  };

  function earUnits(ear) {
    const st = work.earStage(ear);
    return st === 'bumper' ? W.RICE.BUMPER_MULT : W.RICE.STAGE_MULTS[Math.min(2, st)];
  }

  function spawnEar(s, f) {
    const R = W.RICE;
    // 何か所か試して、ほかの稲穂から一番離れた場所に生やす（重なりすぎないように）
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 4; i++) {
      const x = R.MARGIN_X + Math.random() * (W.WIDTH - R.MARGIN_X * 2);
      const y = R.MARGIN_TOP + Math.random() * (W.HEIGHT - R.MARGIN_TOP - R.MARGIN_BOTTOM);
      let d = Infinity;
      f.items.forEach(function (e) { d = Math.min(d, (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y)); });
      if (d > bestD) { bestD = d; best = { x: x, y: y }; }
    }
    const bumper = Math.random() < work.bumperChance(s);
    f.items.push({ id: f.nextId++, x: best.x, y: best.y, age: 0, bumper: bumper, hp: bumper ? R.BUMPER_HP : R.HP });
  }

  function tickEars(s, f, dt) {
    f.items.forEach(function (e) { e.age += dt; });
    f.items = f.items.filter(function (e) { return work.earStage(e) !== 3; });
    f.spawnTimer += dt * work.spawnRate(s);
    while (f.spawnTimer >= 1) {
      f.spawnTimer -= 1;
      if (f.items.length < W.MAX_ITEMS) spawnEar(s, f);
    }
  }

  // ---- 金山 ----
  // 坑道を真下へ掘る。岩は COLS × ROWS のます目。一番上の段を全部砕くと1段（1間）深くなる

  work.cellWidth = function () { return W.WIDTH / W.MINE.COLS; };
  work.cellHeight = function () { return W.HEIGHT / W.MINE.ROWS; };

  work.veinChance = function (s) {
    return W.MINE.VEIN_CHANCE * (1 + sys.preceptLevel(s, 'koumyaku') * PRE.koumyaku.vein);
  };

  // 深さ d の岩：深さ10ごとに 硬さ ×HARD_GROWTH、金 ×GOLD_GROWTH
  work.rockHp = function (depth) {
    return W.MINE.HP * Math.pow(W.MINE.HARD_GROWTH, depth / W.MINE.DEPTH_STEP);
  };
  work.rockUnits = function (depth) {
    return Math.pow(W.MINE.GOLD_GROWTH, depth / W.MINE.DEPTH_STEP);
  };

  function addRockRow(s, f, row) {
    const depth = s.work.depth + row;
    const cw = work.cellWidth();
    const ch = work.cellHeight();
    for (let c = 0; c < W.MINE.COLS; c++) {
      const vein = Math.random() < work.veinChance(s);
      const hp = work.rockHp(depth);
      f.items.push({
        id: f.nextId++, row: row, col: c, x: c * cw, y: row * ch, w: cw, h: ch,
        depth: depth, hp: hp, maxHp: hp, vein: vein,
        units: vein ? W.MINE.VEIN_MULT : 1, depthMult: work.rockUnits(depth),
      });
    }
  }

  // 一番上の段が空になったら、全体を1段上げて下に新しい段を足す
  function descend(s, f) {
    while (!f.items.some(function (r) { return r.row === 0; })) {
      s.work.depth++;
      s.work.maxDepth = Math.max(s.work.maxDepth, s.work.depth);
      const ch = work.cellHeight();
      f.items.forEach(function (r) { r.row--; r.y -= ch; });
      addRockRow(s, f, W.MINE.ROWS - 1);
    }
  }

  // 発破：上の2段をまとめて砕く。費用は「今の深さの岩 COST_ROCKS 個分の金」
  work.blastCost = function (s) {
    return W.BLAST.COST_ROCKS * work.valuePerUnit(s, 'mine', work.rockUnits(s.work.depth));
  };

  work.canBlast = function (s) {
    return work.mineUnlocked(s) && !s.succession && s.work.blastCd <= 0 && s.resources.gold >= work.blastCost(s);
  };

  work.blast = function (s, f) {
    if (f.kind !== 'mine' || !work.canBlast(s)) return false;
    s.resources.gold -= work.blastCost(s);
    s.work.blastCd = W.BLAST.COOLDOWN;
    // 発破の分は手作業の記録に数えない（自動の割合が膨らまないように）
    f.items.filter(function (r) { return r.row < W.BLAST.ROWS; }).forEach(function (r) { breakItem(s, f, r, false); });
    descend(s, f);
    f.strikeFlash = 0.4;
    return true;
  };

  // ---- 打つ・砕く ----

  function inRange(f, item, radius) {
    const cx = f.cursor.x;
    const cy = f.cursor.y;
    if (f.kind === 'rice') {
      const r = radius + W.RICE.HIT_PAD;
      return (item.x - cx) * (item.x - cx) + (item.y - cy) * (item.y - cy) <= r * r;
    }
    // 岩：円と四角が重なっているか
    const nx = Math.max(item.x, Math.min(cx, item.x + item.w));
    const ny = Math.max(item.y, Math.min(cy, item.y + item.h));
    return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) <= radius * radius;
  }

  function breakItem(s, f, item, manual) {
    const units = f.kind === 'rice' ? earUnits(item) : item.units;
    f.items.splice(f.items.indexOf(item), 1);
    const depthMult = item.depthMult || 1;
    // 手作業の記録は、深さの分も含めた量の単位で数える（自動の稼ぎは、これに深さ0の1単位あたりをかける）
    if (manual) f.windowUnits += units * depthMult;
    const x = f.kind === 'rice' ? item.x : item.x + item.w / 2;
    const y = f.kind === 'rice' ? item.y : item.y + item.h / 2;
    const drop = { x: x, y: y, t: 0, units: units, depthMult: depthMult, big: f.kind === 'rice' ? item.bumper : item.vein };
    if (f.drops.length < W.MAX_DROPS) f.drops.push(drop);
    else land(s, f, drop); // 跳ねている資源が多すぎるときは、すぐ加える
  }

  function strike(s, f) {
    const tool = work.tool(s, f.kind);
    f.items.filter(function (it) { return inRange(f, it, tool.radius); }).forEach(function (it) {
      it.hp -= tool.power;
      if (it.hp <= 0) breakItem(s, f, it, true);
    });
    if (f.kind === 'mine') descend(s, f);
    f.strikeFlash = 0.15;
  }

  // 跳ね終わった資源を加え、数字を出す
  function land(s, f, d) {
    const amount = d.units * work.valuePerUnit(s, f.kind, d.depthMult);
    work.gain(s, f.kind, amount);
    if (f.pops.length >= W.MAX_POPS) f.pops.shift();
    f.pops.push({ x: d.x, y: d.y - 10, t: 0, text: '+' + Game.format.num(amount), big: d.big });
  }

  // 画面を閉じるとき：跳ねている資源をすぐ加える（取りこぼさないように）
  work.flush = function (s, f) {
    f.drops.forEach(function (d) { land(s, f, d); });
    f.drops = [];
    f.pops = [];
  };

  // 手作業の稼ぎ（1秒あたりの量の単位）を、カーソルを乗せている間だけ測る
  function measure(s, f, dt) {
    if (!f.cursor.inside) return;
    f.windowTime += dt;
    if (f.windowTime < 1) return;
    const now = f.windowUnits / f.windowTime;
    const rate = s.work.manualRate;
    rate[f.kind] = rate[f.kind] > 0 ? rate[f.kind] + (now - rate[f.kind]) * W.RATE_SMOOTHING : now;
    f.windowTime = 0;
    f.windowUnits = 0;
  }

  // 作業画面を dt 秒進める（画面に出しているときだけ呼ぶ）
  work.tickField = function (s, f, dt) {
    if (s.succession) return;
    f.drops = f.drops.filter(function (d) {
      d.t += dt;
      if (d.t < W.DROP_SECONDS) return true;
      land(s, f, d);
      return false;
    });
    f.pops = f.pops.filter(function (p) { p.t += dt; return p.t < W.POP_SECONDS; });
    f.strikeFlash = Math.max(0, f.strikeFlash - dt);
    if (f.kind === 'rice') tickEars(s, f, dt);

    const interval = 1 / work.tool(s, f.kind).speed;
    if (f.cursor.inside) {
      f.hitTimer -= dt;
      while (f.hitTimer <= 0) {
        strike(s, f);
        f.hitTimer += interval;
      }
    } else {
      f.hitTimer = Math.max(0, f.hitTimer - dt); // 乗せたらすぐ打てるように
    }
    measure(s, f, dt);
  };

  Game.work = work;
})();

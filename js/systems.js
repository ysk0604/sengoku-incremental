// 生産・建設などのロジック（DOM には触らない）
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  const FAC = cfg.FACILITIES;

  const sys = {};

  // ---- 倍率 ----

  // 全体倍率 = 家格 × 城郭 × 内政担当 × 家宝 × 当主特性
  sys.globalMultiplier = function (s) {
    return sys.prestigeMultiplier(s) * sys.castleMultiplier(s) * sys.domesticMultiplier(s) *
      sys.heirloomEffect(s, 'production') * sys.traitEffect(s, 'production');
  };

  // 家格倍率 = (1 + 累計家格 × 0.1) × 天下の宝冠
  sys.prestigeMultiplierFor = function (s, prestige) {
    return (1 + prestige * cfg.PRESTIGE.MULT_PER_POINT) * sys.heirloomEffect(s, 'prestigeMult');
  };

  sys.prestigeMultiplier = function (s) {
    return sys.prestigeMultiplierFor(s, s.prestige);
  };

  // ---- 当主の特性（格つき）----

  // 1つの特性の効果。key: production / power / prestige（倍率）、cost（倍率）、startField（Lv）
  sys.singleTraitEffect = function (id, grade, key) {
    const t = cfg.TRAITS[id];
    const mult = cfg.TRAIT_GRADE.MULTS[grade - 1];
    switch (key) {
      case 'production':
      case 'power':
      case 'prestige':
        return t[key] ? 1 + t[key] * mult : 1;
      case 'cost':
        return t.cost ? Math.pow(t.cost, grade) : 1;
      case 'startField':
        return t.startFieldByGrade ? t.startFieldByGrade[grade - 1] : 0;
    }
    return key === 'startField' ? 0 : 1;
  };

  // 当主の特性の効果（2つあれば倍率は掛け合わせ、田畑Lvは高い方）
  sys.traitsEffect = function (traits, key) {
    let v = key === 'startField' ? 0 : 1;
    traits.forEach(function (t) {
      const e = sys.singleTraitEffect(t.id, t.grade, key);
      if (key === 'startField') v = Math.max(v, e);
      else v *= e;
    });
    return v;
  };

  sys.traitEffect = function (s, key) {
    return sys.traitsEffect(s.lord.traits, key);
  };

  // 特性の効果の説明（例：「全生産 +120%」）
  sys.traitDesc = function (id, grade) {
    const parts = [];
    const pctText = function (m) { return '+' + Math.round((m - 1) * 100) + '%'; };
    const p = sys.singleTraitEffect(id, grade, 'production');
    const w = sys.singleTraitEffect(id, grade, 'power');
    const r = sys.singleTraitEffect(id, grade, 'prestige');
    const c = sys.singleTraitEffect(id, grade, 'cost');
    const f = sys.singleTraitEffect(id, grade, 'startField');
    if (p !== 1) parts.push('全生産 ' + pctText(p));
    if (w !== 1) parts.push('戦力 ' + pctText(w));
    if (r !== 1) parts.push('隠居時に得る家格 ' + pctText(r));
    if (c !== 1) parts.push('施設コスト -' + Math.round((1 - c) * 100) + '%');
    if (f) parts.push('代の開始時に田畑 Lv' + f);
    return parts.join('、');
  };

  // ---- 家宝 ----
  sys.hasHeirloom = function (s, id) {
    return s.heirlooms.indexOf(id) >= 0;
  };

  // 持っている家宝の、その効果の倍率を掛け合わせる（無ければ 1）
  sys.heirloomEffect = function (s, key) {
    let m = 1;
    s.heirlooms.forEach(function (id) {
      const e = cfg.HEIRLOOMS[id];
      if (e && typeof e[key] === 'number') m *= e[key];
    });
    return m;
  };

  // 城郭：全生産 ×1.25^Lv
  sys.castleMultiplier = function (s) {
    return Math.pow(FAC.castle.effect, s.facilities.castle);
  };

  // 城の見た目の段階（0 砦 / 1 平城 / 2 天守 / 3 巨大城郭）
  sys.castleLook = function (s) {
    let look = 0;
    cfg.CASTLE_LOOK_LEVELS.forEach(function (lv, i) {
      if (s.facilities.castle >= lv) look = i;
    });
    return look;
  };

  // 施設コストの倍率（倹約型で下がる）
  sys.costMultiplier = function (s) {
    return sys.traitEffect(s, 'cost');
  };

  // 節目ボーナス：到達した節目ごとに ×MILESTONE_MULT
  sys.milestoneMultiplier = function (level) {
    let m = 1;
    cfg.MILESTONE_LEVELS.forEach(function (lv) {
      if (level >= lv) m *= cfg.MILESTONE_MULT;
    });
    return m;
  };

  sys.nextMilestone = function (level) {
    for (let i = 0; i < cfg.MILESTONE_LEVELS.length; i++) {
      if (level < cfg.MILESTONE_LEVELS[i]) return cfg.MILESTONE_LEVELS[i];
    }
    return null;
  };

  // ---- 施設 ----

  sys.isUnlocked = function (s, id) {
    const u = FAC[id].unlock;
    if (!u) return true;
    if (u.flag) return !!s.flags[u.flag];
    return s.facilities[u.facility] >= u.level;
  };

  // 1レベルあたりの生産量（節目・全体倍率込み）
  sys.productionPerLevel = function (s, id) {
    const f = FAC[id];
    if (!f.produces) return 0;
    const ms = f.milestone ? sys.milestoneMultiplier(s.facilities[id]) : 1;
    return f.effect * ms * sys.globalMultiplier(s);
  };

  sys.production = function (s, id) {
    return s.facilities[id] * sys.productionPerLevel(s, id);
  };

  // 資源ごとの毎秒生産量
  sys.rates = function (s) {
    const r = { rice: 0, gold: 0, troops: 0 };
    Object.keys(FAC).forEach(function (id) {
      const res = FAC[id].produces;
      if (res) r[res] += sys.production(s, id);
    });
    r.rice += sys.territoryRice(s);
    return r;
  };

  // count レベル分の建設費（等比数列の和）
  sys.cost = function (s, id, count) {
    const f = FAC[id];
    const lv = s.facilities[id];
    const g = f.growth;
    const factor = Math.pow(g, lv) * (Math.pow(g, count) - 1) / (g - 1) * sys.costMultiplier(s);
    const out = {};
    Object.keys(f.costBase).forEach(function (res) {
      out[res] = f.costBase[res] * factor;
    });
    return out;
  };

  sys.canAfford = function (s, cost) {
    return Object.keys(cost).every(function (res) {
      return s.resources[res] >= cost[res];
    });
  };

  // 今の資源で何レベル建てられるか
  sys.maxAffordable = function (s, id) {
    const f = FAC[id];
    const g = f.growth;
    const first = Math.pow(g, s.facilities[id]) * sys.costMultiplier(s);
    let n = Infinity;
    Object.keys(f.costBase).forEach(function (res) {
      const c0 = f.costBase[res] * first;
      const k = Math.floor(Math.log(s.resources[res] * (g - 1) / c0 + 1) / Math.log(g));
      n = Math.min(n, k);
    });
    if (!isFinite(n) || n < 0) n = 0;
    // 浮動小数の誤差対策
    while (n > 0 && !sys.canAfford(s, sys.cost(s, id, n))) n--;
    while (sys.canAfford(s, sys.cost(s, id, n + 1))) n++;
    return n;
  };

  // 一括購入の設定から、実際に建てようとする数を決める
  sys.bulkCount = function (s, id) {
    const opt = cfg.BULK_OPTIONS.find(function (o) { return o.key === s.settings.bulk; }) || cfg.BULK_OPTIONS[0];
    if (opt.count === Infinity) return Math.max(1, sys.maxAffordable(s, id));
    return opt.count;
  };

  sys.build = function (s, id) {
    if (!sys.isUnlocked(s, id)) return false;
    const count = sys.bulkCount(s, id);
    const cost = sys.cost(s, id, count);
    if (!sys.canAfford(s, cost)) return false;
    Object.keys(cost).forEach(function (res) {
      s.resources[res] = Math.max(0, s.resources[res] - cost[res]);
    });
    s.facilities[id] += count;
    return true;
  };

  // ---- 戦力 ----
  // 兵 × (1 + 鍛冶場Lv × 0.1) × √全体倍率（武将補正はステップ2以降）
  sys.smithyMultiplier = function (s) {
    return 1 + s.facilities.smithy * FAC.smithy.effect;
  };

  // ヘッダー表示用：待機兵の戦力（武将なし）
  sys.power = function (s) {
    return sys.troopPower(s, s.resources.troops, null);
  };

  // ---- 武将 ----
  const GEN = cfg.GENERALS;

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  sys.recruitCost = function (s) {
    return { gold: GEN.RECRUIT_BASE_COST * Math.pow(GEN.RECRUIT_GROWTH, s.recruitCount) };
  };

  sys.rollRarity = function () {
    const total = GEN.RARITIES.reduce(function (sum, r) { return sum + r.weight; }, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < GEN.RARITIES.length; i++) {
      roll -= GEN.RARITIES[i].weight;
      if (roll < 0) return GEN.RARITIES[i];
    }
    return GEN.RARITIES[0];
  };

  sys.generateGeneral = function (s) {
    const rarity = sys.rollRarity();
    const stats = {};
    Game.data.STATS.forEach(function (st) {
      stats[st.id] = randInt(GEN.STAT_MIN, GEN.STAT_MAX - rarity.bonus) + rarity.bonus;
    });
    return {
      id: s.nextGeneralId++,
      surname: pick(Game.data.SURNAMES),
      givenName: pick(Game.data.GIVEN_NAMES),
      epithet: rarity.epithet ? pick(Game.data.EPITHETS) : '',
      rarity: rarity.id,
      stats: stats,
      portrait: randInt(1, GEN.PORTRAIT_COUNT),
      assignment: 'idle',
    };
  };

  // 登用に成功したらその武将を返す
  sys.recruit = function (s) {
    const cost = sys.recruitCost(s);
    if (!sys.canAfford(s, cost)) return null;
    s.resources.gold = Math.max(0, s.resources.gold - cost.gold);
    s.recruitCount++;
    const g = sys.generateGeneral(s);
    s.generals.push(g);
    return g;
  };

  sys.assign = function (s, generalId, assignment) {
    const g = s.generals.find(function (x) { return x.id === generalId; });
    if (!g || sys.isGeneralDeployed(s, generalId)) return false; // 出陣中は配置を変えられない
    g.assignment = assignment;
    return true;
  };

  // 軍団長の方面（目指す敵城。'' はおまかせ＝近い城から）
  sys.setFront = function (s, generalId, castleId) {
    const g = s.generals.find(function (x) { return x.id === generalId; });
    if (!g) return false;
    g.front = castleId;
    return true;
  };

  // 城代の担当の自領
  sys.setPost = function (s, generalId, nodeId) {
    const g = s.generals.find(function (x) { return x.id === generalId; });
    if (!g || (nodeId && !sys.isOwned(s, nodeId))) return false;
    g.post = nodeId;
    return true;
  };

  // その自領を守る城代
  sys.castellansAt = function (s, nodeId) {
    return s.generals.filter(function (g) { return g.assignment === 'castellan' && g.post === nodeId; });
  };

  // 城代の補正 = 1 + Σ(統率 × 2%)
  sys.castellanMultiplier = function (s, nodeId) {
    let bonus = 0;
    sys.castellansAt(s, nodeId).forEach(function (g) {
      bonus += g.stats.leadership * GEN.CASTELLAN_PER_LEADERSHIP;
    });
    return 1 + bonus;
  };

  // 内政担当の補正 = 1 + Σ(政治 × 1%)
  sys.domesticMultiplier = function (s) {
    let bonus = 0;
    s.generals.forEach(function (g) {
      if (g.assignment === 'domestic') bonus += g.stats.politics * GEN.DOMESTIC_PER_POLITICS;
    });
    return 1 + bonus;
  };

  // ---- 地図 ----
  const MAP = cfg.MAP;

  sys.stageData = function (s) {
    return Game.data.STAGES[s.map.stage - 1];
  };

  // 拠点の一覧（本拠地＋敵城、座標つき）
  sys.mapNodes = function (s) {
    const stage = sys.stageData(s);
    const pos = stage.map.positions;
    const nodes = [{ id: 'home', name: Game.data.HOME_NAME, troops: 0, home: true, x: pos.home.x, y: pos.home.y }];
    stage.castles.forEach(function (c) {
      nodes.push({ id: c.id, name: c.name, troops: c.troops, boss: !!c.boss, x: pos[c.id].x, y: pos[c.id].y });
    });
    return nodes;
  };

  sys.node = function (s, id) {
    return sys.mapNodes(s).find(function (n) { return n.id === id; });
  };

  sys.neighbors = function (s, id) {
    const out = [];
    sys.stageData(s).map.roads.forEach(function (r) {
      if (r[0] === id) out.push(r[1]);
      else if (r[1] === id) out.push(r[0]);
    });
    return out;
  };

  sys.isOwned = function (s, id) {
    return s.map.owned.indexOf(id) >= 0;
  };

  // 霧：自領と、自領に街道でつながる拠点だけが見える（旧領は前の代に落とした城なので見える）
  sys.isVisible = function (s, id) {
    if (sys.isOwned(s, id) || sys.isFormerLand(s, id)) return true;
    return sys.neighbors(s, id).some(function (n) { return sys.isOwned(s, n); });
  };

  // 進軍先にできるのは、出発地（自領）と街道でつながっている拠点だけ
  // 敵城なら攻撃、自領なら補充（着いたらその城の守備兵になる）
  sys.canTarget = function (s, from, to) {
    return from !== to && sys.isOwned(s, from) && sys.neighbors(s, from).indexOf(to) >= 0;
  };

  sys.isReinforce = function (s, from, to) {
    return sys.canTarget(s, from, to) && sys.isOwned(s, to);
  };

  sys.travelTime = function (s, from, to) {
    const a = sys.node(s, from);
    const b = sys.node(s, to);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.min(MAP.TRAVEL_MAX_SECONDS, Math.max(MAP.TRAVEL_MIN_SECONDS, len / MAP.TRAVEL_SPEED));
  };

  // ---- 部隊 ----

  sys.maxUnits = function (s) {
    const commanders = s.generals.filter(function (g) { return g.assignment === 'commander'; }).length;
    return MAP.BASE_UNITS + commanders;
  };

  // 部隊を率いている武将か
  sys.isGeneralDeployed = function (s, generalId) {
    return s.units.some(function (u) { return u.generalId === generalId; });
  };

  // 部隊につけられる武将（待機中で、まだ出陣していない）
  sys.availableLeaders = function (s) {
    return s.generals.filter(function (g) {
      return g.assignment === 'idle' && !sys.isGeneralDeployed(s, g.id);
    });
  };

  sys.leaderMultiplier = function (s, generalId) {
    const g = s.generals.find(function (x) { return x.id === generalId; });
    return g ? 1 + g.stats.leadership * MAP.LEADER_PER_LEADERSHIP : 1;
  };

  // 戦力 = 兵数 × 鍛冶場 × 武将補正 × √全体倍率 × 家宝 × 当主特性（家訓はステップ4c）
  sys.troopPower = function (s, troops, generalId) {
    return troops * sys.smithyMultiplier(s) * sys.leaderMultiplier(s, generalId) *
      Math.sqrt(sys.globalMultiplier(s)) * sys.heirloomEffect(s, 'power') * sys.traitEffect(s, 'power');
  };

  sys.unitPower = function (s, unit) {
    return sys.troopPower(s, unit.troops, unit.generalId);
  };

  // ---- 兵の置き場所 ----
  // 本拠地の兵 = 待機兵（resources.troops）、ほかの自領の兵 = その城の守備兵

  sys.troopsAt = function (s, id) {
    if (id === 'home') return s.resources.troops;
    return s.map.garrisons[id] || 0;
  };

  sys.addTroopsAt = function (s, id, amount) {
    if (id === 'home' || !sys.isOwned(s, id)) {
      s.resources.troops = Math.max(0, s.resources.troops + amount); // 戻り先の城を失っていたら本拠地へ
    } else {
      s.map.garrisons[id] = Math.max(0, (s.map.garrisons[id] || 0) + amount);
    }
  };

  // 自軍の総兵力（待機兵＋各城の守備兵＋出陣中の部隊）
  sys.totalTroops = function (s) {
    let t = s.resources.troops;
    Object.keys(s.map.garrisons).forEach(function (id) { t += s.map.garrisons[id]; });
    s.units.forEach(function (u) { t += u.troops; });
    return t;
  };

  // 出陣できない理由（出陣できるなら null）
  sys.dispatchError = function (s, from, to, troops, generalId) {
    if (s.units.length >= sys.maxUnits(s)) return '同時に動かせる部隊は' + sys.maxUnits(s) + 'つまで';
    if (!sys.canTarget(s, from, to)) return 'そこへは進軍できない';
    if (!(troops >= MAP.MIN_UNIT_TROOPS)) return '兵が足りない';
    if (troops > sys.troopsAt(s, from)) return from === 'home' ? '待機兵が足りない' : '守備兵が足りない';
    if (generalId !== null && !sys.availableLeaders(s).some(function (g) { return g.id === generalId; })) {
      return 'その武将は出陣できない';
    }
    return null;
  };

  sys.dispatch = function (s, from, to, troops, generalId) {
    if (sys.dispatchError(s, from, to, troops, generalId)) return null;
    sys.addTroopsAt(s, from, -troops);
    const unit = {
      id: s.nextUnitId++,
      from: from,
      to: to,
      base: from,          // 退却・引き返しで戻る拠点
      troops: troops,
      startTroops: troops, // 合戦が始まったときの兵数（損害の集計用）
      generalId: generalId,
      state: 'marching',   // marching / returning / sieging（攻城戦） / field（野戦）
      elapsed: 0,
      duration: sys.travelTime(s, from, to),
      fieldWith: null,     // 野戦の相手（侵攻軍ID）
      pursuit: 0,          // 退却中に追撃を受ける残り秒数
      pursuitFrom: null,   // 追撃してくる敵城
      pursuitInvasion: null, // 追撃してくる侵攻軍
    };
    s.units.push(unit);
    return unit;
  };

  // 引き返す（進軍中）／退却（攻城戦・野戦の最中）：今いる位置から出発地へ戻る
  sys.retreat = function (s, unitId) {
    const u = s.units.find(function (x) { return x.id === unitId; });
    if (!u || u.state === 'returning') return false;
    const state = u.state;
    const from = u.from;
    u.from = u.to;
    u.to = from;
    u.elapsed = state === 'sieging' ? 0 : u.duration - u.elapsed;
    u.state = 'returning';
    if (state === 'sieging') {
      u.pursuit = cfg.BATTLE.RETREAT_PURSUIT_SECONDS;
      u.pursuitFrom = u.from;
    } else if (state === 'field') {
      u.pursuit = cfg.BATTLE.RETREAT_PURSUIT_SECONDS;
      u.pursuitInvasion = u.fieldWith;
      u.fieldWith = null;
    }
    return true;
  };

  // 部隊・侵攻軍の現在位置（地図座標）
  sys.unitPosition = function (s, u) {
    const a = sys.node(s, u.from);
    const b = sys.node(s, u.to);
    const t = u.state === 'sieging' ? 1 : Math.min(1, u.elapsed / u.duration);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // ---- 合戦（攻城戦・防衛戦・野戦）----
  // kind: 'siege'   攻城戦：自軍の部隊 vs 敵城の守備兵
  //       'defense' 防衛戦：自領の守備兵 vs 侵攻軍
  //       'field'   野戦  ：自軍の部隊 vs 侵攻軍（街道の上）
  const BAT = cfg.BATTLE;
  const INV = cfg.INVASION;

  // UI に知らせる出来事（勝敗など）。セーブしない
  sys.events = [];
  let pendingStageClear = false; // ボスを倒した：合戦の片付けのあとで段階を進める

  sys.castleData = function (s, id) {
    return sys.stageData(s).castles.find(function (c) { return c.id === id; });
  };

  // 旧領（前の代までに落とした城）か
  sys.isFormerLand = function (s, id) {
    return s.formerLands.indexOf(id) >= 0;
  };

  // 敵城の満員の守備兵（旧領は 1/10）
  sys.castleMaxTroops = function (s, id) {
    const t = sys.castleData(s, id).troops;
    return sys.isFormerLand(s, id) ? t * cfg.LORD.FORMER_LAND_RATE : t;
  };

  // 敵城の今の守備兵（減っていなければ満員）
  sys.enemyTroops = function (s, id) {
    const v = s.map.enemyTroops[id];
    return typeof v === 'number' ? v : sys.castleMaxTroops(s, id);
  };

  sys.defenseMultiplier = function (s, id) {
    return sys.castleData(s, id).boss ? BAT.BOSS_DEFENSE_MULT : BAT.DEFENSE_MULT;
  };

  // 敵の守備戦力 = 守備兵 × 城の防御補正
  sys.enemyPower = function (s, id) {
    return sys.enemyTroops(s, id) * sys.defenseMultiplier(s, id);
  };

  // 自領の守備戦力 = 守備兵の戦力 × (1 + 城郭Lv × 0.2) × 城代の補正
  sys.garrisonPower = function (s, id) {
    return sys.troopPower(s, sys.troopsAt(s, id), null) *
      (1 + s.facilities.castle * INV.DEFENSE_PER_CASTLE_LEVEL) * sys.castellanMultiplier(s, id);
  };

  // 段階をまたいで城を探す
  sys.castleById = function (id) {
    for (let i = 0; i < Game.data.STAGES.length; i++) {
      const c = Game.data.STAGES[i].castles.find(function (x) { return x.id === id; });
      if (c) return c;
    }
    return null;
  };

  sys.invasion = function (s, id) {
    return s.invasions.find(function (v) { return v.id === id; }) || null;
  };

  sys.battleByKey = function (s, key) {
    return s.battles.find(function (b) { return b.key === key; }) || null;
  };

  // その敵城で攻城戦をしているか
  sys.battleAt = function (s, castleId) {
    return sys.battleByKey(s, 'siege:' + castleId);
  };

  // 戦いに加わっている自軍の部隊（防衛戦は守備兵が戦うので空）
  sys.battleUnits = function (s, b) {
    if (b.kind === 'siege') {
      return s.units.filter(function (u) { return u.state === 'sieging' && u.to === b.castleId; });
    }
    if (b.kind === 'field') {
      return s.units.filter(function (u) { return u.state === 'field' && u.fieldWith === b.invasionId; });
    }
    return [];
  };

  function startBattle(s, kind, ref) {
    const key = kind + ':' + ref;
    let b = sys.battleByKey(s, key);
    if (!b) {
      b = {
        key: key, kind: kind,
        castleId: kind === 'siege' ? ref : null,
        invasionId: kind === 'siege' ? null : ref,
        elapsed: 0, chargeLeft: 0, rallyLeft: 0, cdCharge: 0, cdRally: 0, cdAmbush: 0,
      };
      s.battles.push(b);
    }
    return b;
  }

  // 両軍の兵数と戦力
  sys.battleSides = function (s, b) {
    const own = { troops: 0, power: 0, start: 0 };
    const enemy = { troops: 0, power: 0, max: 1 };
    if (b.kind === 'defense') {
      const inv = sys.invasion(s, b.invasionId);
      own.troops = sys.troopsAt(s, inv ? inv.to : 'home');
      own.power = inv ? sys.garrisonPower(s, inv.to) : 0;
      own.start = Math.max(own.troops, b.ownStart || 0);
    } else {
      sys.battleUnits(s, b).forEach(function (u) {
        own.troops += u.troops;
        own.power += sys.unitPower(s, u);
        own.start += u.startTroops;
      });
    }
    if (b.kind === 'siege') {
      if (sys.castleData(s, b.castleId).boss) own.power *= sys.heirloomEffect(s, 'bossPower'); // 名刀
      enemy.troops = sys.enemyTroops(s, b.castleId);
      enemy.power = sys.enemyPower(s, b.castleId);
      enemy.max = sys.castleMaxTroops(s, b.castleId);
    } else {
      const inv = sys.invasion(s, b.invasionId);
      if (inv) {
        enemy.troops = inv.troops;
        enemy.power = inv.troops * INV.POWER_MULT;
        enemy.max = inv.startTroops;
      }
    }
    return { own: own, enemy: enemy };
  };

  sys.battleTitle = function (s, b) {
    if (b.kind === 'siege') return sys.castleData(s, b.castleId).name;
    const inv = sys.invasion(s, b.invasionId);
    if (!inv) return '';
    if (b.kind === 'defense') return sys.node(s, inv.to).name + ' 防衛戦';
    return '野戦（' + sys.node(s, inv.from).name + 'の軍）';
  };

  function setEnemyTroops(s, b, v) {
    if (b.kind === 'siege') {
      s.map.enemyTroops[b.castleId] = Math.max(0, v);
    } else {
      const inv = sys.invasion(s, b.invasionId);
      if (inv) inv.troops = Math.max(0, v);
    }
  }

  // 損害を部隊の兵数の割合で分ける（防衛戦は守備兵から引く）
  function applyOwnLoss(s, b, loss) {
    if (b.kind === 'defense') {
      const inv = sys.invasion(s, b.invasionId);
      if (inv) sys.addTroopsAt(s, inv.to, -loss);
      return;
    }
    const units = sys.battleUnits(s, b);
    const total = units.reduce(function (sum, u) { return sum + u.troops; }, 0);
    if (total <= 0) return;
    units.forEach(function (u) {
      u.troops = Math.max(0, u.troops - loss * (u.troops / total));
    });
  }

  sys.ambushRate = function (s, b) {
    let best = 0;
    sys.battleUnits(s, b).forEach(function (u) {
      const g = s.generals.find(function (x) { return x.id === u.generalId; });
      if (g) best = Math.max(best, g.stats.intellect);
    });
    if (b.kind === 'defense') {
      // 防衛戦は、その城の城代の知略が効く
      const inv = sys.invasion(s, b.invasionId);
      if (inv) sys.castellansAt(s, inv.to).forEach(function (g) { best = Math.max(best, g.stats.intellect); });
    }
    return BAT.AMBUSH_RATE + best * BAT.AMBUSH_PER_INTELLECT;
  };

  sys.canRetreat = function (s, b) {
    return b.kind !== 'defense'; // 防衛戦は城を守る兵なので退却しない
  };

  // 采配。成功したら true
  sys.command = function (s, key, kind) {
    const b = sys.battleByKey(s, key);
    if (!b) return false;
    if (kind === 'charge' && b.cdCharge <= 0) {
      b.chargeLeft = BAT.CHARGE_SECONDS;
      b.cdCharge = BAT.CHARGE_COOLDOWN;
      return true;
    }
    if (kind === 'rally' && b.cdRally <= 0) {
      b.rallyLeft = BAT.RALLY_SECONDS;
      b.cdRally = BAT.RALLY_COOLDOWN;
      return true;
    }
    if (kind === 'ambush' && b.cdAmbush <= 0) {
      const enemy = sys.battleSides(s, b).enemy.troops;
      setEnemyTroops(s, b, enemy * (1 - Math.min(1, sys.ambushRate(s, b))));
      b.cdAmbush = BAT.AMBUSH_COOLDOWN;
      return true;
    }
    if (kind === 'retreat' && sys.canRetreat(s, b)) {
      sys.battleUnits(s, b).forEach(function (u) { sys.retreat(s, u.id); });
      return true;
    }
    return false;
  };

  // 今の勢いのまま戦ったときの、決着までの残り秒数（ランチェスターの二次法則）
  // 敵の減り方 = alpha × 自軍の兵、自軍の減り方 = beta × 敵の兵
  sys.estimateBattleSeconds = function (ownTroops, enemyTroops, alpha, beta) {
    if (ownTroops <= 0 || enemyTroops <= 0) return 0;
    if (alpha <= 0 || beta <= 0) return Infinity;
    const k = Math.sqrt(alpha * beta);
    const x = (enemyTroops * Math.sqrt(beta)) / (ownTroops * Math.sqrt(alpha));
    if (x === 1) return Infinity;
    const r = x < 1 ? x : 1 / x; // x < 1 なら自軍が勝つ、x > 1 なら自軍が全滅する
    return 0.5 * Math.log((1 + r) / (1 - r)) / k; // atanh(r) / k
  };

  function tickBattle(s, b, dt) {
    const sides = sys.battleSides(s, b);
    const charge = b.chargeLeft > 0;
    const rally = b.rallyLeft > 0;
    if (b.kind === 'defense') b.ownStart = Math.max(b.ownStart || 0, sides.own.troops);

    const dealtRate = sides.own.power * BAT.DEALT_RATE * (charge ? BAT.CHARGE_DEALT : 1);
    const takenRate = sides.enemy.power * BAT.TAKEN_RATE *
      (charge ? BAT.CHARGE_TAKEN : 1) * (rally ? BAT.RALLY_TAKEN : 1);

    // 最低の長さより早く決着しそうなら、与える損害と受ける損害を同じ割合で遅くする
    // （両方を同じ割合で遅くしても兵の減り方の道筋は同じなので、損害の合計は変わらない）
    let pace = 1;
    const required = BAT.MIN_SIEGE_SECONDS - b.elapsed;
    const ownTroops = sides.own.troops;
    const enemyTroops = sides.enemy.troops;
    if (required > 0 && ownTroops > 0 && enemyTroops > 0) {
      const remaining = sys.estimateBattleSeconds(ownTroops, enemyTroops, dealtRate / ownTroops, takenRate / enemyTroops);
      if (remaining < required) pace = remaining / required;
    }

    setEnemyTroops(s, b, enemyTroops - dealtRate * pace * dt);
    applyOwnLoss(s, b, takenRate * pace * dt);
    b.elapsed += dt;

    b.chargeLeft = Math.max(0, b.chargeLeft - dt);
    b.rallyLeft = Math.max(0, b.rallyLeft - dt);
    b.cdCharge = Math.max(0, b.cdCharge - dt);
    b.cdRally = Math.max(0, b.cdRally - dt);
    b.cdAmbush = Math.max(0, b.cdAmbush - dt);
  }

  function removeUnits(s, list) {
    s.units = s.units.filter(function (u) { return list.indexOf(u) < 0; });
  }

  function removeInvasion(s, id) {
    s.invasions = s.invasions.filter(function (v) { return v.id !== id; });
  }

  function lostOf(units) {
    return units.reduce(function (sum, u) { return sum + u.startTroops - u.troops; }, 0);
  }

  // 自領を失う（本拠地は失わず、米と金を奪われる）
  function loseTerritory(s, id, invaderLeft) {
    if (id === 'home') {
      const rice = s.resources.rice * INV.HOME_LOOT_RATE;
      const gold = s.resources.gold * INV.HOME_LOOT_RATE;
      s.resources.rice -= rice;
      s.resources.gold -= gold;
      return { rice: rice, gold: gold };
    }
    s.map.owned = s.map.owned.filter(function (x) { return x !== id; });
    delete s.map.garrisons[id];
    s.generals.forEach(function (g) { if (g.post === id) g.post = ''; }); // 城代は持ち場を失う
    // 攻め落とした侵攻軍がそのまま城の守備兵になる（満員を超えない）
    s.map.enemyTroops[id] = Math.min(sys.castleMaxTroops(s, id), Math.max(1, invaderLeft));
    return null;
  }

  function settleSiege(s, b) {
    const units = sys.battleUnits(s, b);
    const castle = sys.castleData(s, b.castleId);
    if (units.length > 0 && sys.enemyTroops(s, b.castleId) <= 0) {
      const survivors = units.reduce(function (sum, u) { return sum + u.troops; }, 0);
      const merit = castle.troops * BAT.MERIT_RATE;
      s.map.owned.push(b.castleId);
      if (s.map.won.indexOf(b.castleId) < 0) s.map.won.push(b.castleId);
      delete s.map.enemyTroops[b.castleId];
      s.map.garrisons[b.castleId] = survivors; // 残った兵はそのまま城の守備兵になる
      s.resources.merit += merit;
      s.flags.firstVictory = true;
      s.stats.battlesWon++;
      // 家宝（ボスと一部の城）。一度手に入れたら二度目はない
      let heirloom = null;
      if (castle.heirloom && !sys.hasHeirloom(s, castle.heirloom)) {
        s.heirlooms.push(castle.heirloom);
        heirloom = castle.heirloom;
      }
      sys.events.push({
        type: 'victory', name: castle.name, boss: !!castle.boss,
        survivors: survivors, lost: lostOf(units), merit: merit,
        income: castle.troops * BAT.TERRITORY_RICE_RATE * sys.globalMultiplier(s),
        heirloom: heirloom,
      });
      removeUnits(s, units);
      if (castle.boss) pendingStageClear = true; // 合戦の片付けが終わってから段階を進める
      return false;
    }
    if (units.length > 0 && units.every(function (u) { return u.troops <= 0; })) {
      sys.events.push({
        type: 'defeat', name: castle.name, boss: !!castle.boss,
        lost: lostOf(units), enemyLeft: sys.enemyTroops(s, b.castleId),
      });
      removeUnits(s, units);
      return false;
    }
    return units.length > 0; // 全員退却したら終わり
  }

  function settleField(s, b) {
    const inv = sys.invasion(s, b.invasionId);
    const units = sys.battleUnits(s, b);
    const resume = function () {
      units.forEach(function (u) { u.state = 'marching'; u.fieldWith = null; });
    };
    if (!inv) { resume(); return false; }
    const name = sys.node(s, inv.from).name + 'の軍';

    if (inv.troops <= 0) {
      const merit = inv.startTroops * INV.MERIT_RATE;
      s.resources.merit += merit;
      sys.events.push({ type: 'fieldWin', name: name, lost: lostOf(units), merit: merit, defeated: inv.startTroops });
      removeInvasion(s, inv.id);
      resume(); // 勝った部隊はそのまま目的地へ進む
      return false;
    }
    if (units.length > 0 && units.every(function (u) { return u.troops <= 0; })) {
      sys.events.push({ type: 'fieldLose', name: name, lost: lostOf(units), enemyLeft: inv.troops, target: sys.node(s, inv.to).name });
      removeUnits(s, units);
      inv.state = 'marching';
      return false;
    }
    if (units.length === 0) {
      inv.state = 'marching'; // 全員退却：侵攻軍はまた進み出す
      return false;
    }
    return true;
  }

  function settleDefense(s, b) {
    const inv = sys.invasion(s, b.invasionId);
    if (!inv) return false;
    const target = sys.node(s, inv.to);
    const name = sys.node(s, inv.from).name + 'の軍';

    if (inv.troops <= 0) {
      const merit = inv.startTroops * INV.MERIT_RATE;
      s.resources.merit += merit;
      sys.events.push({
        type: 'defenseWin', name: name, target: target.name, merit: merit,
        lost: Math.max(0, (b.ownStart || 0) - sys.troopsAt(s, inv.to)), defeated: inv.startTroops,
      });
      removeInvasion(s, inv.id);
      return false;
    }
    if (sys.troopsAt(s, inv.to) <= 0) {
      const loot = loseTerritory(s, inv.to, inv.troops);
      sys.events.push({ type: 'defenseLose', name: name, target: target.name, home: inv.to === 'home', loot: loot });
      removeInvasion(s, inv.id);
      return false;
    }
    return true;
  }

  function settleBattle(s, b) {
    if (b.kind === 'siege') return settleSiege(s, b);
    if (b.kind === 'field') return settleField(s, b);
    return settleDefense(s, b);
  }

  // ---- 敵の侵攻 ----

  sys.invasionInterval = function (s) {
    const cut = (s.map.stage - 1) * INV.STAGE_STEP;
    const min = Math.max(INV.INTERVAL_FLOOR, INV.INTERVAL_MIN - cut);
    const max = Math.max(min, INV.INTERVAL_MAX - cut);
    return min + Math.random() * (max - min);
  };

  // 攻めてこられる組み合わせ：自領に隣接する敵城（攻城戦の最中は除く） → その自領
  sys.invasionCandidates = function (s) {
    const out = [];
    sys.stageData(s).castles.forEach(function (c) {
      if (sys.isOwned(s, c.id) || sys.battleAt(s, c.id)) return;
      sys.neighbors(s, c.id).forEach(function (n) {
        if (sys.isOwned(s, n)) out.push({ from: c.id, to: n });
      });
    });
    return out;
  };

  function spawnInvasion(s) {
    const cands = sys.invasionCandidates(s);
    if (!cands.length) return null;
    const c = cands[Math.floor(Math.random() * cands.length)];
    // 侵攻軍 = 攻めてくる城の守備兵 × 0.3（ただし自軍の総兵力 × 1.5 まで）
    const troops = Math.min(sys.enemyTroops(s, c.from) * INV.SOURCE_RATE, sys.totalTroops(s) * INV.CAP_RATE);
    if (troops < INV.MIN_TROOPS) return null;
    // 出した兵の分だけ城の守備兵が減る（今ある回復の仕組みで少しずつ戻る）
    s.map.enemyTroops[c.from] = sys.enemyTroops(s, c.from) - troops;
    const inv = {
      id: s.nextInvasionId++,
      from: c.from,
      to: c.to,
      troops: troops,
      startTroops: troops,
      state: 'marching', // marching / field（野戦） / sieging（防衛戦）
      elapsed: 0,
      duration: INV.WARNING_SECONDS, // 警告が出てから到着するまで
    };
    s.invasions.push(inv);
    return inv;
  }

  // 自軍の部隊と侵攻軍が同じ街道ですれ違ったら野戦
  function checkCollisions(s) {
    s.invasions.forEach(function (inv) {
      if (inv.state === 'sieging') return;
      const ti = inv.elapsed / inv.duration;
      s.units.forEach(function (u) {
        if (u.state !== 'marching' || u.from !== inv.to || u.to !== inv.from) return;
        const tu = u.elapsed / u.duration;
        if (tu + ti < 1) return;
        u.state = 'field';
        u.fieldWith = inv.id;
        u.elapsed = (1 - ti) * u.duration; // ぶつかった地点で止まる
        u.startTroops = u.troops;
        inv.state = 'field';
        startBattle(s, 'field', inv.id);
      });
    });
  }

  function tickInvasions(s, dt) {
    if (s.invasions.length === 0) {
      if (s.map.invasionTimer < 0) s.map.invasionTimer = sys.invasionInterval(s);
      s.map.invasionTimer -= dt;
      if (s.map.invasionTimer <= 0) {
        spawnInvasion(s);
        s.map.invasionTimer = sys.invasionInterval(s);
      }
    }
    s.invasions = s.invasions.filter(function (inv) {
      if (inv.state !== 'marching') return true;
      inv.elapsed += dt;
      if (inv.elapsed < inv.duration) return true;
      inv.elapsed = inv.duration;
      if (!sys.isOwned(s, inv.to)) return false; // 目標がもう自領でなければ引き上げる
      inv.state = 'sieging';
      startBattle(s, 'defense', inv.id);
      return true;
    });
  }

  // ---- 時間経過（部隊・侵攻・合戦）----

  function arrive(s, u) {
    if (sys.isOwned(s, u.to)) {
      // 補充、または先に別の部隊が落としていた：その城の守備兵に合流（防衛戦中ならそのまま加勢）
      sys.addTroopsAt(s, u.to, u.troops);
      return false;
    }
    u.state = 'sieging';
    u.startTroops = u.troops;
    startBattle(s, 'siege', u.to); // 攻城戦中の城なら援軍として合流する
    return true;
  }

  function pursuitPower(s, u) {
    if (u.pursuitInvasion !== null) {
      const inv = sys.invasion(s, u.pursuitInvasion);
      return inv ? inv.troops * INV.POWER_MULT : 0;
    }
    if (u.pursuitFrom && !sys.isOwned(s, u.pursuitFrom)) return sys.enemyPower(s, u.pursuitFrom);
    return 0;
  }

  sys.tickUnits = function (s, dt) {
    // 部隊の移動と到着
    s.units = s.units.filter(function (u) {
      if (u.state === 'sieging' || u.state === 'field') return true;

      if (u.state === 'returning' && u.pursuit > 0) {
        // 退却中は追撃を受ける（損害は半分）
        const d = Math.min(dt, u.pursuit);
        u.troops = Math.max(0, u.troops - pursuitPower(s, u) * BAT.TAKEN_RATE * BAT.RETREAT_TAKEN * d);
        u.pursuit -= d;
        if (u.troops <= 0) return false; // 全滅
      }

      u.elapsed += dt;
      if (u.elapsed < u.duration) return true;
      u.elapsed = u.duration;
      if (u.state === 'marching') return arrive(s, u);
      sys.addTroopsAt(s, u.base, u.troops); // 帰還
      return false;
    });

    tickInvasions(s, dt);
    checkCollisions(s);

    // 合戦（ロード直後などで記録が欠けていても、攻城中の部隊がいれば戦いを続ける）
    s.units.forEach(function (u) {
      if (u.state === 'sieging') startBattle(s, 'siege', u.to);
    });
    s.battles.forEach(function (b) { tickBattle(s, b, dt); });
    s.battles = s.battles.filter(function (b) { return settleBattle(s, b); });
    if (pendingStageClear) {
      pendingStageClear = false;
      clearStage(s);
    }

    // 戦っていない敵城の守備兵は少しずつ回復する
    Object.keys(s.map.enemyTroops).forEach(function (id) {
      if (sys.battleAt(s, id)) return;
      const max = sys.castleMaxTroops(s, id);
      const v = s.map.enemyTroops[id] + max * BAT.ENEMY_RECOVERY_RATE * dt;
      if (v >= max) delete s.map.enemyTroops[id];
      else s.map.enemyTroops[id] = v;
    });

    tickCommanders(s);
  };

  // ---- 段階の解放 ----

  // 地図をまっさらにする。守備兵と出陣中の兵は本拠地の待機兵に戻す
  function resetMap(s) {
    Object.keys(s.map.garrisons).forEach(function (id) { s.resources.troops += s.map.garrisons[id]; });
    s.units.forEach(function (u) { s.resources.troops += u.troops; });
    s.map.owned = ['home'];
    s.map.garrisons = {};
    s.map.enemyTroops = {};
    s.map.invasionTimer = -1;
    s.units = [];
    s.battles = [];
    s.invasions = [];
    s.generals.forEach(function (g) { g.front = ''; g.post = ''; });
  }

  // ボスを倒した：その段階は平定済み（城はすべて領地として米を生む）。次の段階の地図へ
  function clearStage(s) {
    const cleared = s.map.stage;
    if (s.map.cleared.indexOf(cleared) < 0) s.map.cleared.push(cleared);
    if (cleared >= Game.data.STAGES.length) {
      s.flags.unified = true; // 天下統一（エンディングはステップ5）
      sys.events.push({ type: 'unified' });
      return;
    }
    resetMap(s);
    s.map.stage = cleared + 1;
    sys.events.push({ type: 'stageUp', cleared: cleared, stage: s.map.stage });
  }

  // ---- 軍団長の自動進軍 ----
  // 軍団長は、方面（目指す敵城）に近い順に、勝てそうな城（自軍戦力が守備戦力の1.3倍以上）を攻める

  // 街道をたどった距離（拠点の数）
  function graphDistances(s, fromId) {
    const dist = {};
    dist[fromId] = 0;
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      sys.neighbors(s, id).forEach(function (n) {
        if (dist[n] === undefined) {
          dist[n] = dist[id] + 1;
          queue.push(n);
        }
      });
    }
    return dist;
  }

  // 軍団長が次に攻める計画（無ければ null）
  sys.commanderPlan = function (s, g) {
    if (s.flags.unified) return null;
    const front = g.front && !sys.isOwned(s, g.front) ? g.front : null;
    const dist = front ? graphDistances(s, front) : null;
    const perTroop = sys.troopPower(s, 1, g.id);
    const boss = function (id) { return sys.castleData(s, id).boss ? sys.heirloomEffect(s, 'bossPower') : 1; };

    let best = null;
    sys.stageData(s).castles.forEach(function (c) {
      if (sys.isOwned(s, c.id) || sys.battleAt(s, c.id)) return;
      if (s.units.some(function (u) { return u.to === c.id && u.state === 'marching'; })) return; // もう向かっている
      const need = sys.enemyPower(s, c.id) * GEN.AUTO_MIN_POWER_RATIO;
      sys.neighbors(s, c.id).forEach(function (origin) {
        if (!sys.isOwned(s, origin)) return;
        const available = Math.floor(sys.troopsAt(s, origin));
        if (available * perTroop * boss(c.id) < need) return; // 勝てそうにない
        const score = dist ? (dist[c.id] === undefined ? 999 : dist[c.id]) : 0;
        // 方面に近い城を優先。同じなら守備戦力の小さい城、さらに兵の多い出発地
        if (!best || score < best.score ||
          (score === best.score && (c.troops < best.castle.troops ||
            (c.troops === best.castle.troops && available > best.available)))) {
          best = { castle: c, origin: origin, available: available, score: score };
        }
      });
    });
    if (!best) return null;
    const want = Math.ceil(sys.enemyPower(s, best.castle.id) * GEN.AUTO_SEND_POWER_RATIO / (perTroop * boss(best.castle.id)));
    return { from: best.origin, to: best.castle.id, troops: Math.max(1, Math.min(best.available, want)) };
  };

  function tickCommanders(s) {
    s.generals.forEach(function (g) {
      if (g.assignment !== 'commander' || sys.isGeneralDeployed(s, g.id)) return;
      if (s.units.length >= sys.maxUnits(s)) return;
      const plan = sys.commanderPlan(s, g);
      if (!plan) return;
      // 軍団長は「待機」ではないので、出陣できる武将の確認を通さずに直接出す
      if (!sys.canTarget(s, plan.from, plan.to) || plan.troops > sys.troopsAt(s, plan.from)) return;
      const u = sys.dispatch(s, plan.from, plan.to, plan.troops, null);
      if (u) {
        u.generalId = g.id;
        u.auto = true;
      }
    });
  }

  // 開発用：地図だけ最初の状態に戻す（施設・資源・武将はそのまま）
  sys.devResetMap = function (s) {
    resetMap(s);
  };

  // 開発用：今の段階のボスを倒したことにして、次の段階へ進む
  sys.devClearStage = function (s) {
    const bossCastle = sys.stageData(s).castles.find(function (c) { return c.boss; });
    if (bossCastle.heirloom && !sys.hasHeirloom(s, bossCastle.heirloom)) s.heirlooms.push(bossCastle.heirloom);
    clearStage(s);
  };

  // 開発用：すぐに侵攻を起こす
  sys.devInvadeNow = function (s) {
    if (s.invasions.length) return null;
    return spawnInvasion(s);
  };

  // ---- 領地 ----
  // 自領（本拠地以外）と、平定済みの段階のすべての城が 米 +敵兵力×0.02/秒（その代のみ）
  sys.territoryRice = function (s) {
    let r = 0;
    s.map.owned.forEach(function (id) {
      if (id === 'home') return;
      r += sys.castleData(s, id).troops * BAT.TERRITORY_RICE_RATE;
    });
    s.map.cleared.forEach(function (n) {
      if (n === s.map.stage) return; // 天下統一後は今の地図と重なるので数えない
      Game.data.STAGES[n - 1].castles.forEach(function (c) { r += c.troops * BAT.TERRITORY_RICE_RATE; });
    });
    return r * sys.globalMultiplier(s);
  };

  // ---- 開墾クリック ----
  sys.clickAmount = function (s) {
    const c = cfg.CLICK;
    const steps = Math.floor(s.facilities.field / c.FIELD_LEVEL_STEP);
    return c.BASE_RICE * sys.globalMultiplier(s) + steps * c.RATE_SHARE_PER_STEP * sys.rates(s).rice;
  };

  sys.gainRice = function (s, amount) {
    s.resources.rice += amount;
    s.kokudaka += amount;
  };

  sys.click = function (s) {
    if (s.succession) return 0;
    const amount = sys.clickAmount(s);
    sys.gainRice(s, amount);
    return amount;
  };

  // ---- 隠居と家督継承 ----
  // 当主に寿命はない。継承はプレイヤーが隠居したときだけ起きる
  const LORD = cfg.LORD;

  sys.lordFullName = function (s, lord) {
    return s.houseName.replace(/家$/, '') + ' ' + (lord || s.lord).givenName;
  };

  sys.canRetire = function (s) {
    return !s.succession && s.lord.age >= LORD.RETIRE_AFTER;
  };

  // 今隠居すると得る家格（小数のまま）= (その代の石高 ÷ 1000) ^ 0.5 × 老練型・名君の上乗せ
  sys.prestigeGainRaw = function (s) {
    return Math.pow(s.kokudaka / cfg.PRESTIGE.DIVISOR, cfg.PRESTIGE.EXPONENT) * sys.traitEffect(s, 'prestige');
  };

  // 今隠居すると得る家格（切り捨て）
  sys.prestigeGain = function (s) {
    return Math.floor(sys.prestigeGainRaw(s) + 1e-9);
  };

  // ---- 隠居の目安 ----
  // 家格の伸び：直近60秒で増えた「今隠居すると得る家格」。伸びが最大時の半分を下回ったら「隠居の好機」

  // 治世の記録 [経過秒, 得る家格（小数）] を一定間隔でためる
  function recordGrowth(s) {
    const samples = s.lord.samples;
    const last = samples[samples.length - 1];
    if (last && s.lord.age - last[0] < LORD.GROWTH_SAMPLE) return;
    samples.push([s.lord.age, sys.prestigeGainRaw(s)]);
    // 窓より古い記録は、窓の始まりを測るための1つだけ残す
    while (samples.length > 2 && samples[1][0] <= s.lord.age - LORD.GROWTH_WINDOW) samples.shift();
    if (s.lord.age >= LORD.GROWTH_WINDOW) {
      s.lord.peakGrowth = Math.max(s.lord.peakGrowth, sys.prestigeGrowth(s));
    }
  }

  // 家格の伸び（1分あたり）= 窓の始まりから今までに増えた分を、1分あたりに直したもの
  sys.prestigeGrowth = function (s) {
    const start = s.lord.samples[0];
    if (!start) return 0;
    const span = s.lord.age - start[0];
    if (span < LORD.GROWTH_SAMPLE) return 0;
    return (sys.prestigeGainRaw(s) - start[1]) / span * 60;
  };

  // 伸びが最も大きかったときの半分を下回ったら「隠居の好機」（強制はしない）
  sys.isRetireChance = function (s) {
    return sys.canRetire(s) && s.lord.age >= LORD.GROWTH_WINDOW && s.lord.peakGrowth > 0 &&
      sys.prestigeGrowth(s) < s.lord.peakGrowth * LORD.CHANCE_RATIO;
  };

  // 譜代家臣として連れていける人数 = 基本 + 古の兵法書（家臣団はステップ4c）
  sys.retainerSlots = function (s) {
    let n = LORD.BASE_RETAINER_SLOTS;
    s.heirlooms.forEach(function (id) {
      const e = cfg.HEIRLOOMS[id];
      if (e && e.retainerSlots) n += e.retainerSlots;
    });
    return n;
  };

  sys.rollTrait = function (exclude) {
    const ids = Object.keys(cfg.TRAITS).filter(function (id) { return !exclude || exclude.indexOf(id) < 0; });
    const total = ids.reduce(function (sum, id) { return sum + cfg.TRAITS[id].weight; }, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < ids.length; i++) {
      roll -= cfg.TRAITS[ids[i]].weight;
      if (roll < 0) return ids[i];
    }
    return ids[0];
  };

  // 格が1つ上がる確率 = min(0.6, 0.05 + 累計家格 × 0.005)
  sys.gradeUpChance = function (prestige) {
    const G = cfg.TRAIT_GRADE;
    return Math.min(G.UP_MAX, G.UP_BASE + prestige * G.UP_PER_PRESTIGE);
  };

  // ★1から始めて、確率で1つずつ上がる（最大★5）
  sys.rollGrade = function (prestige) {
    let grade = 1;
    const p = sys.gradeUpChance(prestige);
    while (grade < cfg.TRAIT_GRADE.MAX && Math.random() < p) grade++;
    return grade;
  };

  // 跡継ぎの特性。累計家格が高いと2つ持つことがある
  sys.rollTraits = function (prestige) {
    const G = cfg.TRAIT_GRADE;
    const first = sys.rollTrait();
    const traits = [{ id: first, grade: sys.rollGrade(prestige) }];
    if (prestige >= G.SECOND_MIN_PRESTIGE && Math.random() < G.SECOND_CHANCE) {
      traits.push({ id: sys.rollTrait([first]), grade: sys.rollGrade(prestige) });
    }
    return traits;
  };

  function makeHeir(s, usedNames, prestige) {
    const names = Game.data.LORD_GIVEN_NAMES.filter(function (n) { return usedNames.indexOf(n) < 0; });
    const givenName = pick(names.length ? names : Game.data.LORD_GIVEN_NAMES);
    usedNames.push(givenName);
    return { givenName: givenName, traits: sys.rollTraits(prestige), portrait: randInt(1, GEN.PORTRAIT_COUNT), age: 0 };
  }

  // 継承の手続きを始める（時間が止まり、継承画面が開く）
  // 跡継ぎの格は、この継承で得る家格も含めた累計家格で抽選する
  sys.startSuccession = function (s) {
    if (s.succession) return false;
    const prestige = s.prestige + sys.prestigeGain(s);
    const used = [s.lord.givenName];
    const candidates = [];
    for (let i = 0; i < LORD.HEIR_CANDIDATES; i++) candidates.push(makeHeir(s, used, prestige));
    s.succession = { step: 'summary', candidates: candidates, chosen: null, retainers: [] };
    return true;
  };

  sys.retire = function (s) {
    return sys.canRetire(s) && sys.startSuccession(s);
  };

  sys.successionStep = function (s, step) {
    if (!s.succession) return false;
    s.succession.step = step;
    return true;
  };

  sys.chooseHeir = function (s, index) {
    if (!s.succession || !s.succession.candidates[index]) return false;
    s.succession.chosen = index;
    return true;
  };

  // 譜代家臣の選択を切り替える（枠を超えては選べない）
  sys.toggleRetainer = function (s, generalId) {
    const sc = s.succession;
    if (!sc || !s.generals.some(function (g) { return g.id === generalId; })) return false;
    const i = sc.retainers.indexOf(generalId);
    if (i >= 0) {
      sc.retainers.splice(i, 1);
      return true;
    }
    if (sc.retainers.length >= sys.retainerSlots(s)) return false;
    sc.retainers.push(generalId);
    return true;
  };

  // 継承を終えて次の代を始める
  // リセット：米・金・兵・功績・施設・武将（譜代を除く）・領地（今の段階の地図）
  // 引き継ぎ：家格・家宝・譜代家臣・解放済みの段階（平定済みの段階を含む）・旧領の記録・歴代の記録
  sys.completeSuccession = function (s) {
    const sc = s.succession;
    if (!sc || sc.chosen === null) return false;
    const gained = sys.prestigeGain(s);
    s.lineage.push({
      generation: s.generation,
      givenName: s.lord.givenName,
      traits: s.lord.traits,
      portrait: s.lord.portrait,
      kokudaka: s.kokudaka,
      prestige: gained,
      seconds: s.lord.age,
    });
    s.prestige += gained;

    // この代で落とした城は旧領になる
    s.map.won.forEach(function (id) {
      if (s.formerLands.indexOf(id) < 0) s.formerLands.push(id);
    });
    s.map.won = [];

    // 譜代家臣は配置を解いて次の代へ
    s.generals = s.generals.filter(function (g) { return sc.retainers.indexOf(g.id) >= 0; });
    s.generals.forEach(function (g) {
      g.fudai = true;
      g.assignment = 'idle';
      g.front = '';
      g.post = '';
    });
    s.recruitCount = 0;

    s.generation++;
    s.lord = sc.candidates[sc.chosen];
    s.lord.age = 0;
    s.lord.samples = [];
    s.lord.peakGrowth = 0;
    s.succession = null;

    s.resources = { rice: 0, gold: 0, troops: 0, merit: 0 };
    s.kokudaka = 0;
    Object.keys(s.facilities).forEach(function (id) { s.facilities[id] = 0; });
    s.facilities.field = sys.traitEffect(s, 'startField'); // 早熟型
    s.map.owned = ['home'];
    s.map.garrisons = {};
    s.map.enemyTroops = {};
    s.map.invasionTimer = -1;
    s.units = [];
    s.battles = [];
    s.invasions = [];
    s.flags.firstVictory = false; // 城郭は、この代で最初の合戦に勝つと解放
    sys.events.length = 0;
    return true;
  };

  // ---- 旧領回復 ----
  // 待機兵の戦力が守備戦力を上回る旧領を、攻城戦なしでまとめて自領に戻す（消費する兵 = 守備兵の数）

  // 今の地図で、まだ取り戻していない旧領（守備兵の少ない順）
  sys.formerLandsOnMap = function (s) {
    return sys.stageData(s).castles.filter(function (c) {
      return sys.isFormerLand(s, c.id) && !sys.isOwned(s, c.id);
    }).sort(function (a, b) { return sys.enemyTroops(s, a.id) - sys.enemyTroops(s, b.id); });
  };

  // 一括回復で取り戻せる旧領（待機兵を順に使っていったときに足りる分）
  sys.recoverablePlan = function (s) {
    let troops = s.resources.troops;
    const perTroop = sys.troopPower(s, 1, null);
    const plan = [];
    sys.formerLandsOnMap(s).forEach(function (c) {
      if (sys.battleAt(s, c.id)) return;
      const garrison = sys.enemyTroops(s, c.id);
      if (troops * perTroop > sys.enemyPower(s, c.id) && troops >= garrison) {
        plan.push({ id: c.id, cost: garrison });
        troops -= garrison;
      }
    });
    return plan;
  };

  sys.recoverFormerLands = function (s) {
    const plan = sys.recoverablePlan(s);
    plan.forEach(function (p) {
      s.resources.troops = Math.max(0, s.resources.troops - p.cost);
      s.map.owned.push(p.id);
      s.map.garrisons[p.id] = 0; // 守備兵はいない。補充を送るまで守りは手薄
      delete s.map.enemyTroops[p.id];
    });
    if (plan.length) {
      sys.events.push({
        type: 'recovered',
        names: plan.map(function (p) { return sys.castleData(s, p.id).name; }),
        cost: plan.reduce(function (sum, p) { return sum + p.cost; }, 0),
      });
    }
    return plan.length;
  };

  // ---- 時間経過 ----
  sys.tick = function (s, dt) {
    if (s.succession) return; // 継承の手続き中は時間を止める
    const r = sys.rates(s);
    sys.gainRice(s, r.rice * dt);
    s.resources.gold += r.gold * dt;
    s.resources.troops += r.troops * dt;
    sys.tickUnits(s, dt);
    s.stats.playTime += dt;

    s.lord.age += dt;
    recordGrowth(s);
  };

  // 開発用：治世を隠居できる長さまで進める
  sys.devAllowRetire = function (s) {
    s.lord.age = Math.max(s.lord.age, LORD.RETIRE_AFTER);
  };

  Game.systems = sys;
})();

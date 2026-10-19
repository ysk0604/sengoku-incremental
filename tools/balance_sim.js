// バランス確認用のシミュレーション
// ゲーム本体のコード（config / data / state / systems）をそのまま動かし、上手なプレイを自動で真似る。
// ゲームの数値は変えない。結果は画面の表と、<pre id="json"> の JSON に出す。
//
// 使い方：tools/balance_sim.html をブラウザで開く。URL の ? で条件を変えられる
//   seed=1       乱数の種（同じ種なら同じ結果）
//   clicks=5     開墾を1秒に何回押すか（0 で押さない）
//   clickSecs=0  各代の最初のこの秒数だけ開墾を押す（0 はずっと押す）
//   hours=6      ゲーム内の時間でこの時間まで
//   gens=60      この代まで
//   maxReign=900 隠居の好機が来なくても、治世がこの秒数になったら隠居する
//   preset=A     試した数値の組み合わせ（A / A2 / B。下の PRESETS）
//   mod=...      仕組みを試しに変える（noSqrtPower / logPrestige / flatTerritory。下の MODS）
//                flatTerritory は terrBase=1・terrGrowth=10 で量を変えられる
//   set=...      数値を試しに変える（config.js は書き換えない。このページの中だけ）
//                「パス=値」をカンマで区切る。data. で始めると data.js の値
//                例：set=BATTLE.TERRITORY_RICE_RATE=0.002,FACILITIES.castle.effect=1.1,data.STAGES.0.castles.0.troops=30
//
// 上手なプレイの真似方（1秒ごとに判断する）
//   施設   ：城郭は買えるなら最優先（あと90秒で買えるなら貯める）。ほかは手持ちに対して一番安いものから
//   武将   ：登用費が「金の毎秒生産 × 60」以下なら貯めて登用。統率が一番高い1人は部隊の大将、ほかは内政担当
//   攻め   ：勝てる城のうち要る兵が一番少ない城へ、余裕をもって勝てる兵を送る（troopsToWin。戦力の比 約1.1倍、損害は約3割）
//            本拠地から自領を通って向かう（補充してから攻めるのと同じ）。合戦中は突撃・鼓舞・伏兵を使えるたびに使う
//   守り   ：本拠地以外が攻められたら、余裕をもって守りきれる兵になるまで本拠地から援軍を送る
//   旧領   ：一括回復できるならすぐ回復
//   家訓   ：遺徳があれば「コスト × 重み」が一番小さい家訓から習得（代の途中でも）
//   隠居   ：隠居できる（治世120秒から）うえで「隠居の好機」（伸びの最大は治世120秒から測る）が出ていて、攻められる城も出陣中の部隊もなく、最後の落城から90秒たち、
//            得る家格が今の累計の半分以上か伸びがほぼ止まったとき（ボスと合戦中は待つ）。maxReign で打ち切り
//   跡継ぎ ：特性の価値（下の traitValue）が一番高い候補。譜代は政治の高い順
(function () {
  const cfg = Game.config;
  const data = Game.data;
  const sys = Game.systems;

  const q = new URLSearchParams(location.search);
  function param(name, def) {
    const v = q.get(name);
    return v === null || v === '' || isNaN(Number(v)) ? def : Number(v);
  }
  const OPT = {
    seed: param('seed', 1),
    clicks: param('clicks', 5),
    clickSecs: param('clickSecs', 0),
    hours: param('hours', 6),
    maxGens: param('gens', 60),
    maxReign: param('maxReign', 900),
    dt: 0.1,       // ゲームと同じ 1ティック 0.1秒
    aiEvery: 1,    // 判断の間隔（秒）
  };

  // 試した数値の組み合わせ（preset=A のように呼ぶ。set= と一緒に使うと set= があとから当たる）
  const PRESETS = {
    // A：施設・武将・領地を抑え、家格の指数を下げる（2026-10-18 の報告の案A）
    A: 'FACILITIES.castle.effect=1.1,FACILITIES.castle.growth=3,GENERALS.RECRUIT_GROWTH=3,GENERALS.DOMESTIC_PER_POLITICS=0.005,' +
      'BATTLE.TERRITORY_RICE_RATE=0.002,FACILITIES.barracks.effect=0.1,FACILITIES.barracks.growth=1.22,FACILITIES.smithy.growth=1.5,' +
      'MILESTONE_MULT=1.5,FACILITIES.field.growth=1.2,FACILITIES.market.growth=1.2,PRESTIGE.EXPONENT=0.3',
    // A2：A に、段階1の敵を3倍強く・合戦の最低の長さを12秒にしたもの（案A＋段階1の調整）
    // ※ 2026-10-19 に A2 を config.js / data.js に入れたので、今は preset なしが A2 と同じ
    A2: '@A,data.STAGES.0.castles.0.troops=30,data.STAGES.0.castles.1.troops=100,data.STAGES.0.castles.2.troops=300,' +
      'data.STAGES.0.castles.3.troops=1000,BATTLE.MIN_SIEGE_SECONDS=12',
    // B：数を減らした案（城郭・武将・領地・兵舎だけ）＋家格の指数 0.25
    B: 'FACILITIES.castle.effect=1.1,FACILITIES.castle.growth=3,GENERALS.RECRUIT_GROWTH=3,GENERALS.DOMESTIC_PER_POLITICS=0.005,' +
      'BATTLE.TERRITORY_RICE_RATE=0.002,FACILITIES.barracks.effect=0.1,FACILITIES.barracks.growth=1.22,PRESTIGE.EXPONENT=0.25',
  };
  function expandPreset(name) {
    if (!PRESETS[name]) throw new Error('preset= の名前が違います：' + name);
    return PRESETS[name].split(',').map(function (x) { return x.charAt(0) === '@' ? expandPreset(x.slice(1)) : x; }).join(',');
  }
  const setText = [q.get('preset') ? expandPreset(q.get('preset')) : '', q.get('set') || ''].join(',');
  OPT.preset = q.get('preset') || '';

  // 試しの数値（set=）を当てる
  const overrides = [];
  setText.split(',').filter(function (x) { return x.trim(); }).forEach(function (pair) {
    const eq = pair.lastIndexOf('=');
    const path = pair.slice(0, eq).trim();
    const value = Number(pair.slice(eq + 1));
    let root = cfg;
    let keys = path.split('.');
    if (keys[0] === 'data') { root = data; keys = keys.slice(1); }
    let obj = root;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    if (!obj || !(keys[keys.length - 1] in obj) || isNaN(value)) throw new Error('set= の指定が読めません：' + pair);
    const old = obj[keys[keys.length - 1]];
    obj[keys[keys.length - 1]] = value;
    overrides.push(path + '：' + old + ' → ' + value);
  });
  OPT.overrides = overrides;

  // 仕組みを試しに変える（mod=。このページの中だけで関数を差し替える）
  //   noSqrtPower：戦力に √全体倍率 をかけない（兵の数にはもう全体倍率がかかっているので）
  //   logPrestige：家格倍率を「1 + 累計家格 × 0.1」から「1 + log2(1 + 累計家格)」にする
  const MODS = {
    noSqrtPower: function () {
      sys.troopPower = function (s, troops, generalId) {
        return troops * sys.smithyMultiplier(s) * sys.leaderMultiplier(s, generalId) *
          sys.heirloomEffect(s, 'power') * sys.traitEffect(s, 'power') * sys.preceptPowerMultiplier(s);
      };
    },
    logPrestige: function () {
      sys.prestigeMultiplierFor = function (s, prestige) {
        return (1 + Math.log2(1 + prestige)) * sys.heirloomEffect(s, 'prestigeMult');
      };
    },
    // 領地の米を、敵の兵の数ではなく段階ごとの決まった量にする
    //   1つの城あたり 米 +terrBase × terrGrowth^(段階-1) /秒（全体倍率がかかる）
    flatTerritory: function () {
      const base = param('terrBase', 1);
      const growth = param('terrGrowth', 10);
      const perCastle = function (stage) { return base * Math.pow(growth, stage - 1); };
      overrides.push('領地の米：1城あたり ' + base + ' × ' + growth + '^(段階-1) /秒');
      sys.territoryRice = function (s) {
        let r = 0;
        s.map.owned.forEach(function (id) { if (id !== 'home') r += perCastle(s.map.stage); });
        s.map.cleared.forEach(function (n) {
          if (n === s.map.stage) return;
          r += data.STAGES[n - 1].castles.length * perCastle(n);
        });
        return r * sys.resourceMultiplier(s, 'rice');
      };
    },
  };
  OPT.mods = (q.get('mod') || '').split(',').filter(function (x) { return x.trim(); });
  OPT.mods.forEach(function (m) {
    if (!MODS[m]) throw new Error('mod= の名前が違います：' + m);
    MODS[m]();
    overrides.push('仕組み：' + m);
  });

  // 乱数を種つきにする（同じ条件なら同じ結果になるように）
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(OPT.seed);

  // ---- 判断の重み ----
  // 家訓：コスト × 重み が小さいものから習得する
  const PRECEPT_WEIGHT = {
    rakuichi: 1, kenchi: 1, fukoku: 1.2, heinou: 1, teppou: 1, joubi: 1.5,
    touyou: 2, kashindan: 2, homare: 1, eisai: 1.5,
    ando: 1, fushin: 1, kaidou: 2, monomi: 3, geigeki: 1, saihai: 2,
  };
  // 跡継ぎの特性の価値（上乗せ分を、だいたい「全生産 +x」に換算）
  function traitValue(t) {
    const m = cfg.TRAIT_GRADE.MULTS[t.grade - 1];
    switch (t.id) {
      case 'domestic': return cfg.TRAITS.domestic.production * m;
      case 'martial': return cfg.TRAITS.martial.power * m * 0.7;
      case 'veteran': return cfg.TRAITS.veteran.prestige * m * 1.2;
      case 'thrifty': return (1 / Math.pow(cfg.TRAITS.thrifty.cost, t.grade) - 1) * 0.6;
      case 'precocious': return 0.05 * t.grade;
      case 'wise': return (cfg.TRAITS.wise.production + cfg.TRAITS.wise.power * 0.7 + cfg.TRAITS.wise.prestige * 1.2) * m;
    }
    return 0;
  }

  const s = Game.state.create();
  Game.state.current = s;

  // ---- 記録 ----
  const rec = {
    opt: OPT,
    stages: [{ stage: 1, gen: 1, time: 0 }],
    gens: [],
    attacks: [],   // 攻城戦の記録（段階1 の簡単さを見る）
    defeats: [],   // 攻略に失敗した記録（最初の50件）
    timeline: [],  // 最初の3代の1分ごとの様子
    end: null,
  };
  let gen = newGenStats();
  const attackInfo = {}; // 城ID → 出陣したときの情報

  function newGenStats() {
    return {
      gen: s.generation, stageStart: s.map.stage, startTime: s.stats.playTime,
      won: 0, lost: 0, defended: 0, defenseLost: 0, recovered: 0,
      firstVictoryAt: null, lastVictoryAt: null,
    };
  }

  function collectEvents() {
    sys.events.forEach(function (ev) {
      if (ev.type === 'victory') {
        gen.won++;
        if (gen.firstVictoryAt === null) gen.firstVictoryAt = s.lord.age;
        gen.lastVictoryAt = s.lord.age;
        const id = Object.keys(attackInfo).find(function (k) { return sys.castleById(k).name === ev.name; });
        const info = id ? attackInfo[id] : {};
        rec.attacks.push(Object.assign({
          gen: s.generation, stage: s.map.stage, name: ev.name, boss: ev.boss, wonAt: s.lord.age,
          lost: ev.lost, survivors: ev.survivors,
        }, info));
        if (id) delete attackInfo[id];
      } else if (ev.type === 'defeat') {
        gen.lost++;
        if (rec.defeats.length < 50) {
          const id = Object.keys(attackInfo).find(function (k) { return sys.castleById(k).name === ev.name; });
          rec.defeats.push(Object.assign({ gen: s.generation, name: ev.name, at: s.lord.age, lost: ev.lost, enemyLeft: ev.enemyLeft },
            id ? attackInfo[id] : {}));
          if (id) delete attackInfo[id];
        }
      } else if (ev.type === 'defenseWin' || ev.type === 'fieldWin') {
        gen.defended++;
      } else if (ev.type === 'defenseLose') {
        gen.defenseLost++;
      } else if (ev.type === 'recovered') {
        gen.recovered += ev.names.length;
      }
    });
    sys.events.length = 0;
  }

  // ---- 施設 ----
  function timeToAfford(cost, rates) {
    let t = 0;
    Object.keys(cost).forEach(function (res) {
      const short = cost[res] - s.resources[res];
      if (short > 0) t = Math.max(t, rates[res] > 0 ? short / rates[res] : Infinity);
    });
    return t;
  }

  function aiBuild() {
    const rates = sys.rates(s);
    const reserve = { rice: 0, gold: 0, troops: 0 };
    // 城郭は最優先。もうすぐ買えるなら貯める
    if (sys.isUnlocked(s, 'castle')) {
      const c = sys.cost(s, 'castle', 1);
      if (sys.canAfford(s, c)) sys.build(s, 'castle', 1);
      const c2 = sys.cost(s, 'castle', 1);
      if (timeToAfford(c2, rates) < 90) Object.keys(c2).forEach(function (r) { reserve[r] += c2[r]; });
    }
    // 武将の登用（金の毎秒生産 × 60 以下の費用なら貯めて登用）
    const rc = sys.recruitCost(s);
    if (rc.gold <= rates.gold * 60 + 1e-9) {
      if (s.resources.gold - reserve.gold >= rc.gold) {
        sys.recruit(s);
        assignGenerals();
      } else {
        reserve.gold += rc.gold;
      }
    }
    // 残りで、手持ちに対して一番安い施設から（城郭以外）
    for (let i = 0; i < 500; i++) {
      let best = null;
      let bestRatio = Infinity;
      data.FACILITIES.forEach(function (def) {
        if (def.id === 'castle' || !sys.isUnlocked(s, def.id)) return;
        const cost = sys.cost(s, def.id, 1);
        let ratio = 0;
        let ok = true;
        Object.keys(cost).forEach(function (res) {
          const free = s.resources[res] - reserve[res];
          if (free < cost[res]) ok = false;
          ratio = Math.max(ratio, cost[res] / Math.max(1e-9, free));
        });
        if (ok && ratio < bestRatio) { bestRatio = ratio; best = def.id; }
      });
      if (!best) break;
      sys.build(s, best, 1);
    }
  }

  // ---- 武将 ----
  function assignGenerals() {
    if (!s.generals.length) return;
    let leader = null;
    s.generals.forEach(function (g) {
      if (!leader || g.stats.leadership > leader.stats.leadership) leader = g;
    });
    s.generals.forEach(function (g) {
      const want = g === leader ? 'idle' : 'domestic';
      if (g.assignment !== want) sys.assign(s, g.id, want);
    });
  }

  function leaderId() {
    const list = sys.availableLeaders(s);
    let best = null;
    list.forEach(function (g) { if (!best || g.stats.leadership > best.stats.leadership) best = g; });
    return best ? best.id : null;
  }

  // 本拠地から自領を通って、target（自領でも敵城でも）へ部隊を出す
  function sendFromHome(target, troops, generalId) {
    troops = Math.floor(troops);
    if (troops < cfg.MAP.MIN_UNIT_TROOPS || troops > s.resources.troops) return null;
    let path;
    if (sys.isOwned(s, target)) {
      path = sys.ownedPath(s, 'home', target);
    } else {
      // 敵城：隣の自領までの道のりに、敵城を足す
      sys.neighbors(s, target).forEach(function (n) {
        if (!sys.isOwned(s, n)) return;
        const p = sys.ownedPath(s, 'home', n);
        if (p && (!path || p.length + 1 < path.length)) path = p.concat([target]);
      });
    }
    if (!path || path.length < 2) return null;
    const u = sys.dispatch(s, 'home', path[1], troops, generalId);
    if (u) u.path = path.slice(2);
    return u;
  }

  // 勝つのに要る兵（ランチェスターの二次法則）
  // 敵の兵は「自軍戦力 × 0.2 ÷ 敵1人あたり戦力」、自軍の兵は「敵戦力 × 0.12 ÷ 自軍1人あたり戦力」ずつ減る。
  // つまり戦力どうしで削り合うので、自軍が勝つのは 0.2 × 自軍戦力² > 0.12 × 敵戦力² のとき（戦力の比 0.77 倍より上）。
  // 余裕 margin を掛けた分（2 なら戦力の比 約1.1倍、損害は約3割）を送る。
  const WIN_MARGIN = 2;
  function troopsToWin(perTroop, enemyTroops, enemyPerTroop) {
    const ratio = Math.sqrt(WIN_MARGIN * cfg.BATTLE.TAKEN_RATE / cfg.BATTLE.DEALT_RATE); // 要る戦力の比
    return Math.ceil(enemyTroops * enemyPerTroop * ratio / perTroop);
  }

  // ---- 攻め ----
  function aiAttack() {
    if (sys.unitsInUse(s) >= sys.maxUnits(s) || s.flags.unified) return;
    const leader = leaderId();
    const perTroop = sys.troopPower(s, 1, leader);
    let best = null;
    sys.stageData(s).castles.forEach(function (c) {
      if (sys.isOwned(s, c.id) || sys.battleAt(s, c.id) || !sys.isVisible(s, c.id)) return;
      if (s.units.some(function (u) { return u.to === c.id || u.path.indexOf(c.id) >= 0; })) return;
      if (!sys.neighbors(s, c.id).some(function (n) { return sys.isOwned(s, n); })) return;
      const boss = c.boss ? sys.heirloomEffect(s, 'bossPower') : 1;
      const need = troopsToWin(perTroop * boss, sys.enemyTroops(s, c.id), sys.defenseMultiplier(s, c.id));
      if (need > s.resources.troops) return;
      if (!best || need < best.need) best = { c: c, power: sys.enemyPower(s, c.id), boss: boss, need: need };
    });
    if (!best) return;
    const troops = Math.min(Math.floor(s.resources.troops), best.need);
    const home = s.resources.troops;
    const u = sendFromHome(best.c.id, troops, leader);
    if (u) {
      attackInfo[best.c.id] = {
        sentAt: s.lord.age, sent: troops, home: home, enemyPower: best.power,
        ownPower: sys.troopPower(s, troops, leader) * best.boss, battleSeconds: 0,
      };
    }
  }

  // ---- 守り ----
  function aiDefend() {
    s.invasions.forEach(function (inv) {
      if (inv.aiSent || inv.to === 'home' || !sys.isOwned(s, inv.to)) return;
      if (sys.unitsInUse(s) >= sys.maxUnits(s)) return;
      const perTroop = sys.troopPower(s, 1, null) *
        (1 + s.facilities.castle * cfg.INVASION.DEFENSE_PER_CASTLE_LEVEL) * sys.castellanMultiplier(s, inv.to);
      const need = troopsToWin(perTroop, inv.troops, cfg.INVASION.POWER_MULT) - sys.troopsAt(s, inv.to);
      if (need <= 0) return;
      const troops = Math.min(Math.floor(s.resources.troops), need);
      if (sendFromHome(inv.to, troops, null)) inv.aiSent = true;
    });
  }

  // ---- 采配 ----
  function aiCommands() {
    s.battles.forEach(function (b) {
      const sides = sys.battleSides(s, b);
      if (sides.own.troops <= 0) return;
      ['charge', 'rally', 'ambush'].forEach(function (k) { sys.command(s, b.key, k); });
      if (b.kind === 'siege' && attackInfo[b.castleId]) attackInfo[b.castleId].battleSeconds = b.elapsed;
    });
  }

  // ---- 家訓 ----
  function aiPrecepts() {
    for (let i = 0; i < 200; i++) {
      let best = null;
      let bestScore = Infinity;
      Object.keys(cfg.PRECEPTS).forEach(function (id) {
        if (!sys.canLearnPrecept(s, id)) return;
        const score = sys.preceptCost(s, id) * (PRECEPT_WEIGHT[id] || 1);
        if (score < bestScore) { bestScore = score; best = id; }
      });
      if (!best) break;
      sys.learnPrecept(s, best);
    }
  }

  // ---- 隠居と継承 ----
  const RETIRE_GAIN_RATIO = 0.5;

  function bossFighting() {
    return s.battles.some(function (b) { return b.kind === 'siege' && sys.castleData(s, b.castleId).boss; });
  }

  // 今すぐ攻められる城があるか（待機兵で勝てる城）
  function canAttackNow() {
    const perTroop = sys.troopPower(s, 1, leaderId());
    return sys.stageData(s).castles.some(function (c) {
      if (sys.isOwned(s, c.id) || !sys.neighbors(s, c.id).some(function (n) { return sys.isOwned(s, n); })) return false;
      const boss = c.boss ? sys.heirloomEffect(s, 'bossPower') : 1;
      return troopsToWin(perTroop * boss, sys.enemyTroops(s, c.id), sys.defenseMultiplier(s, c.id)) <= s.resources.troops;
    });
  }

  function aiRetire() {
    if (!sys.canRetire(s) || bossFighting()) return;
    const gain = sys.prestigeGain(s);
    if (gain < 1) return;
    if (s.lord.age < OPT.maxReign) {
      if (!sys.isRetireChance(s)) return;
      // 上手な人は、城を落とし続けている間や、すぐ攻められる城があるうちは隠居しない
      if (s.units.length || canAttackNow()) return;
      if (gen.lastVictoryAt !== null && s.lord.age - gen.lastVictoryAt < 90) return;
      // 得る家格が今の累計の半分に届くか、伸びがほぼ止まるまで待つ（少しの家格で代を重ねない）
      const enough = gain >= s.prestige * RETIRE_GAIN_RATIO;
      const stalled = sys.prestigeGrowth(s) < s.lord.peakGrowth * 0.15;
      if (!enough && !stalled) return;
    }

    const record = {
      gen: s.generation, stageStart: gen.stageStart, stageEnd: s.map.stage,
      reign: s.lord.age, kokudaka: s.kokudaka, prestige: gain, virtue: s.generationVirtue,
      won: gen.won, lost: gen.lost, defended: gen.defended, defenseLost: gen.defenseLost,
      recovered: gen.recovered, firstVictoryAt: gen.firstVictoryAt,
      reason: sys.isRetireChance(s) ? '好機' : '打ち切り',
      traits: s.lord.traits.map(function (t) { return data.TRAITS[t.id].name + '★' + t.grade; }).join('・'),
    };
    // 伸びの内訳（隠居する直前）
    const rates = sys.rates(s);
    record.facilities = Object.assign({}, s.facilities);
    record.mult = {
      prestige: sys.prestigeMultiplier(s), castle: sys.castleMultiplier(s), domestic: sys.domesticMultiplier(s),
      heirloom: sys.heirloomEffect(s, 'production'), trait: sys.traitEffect(s, 'production'),
      precept: sys.preceptProductionMultiplier(s, 'rice'), global: sys.globalMultiplier(s),
    };
    record.riceRate = rates.rice;
    record.territoryRate = sys.territoryRice(s);
    record.clickRate = OPT.clicks * sys.clickAmount(s);
    record.generals = s.generals.length;
    sys.retire(s);
    aiPrecepts();
    sys.successionStep(s, 'heir'); // 英才教育の候補を足す
    let bestI = 0;
    let bestV = -1;
    s.succession.candidates.forEach(function (c, i) {
      const v = c.traits.reduce(function (sum, t) { return sum + traitValue(t); }, 0);
      if (v > bestV) { bestV = v; bestI = i; }
    });
    sys.chooseHeir(s, bestI);
    s.generals.slice().sort(function (a, b) { return b.stats.politics - a.stats.politics; }).forEach(function (g) {
      sys.toggleRetainer(s, g.id);
    });
    sys.completeSuccession(s);
    record.endTime = s.stats.playTime;
    record.totalPrestige = s.prestige;
    record.totalVirtue = s.virtue;
    rec.gens.push(record);
    gen = newGenStats();
    Object.keys(attackInfo).forEach(function (k) { delete attackInfo[k]; });
    assignGenerals();
  }

  // 最初の3代は、1分ごとの伸びを記録する
  let nextSample = 0;
  function sample() {
    if (s.generation > 3 || s.lord.age < nextSample) return;
    nextSample = Math.floor(s.lord.age / 60) * 60 + 60;
    const r = sys.rates(s);
    rec.timeline.push({
      gen: s.generation, t: s.lord.age, stage: s.map.stage, kokudaka: s.kokudaka, rice: r.rice, gold: r.gold,
      troopsRate: r.troops, troops: sys.totalTroops(s), perTroop: sys.troopPower(s, 1, null),
      global: sys.globalMultiplier(s), castle: s.facilities.castle, barracks: s.facilities.barracks,
      smithy: s.facilities.smithy, generals: s.generals.length, owned: s.map.owned.length - 1,
    });
  }

  function ai() {
    sample();
    if (sys.recoverablePlan(s).length) sys.recoverFormerLands(s);
    aiBuild();
    aiDefend();
    aiAttack();
    aiCommands();
    aiPrecepts();
    aiRetire();
  }

  // ---- 実行 ----
  const started = Date.now();
  const limit = OPT.hours * 3600;
  let aiTimer = 0;
  let lastStage = s.map.stage;
  while (s.stats.playTime < limit && !s.flags.unified && s.generation <= OPT.maxGens) {
    if (OPT.clicks > 0 && (!OPT.clickSecs || s.lord.age < OPT.clickSecs)) sys.gainRice(s, sys.clickAmount(s) * OPT.clicks * OPT.dt);
    sys.tick(s, OPT.dt);
    collectEvents();
    if (s.map.stage !== lastStage) {
      lastStage = s.map.stage;
      rec.stages.push({ stage: s.map.stage, gen: s.generation, time: s.stats.playTime, reignAt: s.lord.age });
    }
    aiTimer += OPT.dt;
    if (aiTimer >= OPT.aiEvery - 1e-9) {
      aiTimer = 0;
      ai();
      collectEvents();
    }
  }
  rec.end = {
    unified: s.flags.unified, time: s.stats.playTime, generation: s.generation, stage: s.map.stage,
    reign: s.lord.age, kokudaka: s.kokudaka, prestige: s.prestige, virtue: s.virtue,
    precepts: s.precepts, heirlooms: s.heirlooms, wallMs: Date.now() - started,
    won: gen.won, defended: gen.defended,
  };

  // ---- 表示 ----
  const fmt = Game.format;
  function mmss(sec) {
    const m = Math.floor(sec / 60);
    return m + '分' + String(Math.floor(sec % 60)).padStart(2, '0') + '秒';
  }
  function hm(sec) {
    const h = Math.floor(sec / 3600);
    return (h ? h + '時間' : '') + Math.floor(sec % 3600 / 60) + '分';
  }
  function table(title, head, rows) {
    const h = document.createElement('h2');
    h.textContent = title;
    document.body.appendChild(h);
    const t = document.createElement('table');
    const tr = document.createElement('tr');
    head.forEach(function (c) { const th = document.createElement('th'); th.textContent = c; tr.appendChild(th); });
    t.appendChild(tr);
    rows.forEach(function (r) {
      const row = document.createElement('tr');
      r.forEach(function (c) { const td = document.createElement('td'); td.textContent = c; row.appendChild(td); });
      t.appendChild(row);
    });
    document.body.appendChild(t);
  }

  const p = document.createElement('p');
  p.textContent = '条件：seed=' + OPT.seed + '　開墾 ' + OPT.clicks + '回/秒' + (OPT.clickSecs ? '（各代の最初の' + OPT.clickSecs + '秒だけ）' : '') + '　上限 ' + OPT.hours + '時間・' + OPT.maxGens +
    '代　結果：' + (rec.end.unified ? '天下統一' : '未統一（段階' + rec.end.stage + '）') + '　' + hm(rec.end.time) +
    '・第' + rec.end.generation + '代　（計算 ' + (rec.end.wallMs / 1000).toFixed(1) + '秒）';
  document.body.appendChild(p);
  if (overrides.length) {
    const o = document.createElement('p');
    o.textContent = '試しの数値：' + overrides.join('　');
    document.body.appendChild(o);
  }

  table('段階に初めて入った代と時間', ['段階', '代', '合計プレイ時間'], rec.stages.map(function (x) {
    return [x.stage + ' ' + data.STAGES[x.stage - 1].name, '第' + x.gen + '代', hm(x.time)];
  }));
  table('代ごとの記録', ['代', '段階', '治世', '石高', '家格', '累計家格', '遺徳', '落城', '敗北', '防衛 成功/失敗', '隠居', '当主の特性', '累計時間'],
    rec.gens.map(function (g) {
      return [g.gen, g.stageStart + (g.stageEnd !== g.stageStart ? '→' + g.stageEnd : ''), mmss(g.reign), fmt.num(g.kokudaka),
        '+' + fmt.num(g.prestige), fmt.num(g.totalPrestige), '+' + fmt.num(g.virtue), g.won, g.lost,
        g.defended + '/' + g.defenseLost, g.reason, g.traits || 'なし', hm(g.endTime)];
    }));
  table('攻城戦（段階1と、各段階のボス）', ['代', '城', '出陣（治世）', '待機兵', '送った兵', '自軍戦力 ÷ 敵戦力', '合戦の長さ', '損害', '落城（治世）'],
    rec.attacks.filter(function (a) { return a.stage === 1 || a.boss; }).map(function (a) {
      return [a.gen, a.name, a.sentAt !== undefined ? mmss(a.sentAt) : '', fmt.num(a.home || 0), fmt.num(a.sent || 0),
        a.enemyPower ? (a.ownPower / a.enemyPower).toFixed(1) + '倍' : '', (a.battleSeconds || 0).toFixed(0) + '秒',
        fmt.num(a.lost), mmss(a.wonAt)];
    }));

  table('伸びの内訳（隠居する直前）', ['代', '田畑', '市場', '兵舎', '鍛冶', '城郭', '家格倍率', '城郭倍率', '内政', '家宝', '特性', '家訓', '全体倍率',
    '米/秒（施設+領地）', 'うち領地', '開墾/秒', '武将'], rec.gens.map(function (g) {
    const f = g.facilities;
    const m = g.mult;
    return [g.gen, f.field, f.market, f.barracks, f.smithy, f.castle, fmt.mult(m.prestige), fmt.mult(m.castle), fmt.mult(m.domestic),
      fmt.mult(m.heirloom), fmt.mult(m.trait), fmt.mult(m.precept), fmt.mult(m.global), fmt.num(g.riceRate), fmt.num(g.territoryRate),
      fmt.num(g.clickRate), g.generals];
  }));
  table('最初の3代の1分ごとの様子', ['代', '治世', '段階', '石高', '米/秒', '金/秒', '兵/秒', '総兵力', '1人あたり戦力', '総戦力',
    '全体倍率', '城郭', '兵舎', '鍛冶', '武将', '自領'], rec.timeline.map(function (x) {
    return [x.gen, mmss(x.t), x.stage, fmt.num(x.kokudaka), fmt.num(x.rice), fmt.num(x.gold), fmt.num(x.troopsRate), fmt.num(x.troops),
      fmt.num(x.perTroop), fmt.num(x.troops * x.perTroop), fmt.mult(x.global), x.castle, x.barracks, x.smithy, x.generals, x.owned];
  }));
  table('攻略に失敗した合戦（最初の50件）', ['代', '城', '出陣（治世）', '送った兵', '自軍戦力 ÷ 敵戦力', '損害', '敵の残り', '失敗（治世）'],
    rec.defeats.map(function (d) {
      return [d.gen, d.name, d.sentAt !== undefined ? mmss(d.sentAt) : '（AIの出陣ではない）', fmt.num(d.sent || 0),
        d.enemyPower ? (d.ownPower / d.enemyPower).toFixed(1) + '倍' : '', fmt.num(d.lost), fmt.num(d.enemyLeft), mmss(d.at)];
    }));

  const pre = document.createElement('pre');
  pre.id = 'json';
  pre.textContent = JSON.stringify(rec);
  document.body.appendChild(pre);
})();

// ゲーム状態の生成・セーブ・ロード
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;

  // 初代の当主（特性なし）
  function firstLord() {
    const names = Game.data.LORD_GIVEN_NAMES;
    return {
      givenName: names[Math.floor(Math.random() * names.length)],
      traits: [], // [{ id, grade }]（最大2つ）
      portrait: 1 + Math.floor(Math.random() * cfg.GENERALS.PORTRAIT_COUNT),
      age: 0, // この代が始まってからの秒数（治世）
      samples: [],    // 家格の伸びを測る記録 [秒, 得る家格]
      peakGrowth: 0,  // 家格の伸びの最大（1分あたり）
    };
  }

  function create() {
    const facilities = {};
    Game.data.FACILITIES.forEach(function (f) { facilities[f.id] = 0; });

    return {
      version: cfg.SAVE_VERSION,
      houseName: cfg.DEFAULT_HOUSE_NAME,
      generation: 1,
      lord: firstLord(),
      prestige: 0,       // 累計家格（継承で引き継ぐ）
      virtue: 0,         // 遺徳の残り（戦の勝利で貯まり、家訓に使う。継承で引き継ぐ）
      generationVirtue: 0, // この代で得た遺徳（継承画面・家系の表示用）
      precepts: {},      // 習得済みの家訓 { 家訓ID: Lv }（継承で引き継ぐ）
      formerLands: [],   // 旧領：前の代までに落とした敵城のID（守備兵が 1/10 になる）
      lineage: [],       // 歴代当主の記録
      succession: null,  // 継承の手続き中（null でなければ時間を止めて継承画面を出す）
      resources: { rice: 0, gold: 0, troops: 0 }, // troops = 本拠地の待機兵
      kokudaka: 0, // その代の米の累計獲得量
      facilities: facilities,
      generals: [],
      recruitCount: 0,   // この代で登用した人数（登用コストの計算に使う）
      nextGeneralId: 1,
      map: {
        stage: 1,
        owned: ['home'],   // 自領の拠点ID
        garrisons: {},     // 自領（本拠地以外）の守備兵 { 拠点ID: 兵数 }
        enemyTroops: {},   // 減っている敵城の守備兵 { 拠点ID: 兵数 }（無ければ満員）
        invasionTimer: -1, // 次の侵攻までの秒数（-1 は未設定）
        cleared: [],       // 平定済みの段階（その段階の城はすべて領地として米を生む）
        won: [],           // この代で落とした敵城（継承で旧領になる）
      },
      // 稲刈りと金山（道具・深さ・手作業の記録は代ごとにリセット。view は田んぼ／金山の切り替え）
      work: {
        view: 'rice',
        sickle: 0,        // 鎌の番号（config の WORK.SICKLES）
        pickaxe: 0,       // ツルハシの番号
        depth: 0,         // 金山の今の深さ（間）
        maxDepth: 0,      // この代の最深
        lastMaxDepth: 0,  // 前の代の最深（坑道の記録）
        manualRate: { rice: 0, mine: 0 }, // 手作業の稼ぎ（1秒あたりの量の単位）。自動の稼ぎの元
        blastCd: 0,       // 発破のクールダウン（秒）
      },
      // イベント（4.8）
      pendingEvents: [], // 選ぶのを待っているイベントのID（選ぶまで時間を止める）
      eventsDone: [],    // この周で起きたイベントのID（1周に一度だけ）
      eventEffects: { goodRecruit: false, heirGradeUp: 0, heirExtra: 0 }, // 次の登用・次の継承に効くもの
      genBuffs: { power: 1, homeDefense: 1 }, // この代だけの補正（一揆の鎮圧・謀反への備え）
      // 天下統一と周回
      ending: null,      // 天下統一したときの記録 { time, generations, maxKokudaka }
      cycle: 1,          // 何周目か
      cycles: [],        // 前の周の記録 [{ cycle, time, generations, maxKokudaka }]
      heirlooms: [],     // 手に入れた家宝のID
      units: [],         // 出陣中の部隊
      nextUnitId: 1,
      invasions: [],     // 敵の侵攻軍
      nextInvasionId: 1,
      battles: [],       // 進行中の合戦（攻城戦・防衛戦・野戦。采配の効果時間・クールダウン）
      flags: { firstVictory: false, unified: false, endingSeen: false },
      settings: { bulk: cfg.DEFAULT_BULK, autoBuild: true }, // autoBuild：自動普請のON/OFF
      stats: { playTime: 0, battlesWon: 0, stageLog: [] }, // stageLog：この周で段階に入った代と時間 [{ stage, generation, time }]
    };
  }

  // 既定の形を基準に、セーブデータの値を型が合うものだけ取り込む
  // （古いセーブに無い項目は既定値で埋まる）
  function merge(def, saved) {
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return def;
    const out = {};
    Object.keys(def).forEach(function (k) {
      const d = def[k];
      const v = saved[k];
      if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
        out[k] = merge(d, v);
      } else if (typeof v === typeof d && (typeof v !== 'number' || isFinite(v))) {
        out[k] = v;
      } else {
        out[k] = d;
      }
    });
    return out;
  }

  // 将来の形式変更はここで古い version から変換する
  function migrate(saved) {
    return saved;
  }

  // 武将の配列は merge では中身を検査しないので、ここで形を確かめる
  function sanitizeGenerals(s) {
    const assignIds = Game.data.ASSIGNMENTS.map(function (a) { return a.id; });
    const rarityIds = cfg.GENERALS.RARITIES.map(function (r) { return r.id; });
    const list = Array.isArray(s.generals) ? s.generals : [];
    s.generals = list.filter(function (g) {
      return g && typeof g === 'object' && typeof g.id === 'number' &&
        typeof g.surname === 'string' && typeof g.givenName === 'string' &&
        rarityIds.indexOf(g.rarity) >= 0 && g.stats && typeof g.stats === 'object';
    }).map(function (g) {
      const stats = {};
      Game.data.STATS.forEach(function (st) {
        const v = g.stats[st.id];
        stats[st.id] = typeof v === 'number' && isFinite(v) ? v : cfg.GENERALS.STAT_MIN;
      });
      return {
        id: g.id,
        surname: g.surname,
        givenName: g.givenName,
        epithet: typeof g.epithet === 'string' ? g.epithet : '',
        rarity: g.rarity,
        stats: stats,
        portrait: typeof g.portrait === 'number' ? g.portrait : 1,
        assignment: assignIds.indexOf(g.assignment) >= 0 ? g.assignment : 'idle',
        fudai: g.fudai === true, // 譜代家臣（前の代から仕えている）
        front: typeof g.front === 'string' ? g.front : '', // 軍団長の方面（目標の敵城。'' はおまかせ）
        post: typeof g.post === 'string' ? g.post : '',   // 城代の担当の自領（'' は未設定）
      };
    });
    const maxId = s.generals.reduce(function (m, g) { return Math.max(m, g.id); }, 0);
    s.nextGeneralId = Math.max(s.nextGeneralId, maxId + 1);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // { 拠点ID: 数値 } の形のうち、有効な拠点で 0 以上の数値だけ残す
  function sanitizeTroopMap(obj, isValid) {
    const out = {};
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(function (id) {
        if (isValid(id) && isNum(obj[id]) && obj[id] >= 0) out[id] = obj[id];
      });
    }
    return out;
  }

  // 地図と部隊：存在しない拠点や壊れた部隊を取り除く
  // merge は既定に無いキーを落とすので、拠点IDをキーにした表は raw から読む
  function sanitizeMap(s, raw) {
    const rawMap = raw && raw.map && typeof raw.map === 'object' ? raw.map : {};
    const stageCount = Game.data.STAGES.length;
    if (!Number.isInteger(s.map.stage) || s.map.stage < 1 || s.map.stage > stageCount) s.map.stage = 1;
    const stage = Game.data.STAGES[s.map.stage - 1];
    const validIds = ['home'].concat(stage.castles.map(function (c) { return c.id; }));
    const isValid = function (id) { return validIds.indexOf(id) >= 0; };

    const owned = Array.isArray(s.map.owned) ? s.map.owned.filter(isValid) : [];
    if (owned.indexOf('home') < 0) owned.unshift('home');
    s.map.owned = owned.filter(function (id, i) { return owned.indexOf(id) === i; });

    // この代で落とした城（古いセーブには無いので、今の自領で代わりにする）と、旧領
    const wonRaw = Array.isArray(rawMap.won) ? rawMap.won : s.map.owned;
    s.map.won = wonRaw.filter(function (id, i, arr) { return id !== 'home' && isValid(id) && arr.indexOf(id) === i; });
    const allCastleIds = [];
    Game.data.STAGES.forEach(function (st) { st.castles.forEach(function (c) { allCastleIds.push(c.id); }); });
    s.formerLands = (Array.isArray(raw && raw.formerLands) ? raw.formerLands : []).filter(function (id, i, arr) {
      return allCastleIds.indexOf(id) >= 0 && arr.indexOf(id) === i;
    });

    s.map.cleared = (Array.isArray(rawMap.cleared) ? rawMap.cleared : []).filter(function (n, i, arr) {
      return Number.isInteger(n) && n >= 1 && n < s.map.stage && arr.indexOf(n) === i;
    });
    const heirloomIds = Game.data.HEIRLOOMS.map(function (h) { return h.id; });
    s.heirlooms = (Array.isArray(s.heirlooms) ? s.heirlooms : []).map(function (id) {
      return id === 'elixir' ? 'secretBook' : id; // 寿命の廃止で延命の秘薬は秘伝の書に
    }).filter(function (id, i, arr) {
      return heirloomIds.indexOf(id) >= 0 && arr.indexOf(id) === i;
    });
    // 方面・担当の城が今の地図に無ければ外す
    s.generals.forEach(function (g) {
      if (g.front && (!isValid(g.front) || g.front === 'home')) g.front = '';
      if (g.post && s.map.owned.indexOf(g.post) < 0) g.post = '';
    });

    s.map.garrisons = sanitizeTroopMap(rawMap.garrisons, function (id) {
      return id !== 'home' && s.map.owned.indexOf(id) >= 0;
    });
    s.map.enemyTroops = sanitizeTroopMap(rawMap.enemyTroops, function (id) {
      return id !== 'home' && isValid(id) && s.map.owned.indexOf(id) < 0;
    });

    // 侵攻軍
    const invStates = ['marching', 'field', 'sieging'];
    const invList = Array.isArray(s.invasions) ? s.invasions : [];
    s.invasions = invList.filter(function (v) {
      return v && typeof v === 'object' && typeof v.id === 'number' &&
        isValid(v.from) && isValid(v.to) && invStates.indexOf(v.state) >= 0 &&
        [v.troops, v.startTroops, v.elapsed, v.duration].every(isNum);
    }).map(function (v) {
      return {
        id: v.id, from: v.from, to: v.to, troops: v.troops, startTroops: v.startTroops,
        state: v.state, elapsed: v.elapsed, duration: v.duration,
        autoSent: v.autoSent === true, // 自動迎撃の援軍を送ったか
      };
    });
    const invIds = s.invasions.map(function (v) { return v.id; });
    const maxInv = invIds.reduce(function (m, id) { return Math.max(m, id); }, 0);
    s.nextInvasionId = Math.max(s.nextInvasionId, maxInv + 1);

    // 部隊
    const states = ['marching', 'returning', 'sieging', 'field'];
    const generalIds = s.generals.map(function (g) { return g.id; });
    const list = Array.isArray(s.units) ? s.units : [];
    s.units = list.map(function (u) {
      // ステップ3aのセーブ：着陣（arrived）は攻城戦（sieging）に読み替える
      if (u && u.state === 'arrived') u.state = 'sieging';
      return u;
    }).filter(function (u) {
      return u && typeof u === 'object' && typeof u.id === 'number' &&
        isValid(u.from) && isValid(u.to) && states.indexOf(u.state) >= 0 &&
        [u.troops, u.elapsed, u.duration].every(isNum);
    }).map(function (u) {
      const fieldWith = invIds.indexOf(u.fieldWith) >= 0 ? u.fieldWith : null;
      return {
        id: u.id, from: u.from, to: u.to, troops: u.troops,
        base: isValid(u.base) ? u.base : (u.state === 'returning' ? u.to : u.from),
        generalId: generalIds.indexOf(u.generalId) >= 0 ? u.generalId : null,
        // 野戦の相手がいなければ進軍に戻す
        state: u.state === 'field' && fieldWith === null ? 'marching' : u.state,
        elapsed: u.elapsed, duration: u.duration,
        startTroops: isNum(u.startTroops) ? u.startTroops : u.troops,
        fieldWith: fieldWith,
        pursuit: isNum(u.pursuit) ? u.pursuit : 0,
        pursuitFrom: isValid(u.pursuitFrom) ? u.pursuitFrom : null,
        pursuitInvasion: invIds.indexOf(u.pursuitInvasion) >= 0 ? u.pursuitInvasion : null,
        path: Array.isArray(u.path) ? u.path.filter(isValid) : [], // 続けて向かう拠点（自動迎撃の援軍）
        autoDefense: u.autoDefense === true,
      };
    });
    const maxId = s.units.reduce(function (m, u) { return Math.max(m, u.id); }, 0);
    s.nextUnitId = Math.max(s.nextUnitId, maxId + 1);

    // 合戦（ステップ3bのセーブは castleId だけなので攻城戦として読む）
    const battles = Array.isArray(s.battles) ? s.battles : [];
    s.battles = battles.map(function (b) {
      if (!b || typeof b !== 'object') return null;
      const kind = b.kind || 'siege';
      let ref;
      if (kind === 'siege') ref = isValid(b.castleId) && b.castleId !== 'home' ? b.castleId : null;
      else if (kind === 'defense' || kind === 'field') ref = invIds.indexOf(b.invasionId) >= 0 ? b.invasionId : null;
      if (ref === null || ref === undefined) return null;
      const out = {
        key: kind + ':' + ref, kind: kind,
        castleId: kind === 'siege' ? ref : null,
        invasionId: kind === 'siege' ? null : ref,
      };
      ['elapsed', 'chargeLeft', 'rallyLeft', 'cdCharge', 'cdRally', 'cdAmbush', 'ownStart'].forEach(function (k) {
        out[k] = isNum(b[k]) ? Math.max(0, b[k]) : 0;
      });
      return out;
    }).filter(function (b) { return b !== null; });

    // 合戦の記録が欠けた侵攻軍：野戦なら進軍に戻し、防衛戦なら記録を作り直す
    s.invasions.forEach(function (v) {
      const kind = v.state === 'field' ? 'field' : v.state === 'sieging' ? 'defense' : null;
      if (kind && !s.battles.some(function (b) { return b.key === kind + ':' + v.id; })) {
        if (kind === 'field') v.state = 'marching';
        else s.battles.push({ key: 'defense:' + v.id, kind: 'defense', castleId: null, invasionId: v.id,
          elapsed: 0, chargeLeft: 0, rallyLeft: 0, cdCharge: 0, cdRally: 0, cdAmbush: 0, ownStart: 0 });
      }
    });
  }

  // 特性 [{ id, grade }]。ステップ4aのセーブ（trait: 'domestic' のような文字列）は ★1 として読む
  function sanitizeTraits(obj) {
    let list = Array.isArray(obj.traits) ? obj.traits : [];
    if (!Array.isArray(obj.traits) && typeof obj.trait === 'string' && obj.trait) list = [{ id: obj.trait, grade: 1 }];
    const out = [];
    list.forEach(function (t) {
      if (t && t.id === 'longevity') t = { id: 'veteran', grade: t.grade }; // 寿命の廃止で長寿型は老練型に
      if (!t || !cfg.TRAITS[t.id] || out.some(function (o) { return o.id === t.id; })) return;
      const grade = Number.isInteger(t.grade) ? Math.min(cfg.TRAIT_GRADE.MAX, Math.max(1, t.grade)) : 1;
      out.push({ id: t.id, grade: grade });
    });
    return out.slice(0, 2);
  }

  function sanitizeLord(l) {
    if (!l || typeof l !== 'object' || typeof l.givenName !== 'string') return null;
    return {
      givenName: l.givenName,
      traits: sanitizeTraits(l),
      portrait: isNum(l.portrait) ? l.portrait : 1,
      age: isNum(l.age) ? Math.max(0, l.age) : 0,
      samples: (Array.isArray(l.samples) ? l.samples : []).filter(function (p) {
        return Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
      }),
      peakGrowth: isNum(l.peakGrowth) ? Math.max(0, l.peakGrowth) : 0,
    };
  }

  // 当主・歴代の記録・継承の手続き
  function sanitizeLineage(s, raw) {
    s.lord = sanitizeLord(raw.lord) || s.lord;
    s.lineage = (Array.isArray(raw.lineage) ? raw.lineage : []).filter(function (r) {
      return r && typeof r === 'object' && Number.isInteger(r.generation) && typeof r.givenName === 'string';
    }).map(function (r) {
      return {
        generation: r.generation,
        givenName: r.givenName,
        traits: sanitizeTraits(r),
        portrait: isNum(r.portrait) ? r.portrait : 1,
        kokudaka: isNum(r.kokudaka) ? r.kokudaka : 0,
        prestige: isNum(r.prestige) ? r.prestige : 0,
        seconds: isNum(r.seconds) ? r.seconds : 0,
        virtue: isNum(r.virtue) ? r.virtue : 0,
        time: isNum(r.time) ? r.time : null,                     // 隠居したときの合計プレイ時間（古いセーブには無い）
        stage: Number.isInteger(r.stage) ? r.stage : null,       // 隠居したときの段階（古いセーブには無い）
      };
    });
    const sc = raw.succession;
    if (sc && typeof sc === 'object' && Array.isArray(sc.candidates)) {
      const candidates = sc.candidates.map(sanitizeLord).filter(function (c) { return c; });
      const generalIds = s.generals.map(function (g) { return g.id; });
      s.succession = candidates.length ? {
        step: ['summary', 'precepts', 'heir', 'retainer', 'ceremony'].indexOf(sc.step) >= 0 ? sc.step : 'summary',
        candidates: candidates,
        chosen: Number.isInteger(sc.chosen) && sc.chosen >= 0 && sc.chosen < candidates.length ? sc.chosen : null,
        retainers: (Array.isArray(sc.retainers) ? sc.retainers : []).filter(function (id, i, arr) {
          return generalIds.indexOf(id) >= 0 && arr.indexOf(id) === i;
        }),
        gain: isNum(sc.gain) ? sc.gain : null, // 隠居した時点の得る家格（古いセーブは null → その場で計算）
      } : null;
    } else {
      s.succession = null;
    }
  }

  // 家訓：知っている家訓だけ、1〜最大Lv の整数で残す（merge は既定に無いキーを落とすので raw から読む）
  function sanitizePrecepts(s, raw) {
    const src = raw && raw.precepts && typeof raw.precepts === 'object' ? raw.precepts : {};
    s.precepts = {};
    Object.keys(cfg.PRECEPTS).forEach(function (id) {
      const v = src[id];
      if (!Number.isInteger(v) || v <= 0) return;
      const max = cfg.PRECEPTS[id].max;
      s.precepts[id] = max === null ? v : Math.min(max, v);
    });
    s.virtue = Math.max(0, s.virtue);
    s.generationVirtue = Math.max(0, s.generationVirtue);
  }

  // 稲刈りと金山：道具の番号・深さを範囲に収める
  function sanitizeWork(s) {
    const w = s.work;
    const clampIndex = function (v, list) { return Number.isInteger(v) ? Math.min(list.length - 1, Math.max(0, v)) : 0; };
    w.view = w.view === 'mine' ? 'mine' : 'rice';
    w.sickle = clampIndex(w.sickle, cfg.WORK.SICKLES);
    w.pickaxe = clampIndex(w.pickaxe, cfg.WORK.PICKAXES);
    ['depth', 'maxDepth', 'lastMaxDepth'].forEach(function (k) { w[k] = Math.max(0, Math.floor(w[k])); });
    w.maxDepth = Math.max(w.maxDepth, w.depth);
    w.manualRate.rice = Math.max(0, w.manualRate.rice);
    w.manualRate.mine = Math.max(0, w.manualRate.mine);
    w.blastCd = Math.max(0, w.blastCd);
  }

  // イベント・周回：知っているIDだけ残し、記録の形を確かめる
  function sanitizeEvents(s, raw) {
    const ids = Object.keys(cfg.EVENTS);
    const known = function (list) {
      return (Array.isArray(list) ? list : []).filter(function (id, i, arr) { return ids.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    };
    s.eventsDone = known(raw.eventsDone);
    s.pendingEvents = known(raw.pendingEvents).filter(function (id) { return s.eventsDone.indexOf(id) < 0; });
    s.eventEffects.goodRecruit = s.eventEffects.goodRecruit === true;
    s.eventEffects.heirGradeUp = Math.max(0, s.eventEffects.heirGradeUp);
    s.eventEffects.heirExtra = Math.max(0, Math.floor(s.eventEffects.heirExtra));
    s.genBuffs.power = s.genBuffs.power > 0 ? s.genBuffs.power : 1;
    s.genBuffs.homeDefense = s.genBuffs.homeDefense > 0 ? s.genBuffs.homeDefense : 1;
    const record = function (r) {
      return r && typeof r === 'object' && isNum(r.time) && isNum(r.generations) && isNum(r.maxKokudaka)
        ? { cycle: isNum(r.cycle) ? r.cycle : 1, time: r.time, generations: r.generations, maxKokudaka: r.maxKokudaka } : null;
    };
    s.ending = s.flags.unified ? record(raw.ending) || { time: s.stats.playTime, generations: s.generation, maxKokudaka: s.kokudaka } : null;
    s.cycles = (Array.isArray(raw.cycles) ? raw.cycles : []).map(record).filter(function (r) { return r; });
    s.cycle = Number.isInteger(s.cycle) && s.cycle >= 1 ? s.cycle : 1;
    s.stats.stageLog = (Array.isArray(s.stats.stageLog) ? s.stats.stageLog : []).filter(function (r) {
      return r && typeof r === 'object' && Number.isInteger(r.stage) && Number.isInteger(r.generation) && isNum(r.time);
    }).map(function (r) { return { stage: r.stage, generation: r.generation, time: r.time }; });
  }

  // 読み込んだ JSON をゲーム状態にする（古い形式・壊れた値はここで直す）
  function fromParsed(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('セーブデータの形が違います');
    parsed = migrate(parsed);
    const loaded = merge(create(), parsed);
    sanitizeGenerals(loaded);
    sanitizeMap(loaded, parsed);
    sanitizeLineage(loaded, parsed);
    sanitizePrecepts(loaded, parsed);
    sanitizeWork(loaded);
    sanitizeEvents(loaded, parsed);
    return loaded;
  }

  // 書き出し用の文字列：UTF-8 の JSON を Base64 にする（家名などの日本語も通る）
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function decode(text) {
    const bin = atob(text.replace(/\s+/g, '')); // 貼り付けで混ざった改行・空白は無視
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const state = {
    current: create(),
    lastSavedAt: 0,

    create: create,

    save: function () {
      try {
        state.current.version = cfg.SAVE_VERSION;
        localStorage.setItem(cfg.SAVE_KEY, JSON.stringify(state.current));
        state.lastSavedAt = Date.now();
        return true;
      } catch (e) {
        console.error('セーブに失敗しました', e);
        return false;
      }
    },

    load: function () {
      try {
        const raw = localStorage.getItem(cfg.SAVE_KEY);
        if (!raw) return false;
        state.current = fromParsed(JSON.parse(raw));
        return true;
      } catch (e) {
        console.error('ロードに失敗しました', e);
        state.current = create();
        return false;
      }
    },

    // セーブの書き出し（Base64 の文字列。別のPCへ移すときに使う）
    exportString: function () {
      state.current.version = cfg.SAVE_VERSION;
      return encode(state.current);
    },

    // 書き出した文字列を読み込んでセーブする。読めなければ false（今の状態はそのまま）
    importString: function (text) {
      let loaded;
      try {
        loaded = fromParsed(decode(String(text).trim()));
      } catch (e) {
        console.error('読み込みに失敗しました', e);
        return false;
      }
      state.current = loaded;
      state.save();
      return true;
    },

    reset: function () {
      try { localStorage.removeItem(cfg.SAVE_KEY); } catch (e) { /* 無視 */ }
      state.current = create();
      state.lastSavedAt = 0;
    },
  };

  Game.state = state;
})();

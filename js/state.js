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
      formerLands: [],   // 旧領：前の代までに落とした敵城のID（守備兵が 1/10 になる）
      lineage: [],       // 歴代当主の記録
      succession: null,  // 継承の手続き中（null でなければ時間を止めて継承画面を出す）
      resources: { rice: 0, gold: 0, troops: 0, merit: 0 }, // troops = 本拠地の待機兵
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
      heirlooms: [],     // 手に入れた家宝のID
      units: [],         // 出陣中の部隊
      nextUnitId: 1,
      invasions: [],     // 敵の侵攻軍
      nextInvasionId: 1,
      battles: [],       // 進行中の合戦（攻城戦・防衛戦・野戦。采配の効果時間・クールダウン）
      flags: { firstVictory: false, unified: false },
      settings: { bulk: cfg.DEFAULT_BULK },
      stats: { playTime: 0, battlesWon: 0 },
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
      };
    });
    const sc = raw.succession;
    if (sc && typeof sc === 'object' && Array.isArray(sc.candidates)) {
      const candidates = sc.candidates.map(sanitizeLord).filter(function (c) { return c; });
      const generalIds = s.generals.map(function (g) { return g.id; });
      s.succession = candidates.length ? {
        step: ['summary', 'heir', 'retainer', 'ceremony'].indexOf(sc.step) >= 0 ? sc.step : 'summary',
        candidates: candidates,
        chosen: Number.isInteger(sc.chosen) && sc.chosen >= 0 && sc.chosen < candidates.length ? sc.chosen : null,
        retainers: (Array.isArray(sc.retainers) ? sc.retainers : []).filter(function (id, i, arr) {
          return generalIds.indexOf(id) >= 0 && arr.indexOf(id) === i;
        }),
      } : null;
    } else {
      s.succession = null;
    }
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
        const parsed = migrate(JSON.parse(raw));
        const loaded = merge(create(), parsed);
        sanitizeGenerals(loaded);
        sanitizeMap(loaded, parsed);
        sanitizeLineage(loaded, parsed);
        state.current = loaded;
        return true;
      } catch (e) {
        console.error('ロードに失敗しました', e);
        state.current = create();
        return false;
      }
    },

    reset: function () {
      try { localStorage.removeItem(cfg.SAVE_KEY); } catch (e) { /* 無視 */ }
      state.current = create();
      state.lastSavedAt = 0;
    },
  };

  Game.state = state;
})();

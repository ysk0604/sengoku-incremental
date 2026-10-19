// 画面描画とボタン操作
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  const data = Game.data;
  const fmt = Game.format;
  const sys = Game.systems;

  const els = {};
  const facilityEls = {};
  const bulkEls = {};

  function $(id) { return document.getElementById(id); }
  function cur() { return Game.state.current; }

  // 変化したときだけ DOM を書き換える
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  function setClass(el, cls, on) {
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }
  function setDisabled(el, v) {
    if (el.disabled !== v) el.disabled = v;
  }
  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function costText(cost) {
    return Object.keys(cost).map(function (res) {
      return data.RESOURCES[res].name + ' ' + fmt.num(cost[res]);
    }).join(' ／ ');
  }

  function facilityName(id) {
    return data.FACILITIES.find(function (f) { return f.id === id; }).name;
  }

  // ---- 構築 ----

  function buildFacilities() {
    const list = $('facility-list');
    data.FACILITIES.forEach(function (def) {
      const row = make('div', 'facility');

      const info = make('div', 'facility-info');
      const head = make('div', 'facility-head');
      const name = make('span', 'facility-name', def.name);
      const level = make('span', 'facility-level');
      head.appendChild(name);
      head.appendChild(level);
      const desc = make('div', 'facility-desc', def.desc);
      const effect = make('div', 'facility-effect');
      const milestone = make('div', 'facility-milestone');
      info.appendChild(head);
      info.appendChild(desc);
      info.appendChild(effect);
      info.appendChild(milestone);

      const action = make('div', 'facility-action');
      const cost = make('div', 'facility-cost');
      const button = make('button', 'btn build-button');
      button.addEventListener('click', function () {
        if (sys.build(cur(), def.id)) update();
      });
      action.appendChild(cost);
      action.appendChild(button);

      const lock = make('div', 'facility-lock');
      const u = cfg.FACILITIES[def.id].unlock;
      if (u) {
        lock.textContent = '解放条件：' + (u.flag ? data.FLAG_NAMES[u.flag] : facilityName(u.facility) + ' Lv' + u.level);
      }

      row.appendChild(info);
      row.appendChild(action);
      row.appendChild(lock);
      list.appendChild(row);

      facilityEls[def.id] = { row, level, effect, milestone, cost, button };
    });
  }

  function buildBulkButtons() {
    const box = $('bulk-buttons');
    cfg.BULK_OPTIONS.forEach(function (opt) {
      const b = make('button', 'btn bulk-button', opt.label);
      b.addEventListener('click', function () {
        cur().settings.bulk = opt.key;
        update();
      });
      box.appendChild(b);
      bulkEls[opt.key] = b;
    });
  }

  function bindClick() {
    const btn = $('click-button');
    btn.addEventListener('click', function () {
      const amount = sys.click(cur());
      spawnFloat(btn, '+' + fmt.num(amount));
      update();
    });
  }

  // クリック時に浮かび上がる数字（transform / opacity のみのアニメーション）
  function spawnFloat(parent, text) {
    const f = make('span', 'float-text', text);
    f.style.left = (35 + Math.random() * 30) + '%';
    f.addEventListener('animationend', function () { f.remove(); });
    parent.appendChild(f);
  }

  // ---- 武将 ----

  // 武将カードは登用・配置変更のときだけ作り直す（毎ティックは作り直さない）
  let generalsSignature = null;
  let generalsStateRef = null; // データ削除で状態が作り直されたら、同じIDでも描き直す
  let renderedGeneralIds = {};

  let generalStatusEls = {}; // 毎ティック書き換える一行（軍団長の次の目標など）

  // カードの作り直しが必要になる変化：配置・出陣・方面・持ち場・選べる城の顔ぶれ
  function generalsKey(s) {
    return s.map.stage + '|' + s.map.owned.join(',') + '|' + s.generals.map(function (g) {
      return g.id + ':' + g.assignment + ':' + g.front + ':' + g.post + (sys.isGeneralDeployed(s, g.id) ? ':d' : '');
    }).join(',');
  }

  function pct(v) {
    return Math.round(v * 100) + '%';
  }

  // 方面・持ち場の選択肢
  function makeSelect(options, value, onChange) {
    const sel = make('select', 'general-select');
    options.forEach(function (o) { sel.appendChild(new Option(o.label, o.value)); });
    sel.value = value;
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  function buildGeneralCard(s, g) {
    const card = make('div', 'general-card rarity-' + g.rarity);

    const portrait = make('div', 'portrait', '肖像');
    portrait.title = 'portrait_' + String(g.portrait).padStart(2, '0');
    card.appendChild(portrait);

    const body = make('div', 'general-body');
    const head = make('div', 'general-head');
    head.appendChild(make('span', 'rarity-badge', data.RARITY_NAMES[g.rarity]));
    if (g.fudai) head.appendChild(make('span', 'fudai-badge', '譜代'));
    if (g.epithet) head.appendChild(make('span', 'epithet', '〈' + g.epithet + '〉'));
    head.appendChild(make('span', 'general-name', g.surname + ' ' + g.givenName));
    body.appendChild(head);

    // 配置先ごとに効く能力を目立たせる
    const keyStat = { domestic: 'politics', commander: 'leadership', castellan: 'leadership' }[g.assignment];
    const stats = make('div', 'general-stats');
    data.STATS.forEach(function (st) {
      const item = make('div', 'stat' + (st.id === keyStat ? ' stat-key' : ''));
      item.appendChild(make('span', 'stat-name', st.name));
      item.appendChild(make('span', 'stat-value', String(g.stats[st.id])));
      stats.appendChild(item);
    });
    body.appendChild(stats);

    const deployed = sys.isGeneralDeployed(s, g.id);
    const assign = make('div', 'assign-buttons');
    data.ASSIGNMENTS.forEach(function (a) {
      const b = make('button', 'btn assign-button' + (g.assignment === a.id ? ' active' : ''), a.name);
      b.disabled = deployed;
      b.addEventListener('click', function () {
        if (sys.assign(cur(), g.id, a.id)) update();
      });
      assign.appendChild(b);
    });
    body.appendChild(assign);

    // 軍団長の方面・城代の持ち場
    if (g.assignment === 'commander') {
      const row = make('div', 'general-option');
      row.appendChild(make('span', 'general-option-label', '方面'));
      const opts = [{ label: 'おまかせ（勝てる城から）', value: '' }];
      sys.stageData(s).castles.forEach(function (c) {
        if (!sys.isOwned(s, c.id) && sys.isVisible(s, c.id)) opts.push({ label: c.name + 'へ', value: c.id });
        else if (!sys.isOwned(s, c.id)) opts.push({ label: c.boss ? '？？？（ボス）へ' : '？？？へ', value: c.id });
      });
      row.appendChild(makeSelect(opts, g.front, function (v) {
        if (sys.setFront(cur(), g.id, v)) update();
      }));
      body.appendChild(row);
    } else if (g.assignment === 'castellan') {
      const row = make('div', 'general-option');
      row.appendChild(make('span', 'general-option-label', '持ち場'));
      const opts = [{ label: '（城を選ぶ）', value: '' }];
      s.map.owned.forEach(function (id) { opts.push({ label: sys.node(s, id).name, value: id }); });
      row.appendChild(makeSelect(opts, g.post, function (v) {
        if (sys.setPost(cur(), g.id, v)) update();
      }));
      body.appendChild(row);
    }

    const G = cfg.GENERALS;
    const effect = make('div', 'general-effect');
    if (deployed && g.assignment !== 'commander') {
      effect.textContent = '出陣中（帰還するまで配置を変えられません）';
    } else if (g.assignment === 'domestic') {
      effect.textContent = '全生産 +' + pct(g.stats.politics * G.DOMESTIC_PER_POLITICS);
    } else if (g.assignment === 'commander') {
      effect.textContent = '率いる部隊の戦力 +' + pct(g.stats.leadership * cfg.MAP.LEADER_PER_LEADERSHIP) +
        '・同時に動かせる部隊 +1・自動進軍';
    } else if (g.assignment === 'castellan') {
      effect.textContent = g.post
        ? sys.node(s, g.post).name + 'の守備戦力 +' + pct(g.stats.leadership * G.CASTELLAN_PER_LEADERSHIP)
        : '持ち場の城を選ぶと、その城の守備戦力 +' + pct(g.stats.leadership * G.CASTELLAN_PER_LEADERSHIP);
    }
    body.appendChild(effect);

    const status = make('div', 'general-status');
    body.appendChild(status);
    generalStatusEls[g.id] = status;

    card.appendChild(body);
    return card;
  }

  // 軍団長の今の様子（毎ティック）
  function commanderStatus(s, g) {
    const u = s.units.find(function (x) { return x.generalId === g.id; });
    if (u) {
      if (u.state === 'returning') return '帰還中';
      return (u.state === 'sieging' ? '攻城戦中：' : u.state === 'field' ? '野戦中：' : '進軍中：') + sys.node(s, u.to).name;
    }
    if (sys.unitsInUse(s) >= sys.maxUnits(s)) return '出陣待ち（部隊がすべて出ている）';
    const plan = sys.commanderPlan(s, g);
    if (plan) return '出陣：' + sys.node(s, plan.from).name + ' → ' + sys.node(s, plan.to).name;
    return '勝てそうな城がない（守備戦力の' + cfg.GENERALS.AUTO_MIN_POWER_RATIO + '倍の兵が隣の自領に要る）';
  }

  function updateGenerals(s) {
    const key = generalsKey(s);
    if (key !== generalsSignature || s !== generalsStateRef) {
      const firstRender = generalsStateRef !== s;
      generalsSignature = key;
      generalsStateRef = s;
      generalStatusEls = {};
      const list = els.generalList;
      list.textContent = '';
      s.generals.forEach(function (g) {
        const card = buildGeneralCard(s, g);
        // 登場のアニメーションは新しく登用した武将だけ
        if (!firstRender && !renderedGeneralIds[g.id]) card.classList.add('is-new');
        list.appendChild(card);
      });
      renderedGeneralIds = {};
      s.generals.forEach(function (g) { renderedGeneralIds[g.id] = true; });
      setClass(els.generalEmpty, 'hidden', s.generals.length > 0);
    }
    s.generals.forEach(function (g) {
      const el = generalStatusEls[g.id];
      if (el) setText(el, g.assignment === 'commander' ? commanderStatus(s, g) : '');
    });

    const cost = sys.recruitCost(s);
    setText(els.recruitCost, '費用 ' + costText(cost));
    setDisabled(els.recruitButton, !sys.canAfford(s, cost));
    setClass(els.recruitCost, 'short', !sys.canAfford(s, cost));

    setText(els.generalCount, String(s.generals.length));
    setText(els.domesticCount, String(s.generals.filter(function (g) { return g.assignment === 'domestic'; }).length));
    setText(els.domesticMult, fmt.mult(sys.domesticMultiplier(s)));
  }

  function bindGenerals() {
    els.recruitButton.addEventListener('click', function () {
      if (sys.recruit(cur())) update();
    });
  }

  // ---- 地図 ----

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAP_W = 1000;
  const MAP_H = 560;

  // 画面だけの一時状態（セーブしない）
  const mapUi = {
    origin: null,     // 選択中の出発地
    message: '',      // 直前の操作の結果
    stageRef: null,   // 描画済みの段階（段階が変わったら作り直す）
    stateRef: null,
    nodeEls: {},
    roadEls: [],
    unitEls: {},
    unitListKey: null,
    unitRowEls: {},
    leaderKey: null,
    troopsTouched: false, // 兵数を手で選ぶまでは、待機兵の全軍に合わせる
    battleKey: null,
    battleEls: {},
    invasionEls: {},
  };

  function svg(tag, attrs, cls) {
    const el = document.createElementNS(SVG_NS, tag);
    if (cls) el.setAttribute('class', cls);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function generalName(s, id) {
    const g = s.generals.find(function (x) { return x.id === id; });
    return g ? g.surname + ' ' + g.givenName : 'なし';
  }

  function nodeName(s, id) {
    return sys.node(s, id).name;
  }

  function buildMap(s) {
    const root = els.mapSvg;
    root.textContent = '';
    root.setAttribute('viewBox', '0 0 ' + MAP_W + ' ' + MAP_H);
    mapUi.nodeEls = {};
    mapUi.roadEls = [];
    mapUi.unitEls = {};
    mapUi.invasionEls = {};

    const stage = sys.stageData(s);
    const m = stage.map;

    // 侵攻の矢印の先端
    const defs = svg('defs');
    const marker = svg('marker', {
      id: 'invasion-arrowhead', viewBox: '0 0 10 10', refX: 5, refY: 5,
      markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse',
    });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' }, 'invasion-arrowhead'));
    defs.appendChild(marker);
    root.appendChild(defs);

    const decor = svg('g', {}, 'map-decor');
    m.rivers.forEach(function (d) { decor.appendChild(svg('path', { d: d }, 'river')); });
    m.mountains.forEach(function (p) {
      decor.appendChild(svg('path', {
        d: 'M ' + (p.x - 28) + ' ' + (p.y + 16) + ' L ' + p.x + ' ' + (p.y - 18) + ' L ' + (p.x + 28) + ' ' + (p.y + 16) + ' Z',
      }, 'mountain'));
    });
    root.appendChild(decor);

    const roads = svg('g', {}, 'map-roads');
    m.roads.forEach(function (r) {
      const a = m.positions[r[0]];
      const b = m.positions[r[1]];
      const line = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, 'road');
      roads.appendChild(line);
      mapUi.roadEls.push({ el: line, a: r[0], b: r[1] });
    });
    root.appendChild(roads);

    const nodes = svg('g', {}, 'map-nodes');
    sys.mapNodes(s).forEach(function (n) {
      const g = svg('g', { transform: 'translate(' + n.x + ',' + n.y + ')' }, 'node');
      g.appendChild(svg('circle', { r: 34 }, 'node-ring'));
      g.appendChild(svg('circle', { r: 24 }, 'node-body'));
      const glyph = svg('text', { y: 8 }, 'node-glyph');
      g.appendChild(glyph);
      const label = svg('text', { y: 46 }, 'node-label');
      g.appendChild(label);
      const sub = svg('text', { y: 64 }, 'node-sub');
      g.appendChild(sub);
      g.addEventListener('click', function () { onNodeClick(n.id); });
      nodes.appendChild(g);
      mapUi.nodeEls[n.id] = { g: g, glyph: glyph, label: label, sub: sub, node: n };
    });
    root.appendChild(nodes);

    const invasions = svg('g', {}, 'map-invasions');
    root.appendChild(invasions);
    els.mapInvasions = invasions;

    const units = svg('g', {}, 'map-units');
    root.appendChild(units);
    els.mapUnits = units;

    // 未解放の段階の大国（地図の外側に兵力つきで見せる）
    const far = els.farPowers;
    far.textContent = '';
    data.STAGES.forEach(function (st) {
      if (st.stage <= s.map.stage) return;
      const row = make('div', 'far-row');
      row.appendChild(make('span', 'far-stage', '段階' + fmt.kanji(st.stage) + '　' + st.name));
      const list = make('span', 'far-list');
      st.castles.forEach(function (c) {
        const item = make('span', 'far-item' + (c.boss ? ' boss' : ''));
        item.appendChild(make('span', 'far-name', c.name));
        item.appendChild(make('span', 'far-troops', fmt.num(c.troops)));
        list.appendChild(item);
      });
      row.appendChild(list);
      far.appendChild(row);
    });
    setClass(far, 'hidden', far.childNodes.length === 0);

    buildPacifiedMaps(s);
    setText(els.mapTitle, '段階' + fmt.kanji(stage.stage) + '　' + stage.name + '（' + stage.region + '）');
  }

  // 平定済みの段階の地図を縮小して並べる
  function buildPacifiedMaps(s) {
    const box = els.pacifiedMaps;
    box.textContent = '';
    s.map.cleared.slice().sort().forEach(function (n) {
      if (n === s.map.stage) return;
      const st = data.STAGES[n - 1];
      const m = st.map;
      const item = make('div', 'pacified-item');
      const mini = svg('svg', { viewBox: '0 0 ' + MAP_W + ' ' + MAP_H }, 'pacified-svg');
      m.rivers.forEach(function (d) { mini.appendChild(svg('path', { d: d }, 'river')); });
      m.roads.forEach(function (r) {
        const a = m.positions[r[0]];
        const b = m.positions[r[1]];
        mini.appendChild(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, 'road road-own'));
      });
      Object.keys(m.positions).forEach(function (id) {
        const p = m.positions[id];
        mini.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 30 }, 'pacified-node'));
      });
      item.appendChild(mini);
      item.appendChild(make('div', 'pacified-label', '段階' + fmt.kanji(n) + ' ' + st.region + '　平定済み'));
      box.appendChild(item);
    });
    setClass(box, 'hidden', box.childNodes.length === 0);
  }

  function onNodeClick(id) {
    const s = cur();
    mapUi.message = '';
    // 出発地を選んだあとに隣の自領を押したら補充。それ以外の自領は出発地の選択（切り替え）
    const reinforce = !!mapUi.origin && sys.isReinforce(s, mapUi.origin, id);
    if (sys.isOwned(s, id) && !reinforce) {
      mapUi.origin = mapUi.origin === id ? null : id;
      mapUi.troopsTouched = false; // 出発地を変えたら、その拠点の全兵に合わせ直す
    } else if (!mapUi.origin) {
      if (sys.isVisible(s, id)) mapUi.message = '先に出発する自領をクリックしてください';
    } else if (sys.isVisible(s, id)) {
      const troops = Number(els.formTroops.value);
      const leader = els.formGeneral.value === '' ? null : Number(els.formGeneral.value);
      const err = sys.dispatchError(s, mapUi.origin, id, troops, leader);
      if (err) {
        mapUi.message = err;
      } else {
        sys.dispatch(s, mapUi.origin, id, troops, leader);
        mapUi.message = nodeName(s, id) + (reinforce ? 'へ補充を送りました' : 'へ出陣しました');
        mapUi.troopsTouched = false;
        mapUi.origin = null;
      }
    }
    update();
  }

  function updateMapNodes(s) {
    Object.keys(mapUi.nodeEls).forEach(function (id) {
      const e = mapUi.nodeEls[id];
      const n = e.node;
      const owned = sys.isOwned(s, id);
      const visible = sys.isVisible(s, id);
      const targetable = !!mapUi.origin && sys.canTarget(s, mapUi.origin, id);

      setClass(e.g, 'own', owned);
      setClass(e.g, 'enemy', !owned && visible);
      setClass(e.g, 'fog', !visible);
      setClass(e.g, 'boss', !!n.boss && visible);
      setClass(e.g, 'origin', mapUi.origin === id);
      setClass(e.g, 'targetable', targetable && !owned);
      setClass(e.g, 'reinforce-target', targetable && owned);
      setClass(e.g, 'sieging', !owned && !!sys.battleAt(s, id));
      setClass(e.g, 'invaded', owned && s.invasions.some(function (v) { return v.to === id; }));
      setClass(e.g, 'former', !owned && visible && sys.isFormerLand(s, id));

      if (!visible) {
        setText(e.glyph, '？');
        setText(e.label, '');
        setText(e.sub, '');
      } else {
        setText(e.glyph, n.home ? '本' : n.boss ? '将' : '城');
        setText(e.label, n.name);
        let sub;
        if (n.home) {
          sub = '待機兵 ' + fmt.num(Math.floor(s.resources.troops));
        } else if (owned) {
          sub = '自領　守備 ' + fmt.num(Math.floor(sys.troopsAt(s, id))) + (sys.castellansAt(s, id).length ? '（城代）' : '');
        } else {
          const now = sys.enemyTroops(s, id);
          const max = sys.castleMaxTroops(s, id);
          sub = (sys.isFormerLand(s, id) ? '旧領　' : '') + '守備 ' + (now < max ? fmt.num(Math.ceil(now)) + ' / ' : '') +
            fmt.num(max) + (n.boss ? '（ボス）' : '');
        }
        setText(e.sub, sub);
      }
    });

    mapUi.roadEls.forEach(function (r) {
      const va = sys.isVisible(s, r.a);
      const vb = sys.isVisible(s, r.b);
      setClass(r.el, 'hidden', !va && !vb);
      setClass(r.el, 'road-fog', va !== vb);
      setClass(r.el, 'road-own', sys.isOwned(s, r.a) && sys.isOwned(s, r.b));
    });
  }

  // 旗のアイコン（自軍の部隊・敵の侵攻軍で共通）。旗は左右どちらかに出す
  function makeBanner(s, item, cls, layer, left) {
    const g = svg('g', {}, cls);
    const x = left ? -58 : 0;
    g.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: -40 }, 'unit-pole'));
    g.appendChild(svg('rect', { x: x, y: -40, width: 58, height: 22, rx: 2 }, 'unit-banner'));
    const text = svg('text', { x: x + 29, y: -24 }, 'unit-text');
    g.appendChild(text);
    g.appendChild(svg('circle', { r: 5 }, 'unit-dot'));
    // 位置を決めてから追加する（原点から飛んでくるアニメーションを防ぐ）
    const p0 = sys.unitPosition(s, item);
    g.style.transform = 'translate(' + p0.x + 'px,' + p0.y + 'px)';
    layer.appendChild(g);
    return { g: g, text: text, last: '' };
  }

  function moveBanner(s, e, item) {
    const p = sys.unitPosition(s, item);
    const tf = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
    if (e.last !== tf) {
      e.g.style.transform = tf;
      e.last = tf;
    }
  }

  function updateMapInvasions(s) {
    const alive = {};
    s.invasions.forEach(function (v) {
      alive[v.id] = true;
      let e = mapUi.invasionEls[v.id];
      if (!e) {
        const a = sys.node(s, v.from);
        const b = sys.node(s, v.to);
        // 矢印は城の円の手前で止める
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const arrow = svg('line', {
          x1: a.x + ux * 30, y1: a.y + uy * 30, x2: b.x - ux * 40, y2: b.y - uy * 40,
          'marker-end': 'url(#invasion-arrowhead)',
        }, 'invasion-arrow');
        els.mapInvasions.appendChild(arrow);
        const label = svg('text', { x: b.x, y: b.y - 44 }, 'invasion-label');
        els.mapInvasions.appendChild(label);
        e = makeBanner(s, v, 'map-invader', els.mapInvasions, true);
        e.arrow = arrow;
        e.label = label;
        mapUi.invasionEls[v.id] = e;
      }
      moveBanner(s, e, v);
      setText(e.text, fmt.num(Math.ceil(v.troops)));
      const rest = Math.max(0, v.duration - v.elapsed);
      setText(e.label, v.state === 'marching' ? '侵攻 あと' + Math.ceil(rest) + '秒' : v.state === 'field' ? '野戦中' : '防衛戦中');
    });
    Object.keys(mapUi.invasionEls).forEach(function (id) {
      if (!alive[id]) {
        const e = mapUi.invasionEls[id];
        e.g.remove();
        e.arrow.remove();
        e.label.remove();
        delete mapUi.invasionEls[id];
      }
    });
  }

  function updateMapUnits(s) {
    const alive = {};
    s.units.forEach(function (u) {
      alive[u.id] = true;
      let e = mapUi.unitEls[u.id];
      if (!e) {
        e = makeBanner(s, u, 'map-unit', els.mapUnits, false);
        mapUi.unitEls[u.id] = e;
      }
      moveBanner(s, e, u);
      setText(e.text, fmt.num(Math.floor(u.troops)));
      setClass(e.g, 'returning', u.state === 'returning');
    });
    Object.keys(mapUi.unitEls).forEach(function (id) {
      if (!alive[id]) {
        mapUi.unitEls[id].g.remove();
        delete mapUi.unitEls[id];
      }
    });
  }

  function unitStatusText(s, u) {
    const rest = Math.max(0, u.duration - u.elapsed);
    if (u.state === 'marching') {
      return (sys.isOwned(s, u.to) ? '補充に向かう' : '進軍中') + '　あと ' + rest.toFixed(1) + '秒';
    }
    if (u.state === 'returning') {
      return (u.pursuit > 0 ? '退却中（追撃を受けている）' : '帰還中') + '　あと ' + rest.toFixed(1) + '秒';
    }
    if (u.state === 'field') return '野戦中（街道で侵攻軍とぶつかった）';
    return '攻城戦中';
  }

  function updateUnitList(s) {
    const key = s.units.map(function (u) { return u.id + ':' + u.state + ':' + u.from; }).join(',');
    if (key !== mapUi.unitListKey) {
      mapUi.unitListKey = key;
      mapUi.unitRowEls = {};
      const list = els.unitList;
      list.textContent = '';
      s.units.forEach(function (u) {
        const row = make('div', 'unit-row');
        const head = make('div', 'unit-row-head');
        head.appendChild(make('span', 'unit-row-name', '第' + fmt.kanji(u.id) + '隊'));
        const power = make('span', 'unit-row-power');
        head.appendChild(power);
        row.appendChild(head);
        // 帰還中は from/to が入れ替わっているので、表示は「目的地 → 戻り先」の向きのまま見せる
        const route = u.state === 'returning'
          ? nodeName(s, u.from) + ' → ' + nodeName(s, u.to) + '（引き返し）'
          : u.autoDefense
            ? nodeName(s, u.from) + ' → ' + nodeName(s, u.path.length ? u.path[u.path.length - 1] : u.to) + '（自動迎撃の援軍）'
            : nodeName(s, u.from) + ' → ' + nodeName(s, u.to) + (sys.isOwned(s, u.to) ? '（補充）' : '');
        row.appendChild(make('div', 'unit-row-route', route));
        const isCommander = s.generals.some(function (g) { return g.id === u.generalId && g.assignment === 'commander'; });
        row.appendChild(make('div', 'unit-row-leader', '武将：' + generalName(s, u.generalId) + (isCommander ? '（軍団長・自動進軍）' : '')));
        const status = make('div', 'unit-row-status');
        row.appendChild(status);
        if (u.state !== 'returning') {
          const engaged = u.state === 'sieging' || u.state === 'field';
          const b = make('button', 'btn btn-small', engaged ? '退却' : '引き返す');
          b.addEventListener('click', function () {
            if (sys.retreat(cur(), u.id)) update();
          });
          row.appendChild(b);
        }
        list.appendChild(row);
        mapUi.unitRowEls[u.id] = { power: power, status: status };
      });
    }
    s.units.forEach(function (u) {
      const e = mapUi.unitRowEls[u.id];
      setText(e.power, '兵 ' + fmt.num(Math.floor(u.troops)) + '　戦力 ' + fmt.num(sys.unitPower(s, u)));
      setText(e.status, unitStatusText(s, u));
    });
    setText(els.unitCount, sys.unitsInUse(s) + ' / ' + sys.maxUnits(s));
    setClass(els.unitEmpty, 'hidden', s.units.length > 0);
  }

  // 兵数スライダーの元になる兵（出発地を選んでいなければ本拠地）
  function formationSource(s) {
    const origin = mapUi.origin && sys.isOwned(s, mapUi.origin) ? mapUi.origin : 'home';
    return { id: origin, troops: Math.floor(sys.troopsAt(s, origin)) };
  }

  function updateFormation(s) {
    const src = formationSource(s);
    const standby = src.troops;
    setText(els.originLabel, src.id === 'home' ? '本拠地の待機兵' : nodeName(s, src.id) + 'の守備兵');
    setText(els.standbyTroops, fmt.num(standby));

    const slider = els.formTroops;
    if (Number(slider.max) !== standby) slider.max = String(standby);
    setDisabled(slider, standby < cfg.MAP.MIN_UNIT_TROOPS);
    if (!mapUi.troopsTouched && Number(slider.value) !== standby) slider.value = String(standby);
    const troops = Math.min(Number(slider.value), standby);
    setText(els.formTroopsValue, fmt.num(troops));

    // 武将の選択肢は、出陣できる武将が変わったときだけ作り直す
    const leaders = sys.availableLeaders(s);
    const leaderKey = leaders.map(function (g) { return g.id; }).join(',');
    if (leaderKey !== mapUi.leaderKey) {
      mapUi.leaderKey = leaderKey;
      const sel = els.formGeneral;
      const prev = sel.value;
      sel.textContent = '';
      sel.appendChild(new Option('なし', ''));
      leaders.forEach(function (g) {
        sel.appendChild(new Option(g.surname + ' ' + g.givenName + '（統率' + g.stats.leadership + '）', String(g.id)));
      });
      sel.value = leaders.some(function (g) { return String(g.id) === prev; }) ? prev : '';
    }
    const leader = els.formGeneral.value === '' ? null : Number(els.formGeneral.value);
    setText(els.formPower, fmt.num(sys.troopPower(s, troops, leader)));

    // 出発地の選択がもう自領でなければ解除
    if (mapUi.origin && !sys.isOwned(s, mapUi.origin)) mapUi.origin = null;

    let status;
    if (sys.unitsInUse(s) >= sys.maxUnits(s)) {
      status = '部隊がすべて出陣中です（同時に ' + sys.maxUnits(s) + ' 部隊まで）';
    } else if (!mapUi.origin) {
      status = '① 出発する自領（朱色の城）をクリック';
    } else {
      status = '② 攻める敵城か、補充する隣の自領をクリック（出発地：' + nodeName(s, mapUi.origin) + '）';
    }
    setText(els.orderStatus, mapUi.message);
    setText(els.mapHint, status);
    setDisabled(els.orderCancel, !mapUi.origin);
  }

  // ---- 合戦パネル（攻城戦・防衛戦・野戦）----

  const COMMANDS = [
    { id: 'charge', name: '突撃', cd: 'cdCharge' },
    { id: 'rally', name: '鼓舞', cd: 'cdRally' },
    { id: 'ambush', name: '伏兵', cd: 'cdAmbush' },
    { id: 'retreat', name: '退却', cd: null },
  ];

  const BATTLE_IMAGES = { siege: '合戦', defense: '防衛', field: '野戦' };

  function buildBattleCard(s, b) {
    const boss = b.kind === 'siege' && !!sys.castleData(s, b.castleId).boss;
    const card = make('div', 'battle-card battle-' + b.kind + (boss ? ' boss' : ''));

    const head = make('div', 'battle-head');
    head.appendChild(make('div', 'battle-image', boss ? '決戦' : BATTLE_IMAGES[b.kind]));
    const title = make('div', 'battle-title');
    title.appendChild(make('div', 'battle-name', sys.battleTitle(s, b)));
    const buffs = make('div', 'battle-buffs');
    title.appendChild(buffs);
    head.appendChild(title);
    card.appendChild(head);

    function bar(cls, label) {
      const row = make('div', 'bar-row ' + cls);
      row.appendChild(make('span', 'bar-label', label));
      const track = make('div', 'bar-track');
      const fill = make('div', 'bar-fill');
      track.appendChild(fill);
      row.appendChild(track);
      const value = make('span', 'bar-value');
      row.appendChild(value);
      card.appendChild(row);
      return { fill: fill, value: value };
    }
    const own = bar('bar-own', b.kind === 'defense' ? '守備' : '自軍');
    const enemy = bar('bar-enemy', '敵');

    const buttons = {};
    const box = make('div', 'command-buttons');
    COMMANDS.forEach(function (c) {
      if (c.id === 'retreat' && !sys.canRetreat(s, b)) return; // 防衛戦は退却しない
      const btn = make('button', 'btn command-button command-' + c.id, c.name);
      btn.addEventListener('click', function () {
        if (sys.command(cur(), b.key, c.id)) update();
      });
      box.appendChild(btn);
      buttons[c.id] = btn;
    });
    card.appendChild(box);

    return { card: card, buffs: buffs, own: own, enemy: enemy, buttons: buttons };
  }

  function setBar(bar, ratio, text) {
    const r = Math.max(0, Math.min(1, ratio));
    const tf = 'scaleX(' + r.toFixed(3) + ')';
    if (bar.fill.style.transform !== tf) bar.fill.style.transform = tf;
    setText(bar.value, text);
  }

  function updateBattles(s) {
    const key = s.battles.map(function (b) { return b.key; }).join(',');
    if (key !== mapUi.battleKey) {
      mapUi.battleKey = key;
      mapUi.battleEls = {};
      els.battleList.textContent = '';
      s.battles.forEach(function (b) {
        const e = buildBattleCard(s, b);
        els.battleList.appendChild(e.card);
        mapUi.battleEls[b.key] = e;
      });
    }
    s.battles.forEach(function (b) {
      const e = mapUi.battleEls[b.key];
      const sides = sys.battleSides(s, b);
      const own = sides.own;
      setBar(e.own, own.start > 0 ? own.troops / own.start : 0, fmt.num(Math.floor(own.troops)));
      setBar(e.enemy, sides.enemy.troops / sides.enemy.max, fmt.num(Math.ceil(sides.enemy.troops)));

      const units = sys.battleUnits(s, b);
      const buffs = [];
      if (b.chargeLeft > 0) buffs.push('突撃 ' + b.chargeLeft.toFixed(1) + '秒');
      if (b.rallyLeft > 0) buffs.push('鼓舞 ' + b.rallyLeft.toFixed(1) + '秒');
      let idle = b.kind === 'defense' ? '守備兵が迎え撃っている' : b.kind === 'field' ? '街道で交戦中' : '攻城中';
      if (units.length > 1) idle = units.length + '部隊で' + idle;
      setText(e.buffs, buffs.length ? buffs.join('　') : idle);

      const active = b.kind === 'defense' ? own.troops > 0 : units.length > 0;
      COMMANDS.forEach(function (c) {
        const btn = e.buttons[c.id];
        if (!btn) return;
        const left = c.cd ? b[c.cd] : 0;
        setText(btn, left > 0 ? c.name + ' ' + Math.ceil(left) : c.name);
        setDisabled(btn, left > 0 || !active);
      });
    });
  }

  // ---- 侵攻の警告（どのタブでも画面上部に出す）----

  function updateInvasionAlert(s) {
    const v = s.invasions[0];
    setClass(els.invasionAlert, 'hidden', !v);
    if (!v) return;
    const from = nodeName(s, v.from);
    const to = nodeName(s, v.to);
    let text;
    if (v.state === 'marching') {
      text = '敵襲！ ' + from + 'の軍（兵 ' + fmt.num(Math.ceil(v.troops)) + '）が ' + to + ' へ。到着まで あと ' +
        Math.ceil(Math.max(0, v.duration - v.elapsed)) + '秒';
    } else if (v.state === 'field') {
      text = '野戦中：' + from + 'の軍と街道で交戦しています';
    } else {
      text = '防衛戦中：' + to + ' が ' + from + 'の軍に攻められています';
    }
    setText(els.invasionAlertText, text);
  }

  // ---- 合戦結果 ----

  function resultContent(ev) {
    const n = fmt.num;
    switch (ev.type) {
      case 'victory': {
        const lines = [
          ['損害', n(ev.lost) + ' 人'],
          ['城の守備兵', n(ev.survivors) + ' 人（残った兵が守る）'],
          ['功績', '+' + n(ev.merit)],
          ['遺徳', '+' + n(ev.virtue) + (ev.boss ? '（ボスを倒した分を含む）' : '')],
          ['領地', '米 ' + fmt.rate(ev.income) + '（この代のあいだ）'],
        ];
        if (ev.heirloom) {
          const h = data.HEIRLOOMS.find(function (x) { return x.id === ev.heirloom; });
          lines.push(['家宝', h.name + '（' + h.desc + '）']);
        }
        return { win: true, image: ev.boss ? '決戦' : '合戦', title: ev.name + ' を落とした！', lines: lines };
      }
      case 'stageUp': {
        const next = data.STAGES[ev.stage - 1];
        const prev = data.STAGES[ev.cleared - 1];
        return { win: true, image: '段階' + fmt.kanji(ev.stage), title: '段階' + fmt.kanji(ev.stage) + '「' + next.name + '」へ', lines: [
          ['平定', prev.region + ' を平定した。その城はすべて領地として米を生む'],
          ['新しい地図', next.region + '（' + next.castles.length + '勢力）'],
          ['兵', '各城の守備兵と出陣中の兵は、本拠地の待機兵に戻った'],
        ] };
      }
      case 'recovered':
        return { win: true, image: '旧領回復', title: '旧領を取り戻した！', lines: [
          ['取り戻した城', ev.names.join('・')],
          ['使った兵', n(ev.cost) + ' 人'],
          ['守備兵', '0 人（補充を送るまで守りは手薄）'],
          ['功績・遺徳', 'なし（旧領の回復では得られない）'],
        ] };
      case 'unified':
        return { win: true, image: '天下統一', title: '天下統一！', lines: [
          ['結果', 'すべての段階を平定した（エンディングはステップ5で作ります）'],
        ] };
      case 'defeat':
        return { win: false, image: ev.boss ? '決戦' : '合戦', title: ev.name + ' の攻略に失敗…', lines: [
          ['損害', n(ev.lost) + ' 人（全滅）'],
          ['敵の残り', n(Math.ceil(ev.enemyLeft)) + ' 人（時間がたつと回復する）'],
        ] };
      case 'fieldWin':
        return { win: true, image: '野戦', title: ev.name + ' を街道で撃退！', lines: [
          ['撃退', '敵兵 ' + n(Math.ceil(ev.defeated)) + ' 人'],
          ['損害', n(ev.lost) + ' 人'],
          ['功績', '+' + n(ev.merit)],
          ['遺徳', '+' + n(ev.virtue)],
          ['部隊', '目的地へ進軍を続ける'],
        ] };
      case 'fieldLose':
        return { win: false, image: '野戦', title: '野戦に敗れた…', lines: [
          ['損害', n(ev.lost) + ' 人（全滅）'],
          ['敵の残り', n(Math.ceil(ev.enemyLeft)) + ' 人が ' + ev.target + ' へ進軍を続ける'],
        ] };
      case 'defenseWin':
        return { win: true, image: '防衛', title: ev.target + ' を守りきった！', lines: [
          ['撃退', '敵兵 ' + n(Math.ceil(ev.defeated)) + ' 人'],
          ['損害', n(ev.lost) + ' 人'],
          ['功績', '+' + n(ev.merit)],
          ['遺徳', '+' + n(ev.virtue)],
        ] };
      case 'defenseLose':
        return { win: false, image: '防衛', title: ev.target + (ev.home ? ' が荒らされた…' : ' を奪われた…'), lines: ev.home ? [
          ['奪われた米', n(ev.loot.rice)],
          ['奪われた金', n(ev.loot.gold)],
          ['本拠地', '失わない'],
        ] : [
          ['領地', ev.target + ' が敵の城に戻った（領地収入もなくなる）'],
        ] };
    }
    return null;
  }

  function showResult(c) {
    setText(els.resultImage, c.image);
    setClass(els.resultModal.querySelector('.modal-box'), 'defeat', !c.win);
    setText(els.resultTitle, c.title);
    const body = els.resultBody;
    body.textContent = '';
    c.lines.forEach(function (l) {
      const row = make('div', 'result-row');
      row.appendChild(make('span', 'result-key', l[0]));
      row.appendChild(make('span', 'result-value', l[1]));
      body.appendChild(row);
    });
    setClass(els.resultModal, 'hidden', false);
  }

  // 結果は順番に1つずつ見せる（閉じたら次を出す）
  const resultQueue = [];

  function showNextResult() {
    while (resultQueue.length) {
      const c = resultContent(resultQueue.shift());
      if (c) { showResult(c); return; }
    }
    setClass(els.resultModal, 'hidden', true);
  }

  function consumeEvents() {
    while (sys.events.length) resultQueue.push(sys.events.shift());
    if (resultQueue.length && els.resultModal.classList.contains('hidden')) showNextResult();
  }

  function updateMap(s) {
    if (mapUi.stageRef !== s.map.stage || mapUi.stateRef !== s) {
      mapUi.stageRef = s.map.stage;
      mapUi.stateRef = s;
      mapUi.origin = null;
      mapUi.message = '';
      mapUi.unitListKey = null;
      mapUi.leaderKey = null;
      mapUi.battleKey = null;
      buildMap(s);
    }
    consumeEvents();
    setText(els.heirloomLine, s.heirlooms.length
      ? '家宝：' + s.heirlooms.map(function (id) { return data.HEIRLOOMS.find(function (h) { return h.id === id; }).name; }).join('・')
      : '');
    updateInvasionAlert(s);
    updateBattles(s);
    updateMapNodes(s);
    updateMapInvasions(s);
    updateMapUnits(s);
    updateUnitList(s);
    updateFormation(s);
    updateRecover(s);
  }

  // 旧領の一括回復
  function updateRecover(s) {
    const left = sys.formerLandsOnMap(s);
    setClass(els.recoverBox, 'hidden', left.length === 0);
    if (!left.length) return;
    const plan = sys.recoverablePlan(s);
    const cost = plan.reduce(function (sum, p) { return sum + p.cost; }, 0);
    setText(els.recoverInfo, 'この地図の旧領 ' + left.length + '城（守備兵 1/10）。' +
      (plan.length ? '今の待機兵で ' + plan.length + '城を取り戻せる（兵 ' + fmt.num(Math.ceil(cost)) + ' を使う）'
        : '待機兵の戦力が守備戦力を上回ると取り戻せる'));
    setText(els.recoverButton, '旧領を一括回復' + (plan.length ? '（' + plan.length + '城）' : ''));
    setDisabled(els.recoverButton, plan.length === 0);
  }

  function showTab(name) {
    document.querySelectorAll('#tabs .tab').forEach(function (t) {
      setClass(t, 'active', t.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      setClass(p, 'active', p.id === 'tab-' + name);
    });
  }

  function bindMap() {
    els.formTroops.addEventListener('input', function () {
      mapUi.troopsTouched = true;
      mapUi.message = '';
      update();
    });
    els.formGeneral.addEventListener('change', function () { update(); });
    document.querySelectorAll('.form-quick [data-ratio]').forEach(function (b) {
      b.addEventListener('click', function () {
        const standby = formationSource(cur()).troops;
        els.formTroops.value = String(Math.floor(standby * Number(b.dataset.ratio)));
        // 「全軍」は兵が増えても全軍のまま追従させる
        mapUi.troopsTouched = Number(b.dataset.ratio) < 1;
        mapUi.message = '';
        update();
      });
    });
    els.orderCancel.addEventListener('click', function () {
      mapUi.origin = null;
      mapUi.message = '';
      update();
    });
    els.resultClose.addEventListener('click', showNextResult);
    els.recoverButton.addEventListener('click', function () {
      if (sys.recoverFormerLands(cur())) update();
    });
    // 侵攻の警告を押したら地図へ
    els.invasionAlert.addEventListener('click', function () { showTab('map'); });
  }

  // ---- 家訓 ----
  // 系統ごとの列に、前提の家訓の下へ字下げして並べる。カードは一度作り、毎ティックは中身だけ書き換える

  // 系統の中の並び：前提が同じ系統にあればその下（深さ +1）、無ければ列の先頭から
  function preceptOrder(branchId) {
    const list = data.PRECEPTS.filter(function (p) { return p.branch === branchId; });
    const inBranch = function (id) { return list.some(function (p) { return p.id === id; }); };
    const out = [];
    function visit(p, depth) {
      out.push({ def: p, depth: depth });
      list.forEach(function (c) {
        if (cfg.PRECEPTS[c.id].requires === p.id) visit(c, depth + 1);
      });
    }
    list.forEach(function (p) {
      const req = cfg.PRECEPTS[p.id].requires;
      if (!req || !inBranch(req)) visit(p, 0);
    });
    return out;
  }

  function preceptName(id) {
    return data.PRECEPTS.find(function (p) { return p.id === id; }).name;
  }

  function buildPreceptTree(container) {
    container.textContent = '';
    const head = make('div', 'precept-head');
    const virtue = make('span', 'precept-virtue');
    head.appendChild(virtue);
    head.appendChild(make('span', 'note',
      '遺徳は戦の勝利で貯まります（城を落とす・防衛に成功・ボスを倒す）。家訓の効果はずっと続きます。'));
    container.appendChild(head);

    const grid = make('div', 'precept-grid');
    const cards = {};
    data.PRECEPT_BRANCHES.forEach(function (branch) {
      const col = make('div', 'precept-branch');
      col.appendChild(make('div', 'precept-branch-name', branch.name));
      preceptOrder(branch.id).forEach(function (item) {
        const id = item.def.id;
        const p = cfg.PRECEPTS[id];
        const card = make('div', 'precept-card');
        card.style.marginLeft = (item.depth * 14) + 'px';
        const top = make('div', 'precept-top');
        top.appendChild(make('span', 'precept-name', (item.depth ? '└ ' : '') + item.def.name));
        const level = make('span', 'precept-level');
        top.appendChild(level);
        card.appendChild(top);
        const now = make('div', 'precept-now');
        card.appendChild(now);
        const next = make('div', 'precept-next');
        card.appendChild(next);
        if (p.requires) card.appendChild(make('div', 'precept-req', '前提：' + preceptName(p.requires) + ' Lv1'));
        const button = make('button', 'btn btn-small precept-learn');
        button.addEventListener('click', function () {
          if (sys.learnPrecept(cur(), id)) update();
        });
        card.appendChild(button);
        col.appendChild(card);
        cards[id] = { card: card, level: level, now: now, next: next, button: button };
      });
      grid.appendChild(col);
    });
    container.appendChild(grid);
    return { virtue: virtue, cards: cards };
  }

  function updatePreceptTree(s, tree) {
    setText(tree.virtue, '遺徳の残り ' + fmt.num(s.virtue));
    Object.keys(tree.cards).forEach(function (id) {
      const e = tree.cards[id];
      const p = cfg.PRECEPTS[id];
      const lv = sys.preceptLevel(s, id);
      const maxed = sys.preceptMaxed(s, id);
      const unlocked = sys.preceptUnlocked(s, id);
      setClass(e.card, 'locked', !unlocked);
      setClass(e.card, 'learned', lv > 0);
      setText(e.level, 'Lv ' + lv + (p.max === null ? '' : ' / ' + p.max));
      setText(e.now, lv > 0 ? '現在：' + sys.preceptEffectText(id, lv) : '未習得');
      setText(e.next, maxed ? '' : (lv > 0 ? '次：' : '効果：') + sys.preceptEffectText(id, lv + 1));
      setText(e.button, maxed ? (p.max === 1 ? '習得済み' : '最大Lv') : '習得（遺徳 ' + fmt.num(sys.preceptCost(s, id)) + '）');
      setDisabled(e.button, !sys.canLearnPrecept(s, id));
    });
  }

  // 家系タブから開く家訓画面
  let preceptModalTree = null;
  let preceptModalRef = null;

  function updatePreceptModal(s) {
    const open = !els.preceptModal.classList.contains('hidden');
    if (!open) return;
    if (!preceptModalTree || preceptModalRef !== s) {
      preceptModalTree = buildPreceptTree(els.preceptBody);
      preceptModalRef = s;
    }
    updatePreceptTree(s, preceptModalTree);
  }

  function bindPrecepts() {
    $('open-precepts').addEventListener('click', function () {
      setClass(els.preceptModal, 'hidden', false);
      update();
    });
    $('precept-close').addEventListener('click', function () {
      setClass(els.preceptModal, 'hidden', true);
    });
  }

  // ---- 家督継承 ----

  let successionKey = null;
  let successionTree = null; // 継承画面の家訓（その手順のあいだだけ）

  function portraitBox(portrait, cls) {
    const p = make('div', 'portrait' + (cls ? ' ' + cls : ''), '肖像');
    p.title = 'portrait_' + String(portrait).padStart(2, '0');
    return p;
  }

  function stars(grade) {
    return '★'.repeat(grade) + '☆'.repeat(cfg.TRAIT_GRADE.MAX - grade);
  }

  // 「内政型★3（優）・武勇型★1（凡）」
  function traitsLabel(traits) {
    if (!traits.length) return '特性なし';
    return traits.map(function (t) {
      return data.TRAITS[t.id].name + '★' + t.grade + '（' + data.TRAIT_GRADE_NAMES[t.grade - 1] + '）';
    }).join('・');
  }

  function maxGrade(traits) {
    return traits.reduce(function (m, t) { return Math.max(m, t.grade); }, 0);
  }

  // 特性の一覧（跡継ぎのカード用）
  function traitBlock(traits) {
    const box = make('div', 'trait-block');
    if (!traits.length) box.appendChild(make('div', 'heir-trait', '特性なし'));
    traits.forEach(function (t) {
      const row = make('div', 'trait-row grade-' + t.grade);
      const head = make('div', 'heir-trait');
      head.appendChild(make('span', '', data.TRAITS[t.id].name + ' '));
      head.appendChild(make('span', 'trait-stars', stars(t.grade)));
      head.appendChild(make('span', 'trait-grade-name', data.TRAIT_GRADE_NAMES[t.grade - 1]));
      row.appendChild(head);
      row.appendChild(make('div', 'heir-desc', sys.traitDesc(t.id, t.grade)));
      box.appendChild(row);
    });
    return box;
  }

  function generationTitle(s, gen) {
    return s.houseName + ' 第' + fmt.kanji(gen) + '代';
  }

  function resultRows(parent, rows) {
    rows.forEach(function (r) {
      const row = make('div', 'result-row');
      row.appendChild(make('span', 'result-key', r[0]));
      row.appendChild(make('span', 'result-value', r[1]));
      parent.appendChild(row);
    });
  }

  const SUCCESSION_STEPS = ['summary', 'precepts', 'heir', 'retainer', 'ceremony'];

  function stepLabel(step) {
    const i = SUCCESSION_STEPS.indexOf(step);
    return '家督継承　' + fmt.kanji(i + 1) + '／' + fmt.kanji(SUCCESSION_STEPS.length);
  }

  function navButtons(body, backStep, nextLabel, nextStep, nextDisabled, onNext) {
    const nav = make('div', 'succession-nav');
    const back = make('button', 'btn', '戻る');
    back.addEventListener('click', function () {
      sys.successionStep(cur(), backStep);
      update();
    });
    const next = make('button', 'btn succession-next', nextLabel);
    next.disabled = !!nextDisabled;
    next.addEventListener('click', onNext || function () {
      sys.successionStep(cur(), nextStep);
      update();
    });
    nav.appendChild(back);
    nav.appendChild(next);
    body.appendChild(nav);
  }

  function buildSuccession(s) {
    const sc = s.succession;
    const body = els.successionBody;
    body.textContent = '';
    successionTree = null;
    setClass(els.successionModal.querySelector('.modal-box'), 'wide', sc.step === 'precepts');
    const gained = sys.successionGain(s);
    const multNow = sys.prestigeMultiplier(s);
    const multNext = sys.prestigeMultiplierFor(s, s.prestige + gained);
    body.appendChild(make('div', 'succession-step', stepLabel(sc.step)));

    if (sc.step === 'summary') {
      const head = make('div', 'succession-head');
      head.appendChild(portraitBox(s.lord.portrait, 'large'));
      const t = make('div', 'succession-title-box');
      t.appendChild(make('div', 'succession-gen', generationTitle(s, s.generation)));
      t.appendChild(make('h2', 'succession-title', sys.lordFullName(s) + '、隠居する'));
      head.appendChild(t);
      body.appendChild(head);
      const rows = make('div', 'succession-rows');
      resultRows(rows, [
        ['治世', Math.floor(s.lord.age) + ' 秒'],
        ['この代の石高', fmt.num(s.kokudaka) + ' 石'],
        ['得る家格', '+' + fmt.num(gained)],
        ['累計家格', fmt.num(s.prestige) + ' → ' + fmt.num(s.prestige + gained)],
        ['家格倍率', fmt.mult(multNow) + ' → ' + fmt.mult(multNext) + '（全生産にかかる）'],
        ['この代の遺徳', '+' + fmt.num(s.generationVirtue) + '（戦の勝利で得た分）'],
        ['遺徳の残り', fmt.num(s.virtue) + '（次の画面の家訓に使える）'],
        ['旧領', s.map.won.length
          ? 'この代で落とした ' + s.map.won.length + '城が旧領になる（次の代は守備兵 1/10）'
          : 'この代で新たに落とした城はない'],
      ]);
      body.appendChild(rows);
      body.appendChild(make('div', 'note succession-note',
        '米・金・兵・功績・施設・武将（譜代を除く）・この段階の領地は失われます。' +
        '家格・遺徳・家訓・家宝・譜代家臣・平定済みの段階・旧領の記録は引き継がれます。'));
      const next = make('button', 'btn succession-next', '家訓を定める');
      next.addEventListener('click', function () {
        sys.successionStep(cur(), 'precepts');
        update();
      });
      body.appendChild(next);
    } else if (sc.step === 'precepts') {
      body.appendChild(make('h2', 'succession-title', '家訓を定める'));
      body.appendChild(make('div', 'note',
        '習得した家訓は次の代から効きます（使わずに残した遺徳も引き継がれます）。'));
      const box = make('div', 'succession-precepts');
      body.appendChild(box);
      successionTree = buildPreceptTree(box);
      updatePreceptTree(s, successionTree);
      navButtons(body, 'summary', '跡継ぎを選ぶ', 'heir', false);
    } else if (sc.step === 'heir') {
      body.appendChild(make('h2', 'succession-title', '跡継ぎを選ぶ'));
      body.appendChild(make('div', 'note', '格が上がる確率 ' +
        Math.round(sys.gradeUpChance(s.prestige + gained) * 100) + '%（累計家格が高いほど上がる）'));
      const list = make('div', 'heir-list');
      sc.candidates.forEach(function (c, i) {
        const top = maxGrade(c.traits);
        const cls = 'heir-card' + (sc.chosen === i ? ' chosen' : '') +
          (top >= cfg.TRAIT_GRADE.HIGHLIGHT_FROM ? ' rare' : '') + (top >= cfg.TRAIT_GRADE.MAX ? ' legendary' : '');
        const card = make('button', cls);
        card.appendChild(portraitBox(c.portrait));
        card.appendChild(make('div', 'heir-name', sys.lordFullName(s, c)));
        card.appendChild(traitBlock(c.traits));
        card.addEventListener('click', function () {
          sys.chooseHeir(cur(), i);
          update();
        });
        list.appendChild(card);
      });
      body.appendChild(list);
      navButtons(body, 'precepts', '譜代家臣を選ぶ', 'retainer', sc.chosen === null);
    } else if (sc.step === 'retainer') {
      const slots = sys.retainerSlots(s);
      body.appendChild(make('h2', 'succession-title', '譜代家臣を選ぶ'));
      body.appendChild(make('div', 'note',
        '次の代へ連れていける武将：' + sc.retainers.length + ' / ' + slots + ' 人（選ばなくても進めます）'));
      const list = make('div', 'retainer-list');
      if (!s.generals.length) list.appendChild(make('div', 'note', '配下の武将がいません。'));
      const total = function (g) { return g.stats.leadership + g.stats.valor + g.stats.intellect + g.stats.politics; };
      s.generals.slice().sort(function (a, b) { return total(b) - total(a); }).forEach(function (g) {
        const chosen = sc.retainers.indexOf(g.id) >= 0;
        const card = make('button', 'retainer-card rarity-' + g.rarity + (chosen ? ' chosen' : ''));
        card.disabled = !chosen && sc.retainers.length >= slots;
        const head = make('div', 'retainer-head');
        head.appendChild(make('span', 'rarity-badge', data.RARITY_NAMES[g.rarity]));
        if (g.fudai) head.appendChild(make('span', 'fudai-badge', '譜代'));
        head.appendChild(make('span', 'general-name', g.surname + ' ' + g.givenName));
        card.appendChild(head);
        card.appendChild(make('div', 'retainer-stats', data.STATS.map(function (st) {
          return st.name + ' ' + g.stats[st.id];
        }).join('　')));
        card.addEventListener('click', function () {
          sys.toggleRetainer(cur(), g.id);
          update();
        });
        list.appendChild(card);
      });
      body.appendChild(list);
      navButtons(body, 'heir', '家督を譲る', 'ceremony', false);
    } else {
      const heir = sc.candidates[sc.chosen];
      const row = make('div', 'ceremony');
      const prev = make('div', 'ceremony-person prev');
      prev.appendChild(portraitBox(s.lord.portrait, 'large'));
      prev.appendChild(make('div', 'ceremony-caption', '先代　' + sys.lordFullName(s)));
      const next = make('div', 'ceremony-person next');
      next.appendChild(portraitBox(heir.portrait, 'large'));
      next.appendChild(make('div', 'ceremony-caption', sys.lordFullName(s, heir)));
      next.appendChild(make('div', 'ceremony-traits', traitsLabel(heir.traits)));
      row.appendChild(prev);
      row.appendChild(make('div', 'ceremony-arrow', '→'));
      row.appendChild(next);
      body.appendChild(row);
      body.appendChild(make('h2', 'ceremony-title', generationTitle(s, s.generation + 1) + '当主'));
      body.appendChild(make('div', 'ceremony-prestige', '家格 +' + fmt.num(gained) + '　家格倍率 ' + fmt.mult(multNext)));
      const names = sc.retainers.map(function (id) {
        const g = s.generals.find(function (x) { return x.id === id; });
        return g ? g.surname + ' ' + g.givenName : '';
      }).filter(function (n) { return n; });
      body.appendChild(make('div', 'ceremony-retainers', '譜代家臣：' + (names.length ? names.join('・') : 'なし')));
      navButtons(body, 'retainer', '治世を始める', null, false, function () {
        sys.completeSuccession(cur());
        Game.state.save();
        update();
      });
    }
  }

  function updateSuccession(s) {
    const sc = s.succession;
    setClass(els.successionModal, 'hidden', !sc);
    const key = sc ? s.generation + ':' + sc.step + ':' + sc.chosen + ':' + sc.retainers.join(',') + ':' + sc.candidates.length : null;
    if (key !== successionKey) {
      successionKey = key;
      if (sc) buildSuccession(s);
    }
    if (sc && successionTree) updatePreceptTree(s, successionTree);
  }

  function updateLordHeader(s) {
    setText(els.houseTitle, generationTitle(s, s.generation) + '　' + sys.lordFullName(s));
    const badge = s.lord.traits.map(function (t) { return data.TRAITS[t.id].name + '★' + t.grade; }).join('・');
    setText(els.lordTrait, badge);
    setClass(els.lordTrait, 'hidden', !badge);
    setClass(els.lordTrait, 'rare', maxGrade(s.lord.traits) >= cfg.TRAIT_GRADE.HIGHLIGHT_FROM);
    els.lordTrait.title = s.lord.traits.map(function (t) { return sys.traitDesc(t.id, t.grade); }).join(' / ');

    // 治世の長さと、隠居の目安（家格の伸び）
    setText(els.reignText, '治世 ' + formatSeconds(s.lord.age));
    const growth = sys.prestigeGrowth(s);
    setText(els.growthText, '家格の伸び +' + (growth < 10 ? growth.toFixed(1) : fmt.num(growth)) + '/分');

    const gain = sys.prestigeGain(s);
    if (s.succession) {
      setText(els.retireButton, '継承の手続き中');
    } else {
      setText(els.retireButton, '今隠居すると 家格 +' + fmt.num(gain));
    }
    setDisabled(els.retireButton, !sys.canRetire(s));

    // 伸びが最大時の半分を下回ったら「隠居の好機」。隠居できるまでは、残りの秒数を出す
    const chance = sys.isRetireChance(s);
    setClass(els.retireButton, 'chance', chance);
    if (chance) {
      setText(els.retireChance, '隠居の好機');
    } else if (!s.succession && !sys.canRetire(s)) {
      setText(els.retireChance, 'あと' + Math.ceil(Math.max(0, cfg.LORD.RETIRE_AFTER - s.lord.age)) + '秒で隠居可');
    } else {
      setText(els.retireChance, '');
    }
    setClass(els.retireChance, 'hidden', !els.retireChance.textContent);
    setClass(els.retireChance, 'is-chance', chance);

    setText(els.prestigeValue, fmt.mult(sys.prestigeMultiplier(s)));
    setText(els.prestigeTotal, '家格 ' + fmt.num(s.prestige));
  }

  // ---- 家系 ----

  let lineageKey = null;

  function formatSeconds(sec) {
    const m = Math.floor(sec / 60);
    const r = Math.floor(sec % 60);
    return m + '分' + String(r).padStart(2, '0') + '秒';
  }

  function updateLineage(s) {
    setText(els.lineagePrestige, fmt.num(s.prestige));
    setText(els.lineageMult, fmt.mult(sys.prestigeMultiplier(s)));
    setText(els.lineageGain, '家格 +' + fmt.num(sys.successionGain(s)));
    setText(els.lineageVirtue, fmt.num(s.virtue));

    const key = s.generation + ':' + s.lineage.length + ':' + s.heirlooms.join(',') + ':' + s.houseName;
    if (key !== lineageKey) {
      lineageKey = key;
      const tbody = els.lineageRows;
      tbody.textContent = '';
      s.lineage.forEach(function (r) {
        const tr = make('tr');
        [
          '第' + fmt.kanji(r.generation) + '代',
          s.houseName.replace(/家$/, '') + ' ' + r.givenName,
          traitsLabel(r.traits),
          fmt.num(r.kokudaka),
          '+' + fmt.num(r.prestige),
          '+' + fmt.num(r.virtue),
          formatSeconds(r.seconds),
        ].forEach(function (v) { tr.appendChild(make('td', '', v)); });
        tbody.appendChild(tr);
      });
      // 今の当主（治世中）
      const tr = make('tr', 'current');
      els.lineageCurrent = {};
      ['第' + fmt.kanji(s.generation) + '代（治世中）', sys.lordFullName(s), traitsLabel(s.lord.traits)].forEach(function (v) {
        tr.appendChild(make('td', '', v));
      });
      els.lineageCurrent.kokudaka = make('td');
      els.lineageCurrent.gain = make('td');
      els.lineageCurrent.virtue = make('td');
      els.lineageCurrent.time = make('td');
      tr.appendChild(els.lineageCurrent.kokudaka);
      tr.appendChild(els.lineageCurrent.gain);
      tr.appendChild(els.lineageCurrent.virtue);
      tr.appendChild(els.lineageCurrent.time);
      tbody.appendChild(tr);

      const hl = els.heirloomList;
      hl.textContent = '';
      data.HEIRLOOMS.forEach(function (h) {
        const owned = sys.hasHeirloom(s, h.id);
        const item = make('div', 'heirloom-item' + (owned ? ' owned' : ''));
        item.appendChild(make('div', 'heirloom-name', owned ? h.name : '？？？'));
        item.appendChild(make('div', 'heirloom-desc', owned ? h.desc : '未入手（' + heirloomSource(h.id) + '）'));
        hl.appendChild(item);
      });
    }
    setText(els.lineageCurrent.kokudaka, fmt.num(s.kokudaka));
    setText(els.lineageCurrent.gain, '(+' + fmt.num(sys.successionGain(s)) + ')');
    setText(els.lineageCurrent.virtue, '+' + fmt.num(s.generationVirtue));
    setText(els.lineageCurrent.time, formatSeconds(s.lord.age));
  }

  // 家宝を落とす城（段階と城名）
  function heirloomSource(id) {
    for (let i = 0; i < data.STAGES.length; i++) {
      const c = data.STAGES[i].castles.find(function (x) { return x.heirloom === id; });
      if (c) return '段階' + fmt.kanji(data.STAGES[i].stage) + '「' + c.name + '」を落とす';
    }
    return '';
  }

  function bindTabs() {
    document.querySelectorAll('#tabs .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab.disabled) return;
        showTab(tab.dataset.tab);
      });
    });
  }

  function bindSettings() {
    $('save-button').addEventListener('click', function () {
      Game.state.save();
      update();
    });
    setClass($('dev-tools'), 'hidden', !cfg.DEV_TOOLS);
    $('dev-reset-map').addEventListener('click', function () {
      if (!confirm('地図をリセットしますか？（敵城がすべて元に戻ります）')) return;
      sys.devResetMap(cur());
      Game.state.save();
      update();
    });
    $('dev-allow-retire').addEventListener('click', function () {
      sys.devAllowRetire(cur());
      update();
    });
    els.retireButton.addEventListener('click', function () {
      if (!confirm('隠居して家督を譲りますか？（家格 +' + fmt.num(sys.prestigeGain(cur())) + '）')) return;
      if (sys.retire(cur())) update();
    });
    $('dev-clear-stage').addEventListener('click', function () {
      if (!confirm('今の段階のボスを倒したことにして、次の段階へ進みますか？')) return;
      sys.devClearStage(cur());
      Game.state.save();
      update();
    });
    $('dev-invade').addEventListener('click', function () {
      const v = sys.devInvadeNow(cur());
      $('dev-invade-note').textContent = v
        ? nodeName(cur(), v.from) + ' → ' + nodeName(cur(), v.to) + '（兵 ' + fmt.num(Math.ceil(v.troops)) + '）'
        : '侵攻できません（侵攻中・攻めてくる敵城がない・自軍の兵が0 のどれか）';
      update();
    });
    $('dev-add-virtue').addEventListener('click', function () {
      sys.devAddVirtue(cur(), 100);
      update();
    });
    $('reset-button').addEventListener('click', function () {
      if (!confirm('セーブデータを削除して最初からやり直しますか？')) return;
      Game.state.reset();
      update();
    });
    els.autoBuildCheck.addEventListener('change', function () {
      cur().settings.autoBuild = els.autoBuildCheck.checked;
      update();
    });
    bindTransfer();
  }

  // セーブの書き出し・読み込み（別のPCへ移す）
  function bindTransfer() {
    const exportText = $('export-text');
    const exportCopy = $('export-copy');
    const exportStatus = $('export-status');
    const importText = $('import-text');
    const importStatus = $('import-status');

    $('export-button').addEventListener('click', function () {
      exportText.value = Game.state.exportString();
      exportCopy.disabled = false;
      exportStatus.textContent = new Date().toLocaleTimeString('ja-JP') + ' の状態を書き出しました（' +
        exportText.value.length + '文字）';
    });
    exportCopy.addEventListener('click', function () {
      exportText.select();
      const done = function () { exportStatus.textContent = 'コピーしました'; };
      // file:// ではクリップボードAPIが使えないことがあるので、古い方法も試す
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(exportText.value).then(done, function () {
          exportStatus.textContent = document.execCommand('copy') ? 'コピーしました' : '選択した文字列を Ctrl+C でコピーしてください';
        });
      } else {
        exportStatus.textContent = document.execCommand('copy') ? 'コピーしました' : '選択した文字列を Ctrl+C でコピーしてください';
      }
    });
    $('import-button').addEventListener('click', function () {
      const text = importText.value.trim();
      if (!text) {
        importStatus.textContent = '貼り付けた文字列がありません';
        return;
      }
      if (!confirm('貼り付けたセーブを読み込みますか？（今の進行は上書きされます）')) return;
      if (Game.state.importString(text)) {
        importText.value = '';
        importStatus.textContent = '読み込みました（' + Game.state.current.houseName + ' 第' +
          fmt.kanji(Game.state.current.generation) + '代）';
        update();
      } else {
        importStatus.textContent = '読み込めませんでした。文字列が途中で切れていないか確かめてください';
      }
    });
  }

  // ---- 更新 ----

  function updateHeader(s) {
    updateLordHeader(s);
    setText(els.kokudaka, fmt.num(s.kokudaka));

    const rates = sys.rates(s);
    ['rice', 'gold', 'troops'].forEach(function (res) {
      setText(els.res[res], fmt.num(s.resources[res]));
      setText(els.rate[res], rates[res] > 0 ? fmt.rate(rates[res]) : '');
    });
    setText(els.power, fmt.num(sys.power(s)));
    setText(els.merit, fmt.num(s.resources.merit));
    setText(els.virtue, fmt.num(s.virtue));

    const t = Game.state.lastSavedAt;
    setText(els.saveStatus, t ? '自動保存 ' + new Date(t).toLocaleTimeString('ja-JP') : '');
  }

  function updateFacilities(s) {
    data.FACILITIES.forEach(function (def) {
      const id = def.id;
      const e = facilityEls[id];
      const fcfg = cfg.FACILITIES[id];
      const unlocked = sys.isUnlocked(s, id);
      const lv = s.facilities[id];

      setClass(e.row, 'locked', !unlocked);
      setText(e.level, 'Lv ' + lv);

      if (fcfg.produces) {
        const resName = data.RESOURCES[fcfg.produces].name;
        setText(e.effect,
          '1Lvごとに ' + resName + ' ' + fmt.rate(sys.productionPerLevel(s, id)) +
          '　合計 ' + fmt.rate(sys.production(s, id)));
      } else if (id === 'castle') {
        setText(e.effect, '1Lvごとに 全生産 ×' + fcfg.effect + '（累乗）　現在 ' + fmt.mult(sys.castleMultiplier(s)));
      } else {
        setText(e.effect, '1Lvごとに 戦力 +' + Math.round(fcfg.effect * 100) + '%　現在 戦力 ' + fmt.mult(sys.smithyMultiplier(s)));
      }

      if (fcfg.milestone) {
        const next = sys.nextMilestone(lv);
        const now = sys.milestoneMultiplier(lv);
        const nowText = now > 1 ? '節目ボーナス ' + fmt.mult(now) + '　' : '';
        setText(e.milestone, nowText + (next ? '次の節目 Lv' + next + ' で生産 ×' + cfg.MILESTONE_MULT : 'すべての節目に到達'));
      } else {
        setText(e.milestone, '');
      }

      const count = sys.bulkCount(s, id);
      const cost = sys.cost(s, id, count);
      const affordable = unlocked && sys.canAfford(s, cost);
      setText(e.cost, costText(cost));
      setText(e.button, '建設 ×' + count);
      setDisabled(e.button, !affordable);
      setClass(e.cost, 'short', !affordable);
    });
  }

  let stateRef = null;

  function update() {
    const s = cur();
    if (s !== stateRef) {
      // データ削除・読み込みで状態が入れ替わった：作り直しの目印を消す
      stateRef = s;
      lineageKey = null;
      successionKey = null;
    }
    updateHeader(s);
    const fushin = sys.preceptLevel(s, 'fushin') > 0;
    setClass(els.autoBuild, 'hidden', !fushin);
    if (fushin && els.autoBuildCheck.checked !== s.settings.autoBuild) els.autoBuildCheck.checked = s.settings.autoBuild;
    setText(els.clickAmount, '+' + fmt.num(sys.clickAmount(s)) + ' 石');
    const look = sys.castleLook(s);
    setText(els.castleLook, data.CASTLE_LOOKS[look]);
    setText(els.castleLevel, '城郭 Lv' + s.facilities.castle);
    els.castleImage.dataset.look = String(look);
    Object.keys(bulkEls).forEach(function (key) {
      setClass(bulkEls[key], 'active', s.settings.bulk === key);
    });
    updateFacilities(s);
    updateGenerals(s);
    updateMap(s);
    updateLineage(s);
    updatePreceptModal(s);
    updateSuccession(s);
  }

  function init() {
    els.houseTitle = $('house-title');
    els.saveStatus = $('save-status');
    els.kokudaka = $('kokudaka-value');
    els.res = { rice: $('res-rice'), gold: $('res-gold'), troops: $('res-troops') };
    els.rate = { rice: $('rate-rice'), gold: $('rate-gold'), troops: $('rate-troops') };
    els.power = $('power-value');
    els.clickAmount = $('click-amount');
    els.recruitButton = $('recruit-button');
    els.recruitCost = $('recruit-cost');
    els.generalList = $('general-list');
    els.generalEmpty = $('general-empty');
    els.generalCount = $('general-count');
    els.domesticCount = $('domestic-count');
    els.domesticMult = $('domestic-mult');
    els.mapSvg = $('map-svg');
    els.mapTitle = $('map-title');
    els.mapHint = $('map-hint');
    els.farPowers = $('far-powers');
    els.standbyTroops = $('standby-troops');
    els.formTroops = $('form-troops');
    els.formTroopsValue = $('form-troops-value');
    els.formGeneral = $('form-general');
    els.formPower = $('form-power');
    els.orderStatus = $('order-status');
    els.orderCancel = $('order-cancel');
    els.unitList = $('unit-list');
    els.unitCount = $('unit-count');
    els.unitEmpty = $('unit-empty');
    els.originLabel = $('origin-label');
    els.battleList = $('battle-list');
    els.resultModal = $('result-modal');
    els.resultImage = $('result-image');
    els.resultTitle = $('result-title');
    els.resultBody = $('result-body');
    els.resultClose = $('result-close');
    els.merit = $('merit-value');
    els.castleImage = $('castle-image');
    els.castleLook = $('castle-look');
    els.castleLevel = $('castle-level');
    els.invasionAlert = $('invasion-alert');
    els.invasionAlertText = $('invasion-alert-text');
    els.pacifiedMaps = $('pacified-maps');
    els.heirloomLine = $('heirloom-line');
    els.recoverBox = $('recover-box');
    els.recoverInfo = $('recover-info');
    els.recoverButton = $('recover-button');
    els.lordTrait = $('lord-trait');
    els.reignText = $('reign-text');
    els.growthText = $('growth-text');
    els.retireChance = $('retire-chance');
    els.retireButton = $('retire-button');
    els.prestigeValue = $('prestige-value');
    els.prestigeTotal = $('prestige-total');
    els.successionModal = $('succession-modal');
    els.successionBody = $('succession-body');
    els.lineagePrestige = $('lineage-prestige');
    els.lineageMult = $('lineage-mult');
    els.lineageGain = $('lineage-gain');
    els.lineageRows = $('lineage-rows');
    els.heirloomList = $('heirloom-list');
    els.virtue = $('virtue-value');
    els.lineageVirtue = $('lineage-virtue');
    els.preceptModal = $('precept-modal');
    els.preceptBody = $('precept-body');
    els.autoBuild = $('auto-build');
    els.autoBuildCheck = $('auto-build-check');

    buildFacilities();
    buildBulkButtons();
    bindClick();
    bindGenerals();
    bindMap();
    bindTabs();
    bindSettings();
    bindPrecepts();
    update();
  }

  Game.ui = { init, update };
})();

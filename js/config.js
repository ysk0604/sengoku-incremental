// 数値・定数（バランス調整はこのファイルだけで行う）
window.Game = window.Game || {};

Game.config = {
  // ---- ゲームループ ----
  TICK_MS: 100,             // 更新間隔（1秒10ティック）
  MAX_TICK_SECONDS: 1,      // 1ティックで進める最大秒数（スリープ復帰などで時間が飛ばないように）
  DEV_SPEED: 1,             // 開発用の速度倍率の初期値（設定タブの開発用ボタンで切り替える。セーブしない）
  DEV_SPEEDS: [1, 10, 100], // 切り替えられる速度倍率
  STEP_SECONDS: 0.1,        // 速度倍率を上げたときも、1回に進めるのはこの秒数まで（合戦の計算が粗くならないように）
  DEV_TOOLS: true,          // 設定タブに開発用ボタンを表示する（公開用の docs/ では tools/build_public.sh が false にする）

  // ---- セーブ ----
  SAVE_KEY: 'sengoku_incremental_save_v1',
  SAVE_VERSION: 1,
  AUTOSAVE_MS: 10000,       // オートセーブ間隔

  // ---- 家 ----
  DEFAULT_HOUSE_NAME: '天野家',

  // ---- 稲刈りと金山（4.10。カーソルの周りの円の中を、道具が一定間隔で自動で打つ）----
  WORK: {
    WIDTH: 760, HEIGHT: 260,  // 作業画面の大きさ（Canvas の座標）
    MAX_ITEMS: 60,            // 画面に出せる稲穂・岩の数の上限（低スペック対策）
    MAX_DROPS: 60,            // 跳ねている資源の上限（超えたらすぐ加える）
    MAX_POPS: 24,             // 数字のポップアップの上限
    DROP_SECONDS: 0.4,        // 資源が跳ねてから加算されるまで
    POP_SECONDS: 0.8,         // 数字のポップアップが消えるまで
    RATE_SMOOTHING: 0.2,      // 手作業の稼ぎ（1秒ごとに測る）をならす割合。自動の稼ぎはこれを元にする
    UNSEEN_RATIO: 0.3,        // 金山の解放後、選んでいない方は手作業の稼ぎのこの割合で自動で進む
    RICE: {
      BASE: 1,                // 稲穂1つ（黄色い穂）の基本の米。全体倍率がかかる
      RATE_SHARE: 0.05,       // …に、米の毎秒生産量のこの割合を足す
      SPAWN_PER_SECOND: 1.2,  // 稲穂の生える速さ（1秒あたり）
      SPAWN_PER_FIELD_LEVEL: 0.02, // 田畑Lvごとに生える速さ +2%
      HP: 2,                  // 稲穂の耐久値
      GREEN_SECONDS: 3,       // 青い穂 → 黄色い穂 までの秒数
      YELLOW_SECONDS: 3,      // 黄色い穂 → 黄金の穂
      GOLDEN_SECONDS: 4,      // 黄金の穂が枯れて消えるまで
      STAGE_MULTS: [0.3, 1, 3], // 青い穂・黄色い穂・黄金の穂の量
      BUMPER_CHANCE: 0.02,    // 豊作の穂（光る）の出やすさ
      BUMPER_HP: 30,
      BUMPER_MULT: 20,
      BUMPER_SECONDS: 10,     // 豊作の穂が消えるまで
      HIT_PAD: 8,             // 当たり判定を円の半径よりこれだけ広くする（穂の大きさの分）
      MARGIN_X: 20, MARGIN_TOP: 34, MARGIN_BOTTOM: 14, // 稲穂が生える範囲の余白
    },
    MINE: {
      BASE: 2,                // 岩1つ（深さ0）の基本の金。全体倍率がかかる
      RATE_SHARE: 0.02,       // …に、金の毎秒生産量のこの割合を足す
      COLS: 12, ROWS: 4,      // 岩のます目
      HP: 5,                  // 深さ0の岩の耐久値
      DEPTH_STEP: 10,         // 深さこの数ごとに…
      HARD_GROWTH: 2,         // …硬さ ×2
      GOLD_GROWTH: 1.3,       // …金 ×1.3（硬さより伸びが小さいので、深く掘るには良いツルハシが要る）
      VEIN_CHANCE: 0.03,      // 金の鉱脈（光る岩）の出やすさ
      VEIN_MULT: 20,
    },
    BLAST: {
      COOLDOWN: 30,
      ROWS: 2,                // 上から何段をまとめて砕くか
      COST_ROCKS: 8,          // 費用 = 今の深さの岩この数ぶんの金
    },
    // 道具（名前は data.js）。power 威力 / radius 範囲の半径 / speed 1秒に打つ回数 / price 金
    SICKLES: [
      { power: 1, radius: 30, speed: 2, price: 0 },
      { power: 3, radius: 40, speed: 3, price: 50 },
      { power: 10, radius: 55, speed: 4, price: 2000 },
      { power: 40, radius: 75, speed: 5, price: 1e5 },
      { power: 200, radius: 100, speed: 6, price: 1e7 },
    ],
    PICKAXES: [
      { power: 5, radius: 35, speed: 2, price: 0 },
      { power: 25, radius: 45, speed: 3, price: 5000 },
      { power: 150, radius: 60, speed: 4, price: 5e5 },
      { power: 1000, radius: 80, speed: 5, price: 1e8 },
    ],
  },

  // ---- 節目ボーナス（田畑・市場・兵舎） ----
  MILESTONE_LEVELS: [25, 50, 100, 200],
  MILESTONE_MULT: 1.5,

  // ---- 施設 ----
  // costBase: 資源ごとの基本コスト / growth: 成長率 / effect: 1レベルあたりの効果
  // produces: 生産する資源（null は生産しない） / unlock: 解放条件（null は最初から）
  FACILITIES: {
    field: {
      costBase: { rice: 10 }, growth: 1.3, effect: 1,
      produces: 'rice', milestone: true, unlock: null,
    },
    market: {
      costBase: { rice: 30 }, growth: 1.3, effect: 0.5,
      produces: 'gold', milestone: true, unlock: { facility: 'field', level: 5 },
    },
    barracks: {
      costBase: { gold: 20 }, growth: 1.3, effect: 0.1,
      produces: 'troops', milestone: true, unlock: { facility: 'market', level: 3 },
    },
    smithy: {
      costBase: { gold: 100 }, growth: 1.5, effect: 0.1, // 戦力 +10%/Lv
      produces: null, milestone: false, unlock: { facility: 'barracks', level: 5 },
    },
    castle: {
      costBase: { rice: 1000, gold: 500 }, growth: 3, effect: 1.1, // 全生産 ×1.1^Lv
      produces: null, milestone: false, unlock: { flag: 'firstVictory' },
    },
  },
  // 城の見た目が変わるレベル（砦 / 平城 / 天守 / 巨大城郭）
  CASTLE_LOOK_LEVELS: [0, 3, 6, 10],

  // ---- 武将 ----
  GENERALS: {
    RECRUIT_BASE_COST: 50,    // 登用コスト = 基本 × 成長率^(登用済み人数)（金）
    RECRUIT_GROWTH: 3,
    STAT_MIN: 1,              // 能力の範囲
    STAT_MAX: 100,
    // レア度：weight は出現の重み、bonus は能力の底上げ
    // （能力 = (STAT_MIN〜STAT_MAX-bonus のランダム) + bonus。上限は STAT_MAX のまま）
    RARITIES: [
      { id: 'normal', weight: 70, bonus: 0, epithet: false },
      { id: 'good', weight: 25, bonus: 20, epithet: false },
      { id: 'great', weight: 5, bonus: 40, epithet: true },
    ],
    DOMESTIC_PER_POLITICS: 0.005, // 内政担当：全生産 +政治×0.5%
    CASTELLAN_PER_LEADERSHIP: 0.02, // 城代：担当の自領の守備戦力 +統率×2%
    // 軍団長の自動進軍：自軍戦力が守備戦力のこの倍率以上になる城だけ攻める
    AUTO_MIN_POWER_RATIO: 1.3,
    // 送る兵は、守備戦力のこの倍率に届く分まで（出発地の兵が足りなければあるだけ）
    AUTO_SEND_POWER_RATIO: 2.0,
    PORTRAIT_COUNT: 20,          // portrait_01〜20
  },

  // ---- 地図・進軍 ----
  MAP: {
    TRAVEL_SPEED: 30,       // 街道の長さ（地図座標）÷ この値 = 移動秒数
    TRAVEL_MIN_SECONDS: 5,  // 移動時間の下限・上限
    TRAVEL_MAX_SECONDS: 15,
    BASE_UNITS: 1,          // 同時に動かせる部隊数 = この値 + 軍団長の人数
    MIN_UNIT_TROOPS: 1,     // 部隊の最小兵数
    LEADER_PER_LEADERSHIP: 0.01, // 部隊を率いる武将：戦力 +統率×1%
  },

  // ---- 攻城戦 ----
  BATTLE: {
    DEFENSE_MULT: 1.2,        // 城の防御補正
    BOSS_DEFENSE_MULT: 1.5,   // ボス城の防御補正
    DEALT_RATE: 0.2,          // 毎秒、敵の守備兵が「自軍戦力 × この値 ÷ 敵1人あたりの戦力」減る
    TAKEN_RATE: 0.12,         // 毎秒、自軍の兵が「敵の守備戦力 × この値 ÷ 自軍1人あたりの戦力」減る
    ENEMY_RECOVERY_RATE: 0.01, // 戦っていない敵城は、毎秒「満員の守備兵 × この値」ずつ回復
    MIN_SIEGE_SECONDS: 12,    // 攻城戦の最低の長さ。これより早く決着しそうなら、双方の損害を同じ割合で遅くする（0 で無効）
    // 采配
    CHARGE_SECONDS: 5,  CHARGE_DEALT: 2,   CHARGE_TAKEN: 1.5, CHARGE_COOLDOWN: 20,
    RALLY_SECONDS: 5,   RALLY_TAKEN: 0.5,  RALLY_COOLDOWN: 25,
    AMBUSH_RATE: 0.15,  AMBUSH_PER_INTELLECT: 0.001, AMBUSH_COOLDOWN: 40, // 知略100で +10%
    RETREAT_TAKEN: 0.5,       // 退却中に受ける損害の倍率
    RETREAT_PURSUIT_SECONDS: 3, // 退却を始めてから追撃を受ける秒数
    // 勝利報酬
    TERRITORY_RICE_RATE: 0.0002, // 領地：米 +敵兵力 × この値 /秒（全体倍率がかかる）
  },

  // ---- 当主と家督継承 ----
  LORD: {
    // 当主に寿命はない。継承はプレイヤーが隠居したときだけ
    RETIRE_AFTER: 120,      // 代の開始からこの秒数たつと隠居できる
    GROWTH_WINDOW: 60,      // 家格の伸び = 直近この秒数で増えた「今隠居すると得る家格」
    GROWTH_SAMPLE: 1,       // 伸びを測るために記録する間隔（秒）
    PEAK_FROM: 120,         // 伸びの最大は治世この秒数から測る（序盤の急な伸びで「好機」が早く出すぎないように）
    CHANCE_RATIO: 0.5,      // 伸びが最大時のこの割合を下回ったら「隠居の好機」
    HEIR_CANDIDATES: 3,     // 跡継ぎ候補の人数
    BASE_RETAINER_SLOTS: 1, // 譜代家臣として次の代へ連れていける人数
    FORMER_LAND_RATE: 0.1,  // 旧領（前の代までに落とした城）は守備兵がこの割合になる
  },
  PRESTIGE: {
    // 継承で得る家格 = floor((その代の石高 ÷ DIVISOR) ^ EXPONENT)
    DIVISOR: 1000,
    EXPONENT: 0.2,
    MULT_PER_POINT: 0.1,    // 家格倍率 = 1 + 累計家格 × この値
  },
  // 跡継ぎの特性（★1のときの効果）。weight は出やすさ
  //   production / power：上乗せ分（0.3 = +30%）。格の倍率（GRADE_MULTS）をかける
  //   prestige：隠居時に得る家格の上乗せ分（0.3 = +30%）。格の倍率をかける
  //   cost：施設コストの倍率。「cost ^ 格」
  //   startFieldByGrade：代の開始時の田畑Lv（★1〜★5）
  TRAITS: {
    domestic: { weight: 19, production: 0.3 },
    martial: { weight: 19, power: 0.3 },
    veteran: { weight: 19, prestige: 0.3 },
    thrifty: { weight: 19, cost: 0.85 },
    precocious: { weight: 19, startFieldByGrade: [10, 25, 50, 100, 200] },
    wise: { weight: 5, production: 0.2, power: 0.2, prestige: 0.2 },
  },
  TRAIT_GRADE: {
    MULTS: [1, 2, 4, 8, 16],  // ★1〜★5 の効果の強さ（上乗せ分にかける）
    MAX: 5,
    // 格が1つ上がる確率 = min(UP_MAX, UP_BASE + 累計家格 × UP_PER_PRESTIGE)
    UP_BASE: 0.05,
    UP_PER_PRESTIGE: 0.005,
    UP_MAX: 0.6,
    SECOND_MIN_PRESTIGE: 50,  // 累計家格がこれ以上なら…
    SECOND_CHANCE: 0.25,      // …候補ごとにこの確率で特性を2つ持つ
    HIGHLIGHT_FROM: 4,        // ★この格以上は目立つ枠
  },

  // ---- 家宝 ----
  HEIRLOOMS: {
    teaBowl: { production: 1.5 },          // 名物の茶器：全生産 ×1.5
    artOfWar: { power: 1.5, retainerSlots: 1 }, // 古の兵法書：戦力 ×1.5、譜代枠 +1
    famedSword: { bossPower: 1.3 },        // 名刀：ボス城での戦力 ×1.3
    secretBook: { virtue: 1.5 },           // 秘伝の書：得る遺徳 ×1.5
    crown: { prestigeMult: 1.5 },          // 天下の宝冠：家格倍率 ×1.5
  },

  // ---- 遺徳（戦の勝利で貯まる。家訓に使う）----
  // 得る遺徳 = 今の段階の数 × この値（秘伝の書でさらに ×1.5）
  VIRTUE: {
    CAPTURE_PER_STAGE: 1,   // 敵城を落とす（旧領回復は除く）
    DEFENSE_PER_STAGE: 0.5, // 防衛に成功（守備兵で守りきる・街道で迎撃する）
    BOSS_PER_STAGE: 10,     // ボスを倒す（城を落とした分とは別に加算）
  },

  // ---- 家訓 ----
  // 習得コスト = ceil(cost × growth ^ 現在Lv)（遺徳）。max: 最大Lv（null は上限なし）
  // requires: 前提の家訓（Lv1 以上で解放）。そのほかは1レベルあたりの効果
  PRECEPTS: {
    // 内政
    rakuichi: { cost: 1, growth: 1.6, max: 10, requires: null, gold: 0.5 },          // 金の生産 +50%
    kenchi: { cost: 3, growth: 3.0, max: 3, requires: 'rakuichi', startFieldByLevel: [20, 50, 100] },
    fukoku: { cost: 2, growth: 1.25, max: null, requires: null, production: 0.1 },  // 全生産 +10%
    hosaku: { cost: 1, growth: 1.6, max: 10, requires: null, spawn: 0.2, bumper: 0.1 }, // 稲穂の生える速さ +20%、豊作の穂 +10%
    kinzan: { cost: 5, growth: 1, max: 1, requires: 'rakuichi' },  // 金山を解放
    koudou: { cost: 8, growth: 2.0, max: 4, requires: 'kinzan', startDepth: 0.2 }, // 前の代の最深の 20% から掘り始める
    koumyaku: { cost: 4, growth: 1.8, max: 5, requires: 'kinzan', vein: 0.3, gold: 0.2 }, // 鉱脈 +30%、金山の金 +20%
    // 軍事
    heinou: { cost: 1, growth: 1.6, max: 10, requires: null, troops: 0.5 },         // 兵の生産 +50%
    teppou: { cost: 3, growth: 1.8, max: 10, requires: 'heinou', power: 0.25 },     // 戦力 +25%
    joubi: { cost: 3, growth: 2.5, max: 5, requires: 'heinou', startTroops: 1 },    // 一番弱い敵城の守備兵 × Lv
    // 人材
    touyou: { cost: 2, growth: 1.8, max: 5, requires: null, rarity: { good: 5, great: 2 } }, // 出現率 +5% / +2%
    kashindan: { cost: 10, growth: 4.0, max: 3, requires: 'touyou', retainerSlots: 1 },
    // 家督
    homare: { cost: 2, growth: 1.7, max: 8, requires: null, prestige: 0.1 },       // 隠居時に得る家格 +10%
    eisai: { cost: 15, growth: 5.0, max: 2, requires: 'homare', heirCandidates: 1 },
    // 自動化
    ando: { cost: 30, growth: 1, max: 1, requires: 'kenchi' },     // 代の開始時に旧領を自動で回復
    fushin: { cost: 50, growth: 1, max: 1, requires: 'ando' },     // 自動普請
    ninsoku: { cost: 10, growth: 2.2, max: 5, requires: 'hosaku', auto: 0.2 }, // 稲刈り・金山が手作業の 20% で自動で進む
    meikou: { cost: 15, growth: 4.0, max: 3, requires: 'kinzan', toolTier: 1 }, // 鎌とツルハシを1段上から始める
    // 軍略
    kaidou: { cost: 2, growth: 1.7, max: 5, requires: null, travel: 0.1 },         // 移動時間 -10%
    monomi: { cost: 3, growth: 2.0, max: 3, requires: 'kaidou', warning: 5 },      // 侵攻の警告 +5秒
    geigeki: { cost: 25, growth: 1, max: 1, requires: 'monomi' },  // 自動迎撃
    saihai: { cost: 5, growth: 2.0, max: 4, requires: 'kaidou', cooldown: 0.15 },  // 采配のクールダウン -15%
  },
  // ---- イベント（4.8。1周に一度だけ起きる。選択肢は2つ）----
  EVENTS: {
    merchant: { kokudaka: 1000, gold: 100 },                   // 旅の商人：A 金 / B 次の登用が良将以上
    marriage: { stage: 2, gradeUp: 0.2, extraCandidates: 1 },  // 隣国の姫との縁談：次の継承で A 格が上がりやすい / B 候補 +1人
    ikki: { stage: 3, riceLoss: 0.3, virtuePerStage: 10, troopLoss: 0.2, power: 1.1 }, // 一揆：A 米を配る / B 鎮圧
    alliance: { stage: 4, virtuePerStage: 10 },                // 同盟の誘い：A 1勢力を併合 / B 断る（遺徳）
    rebellion: { stage: 5, power: 0.9, homeDefense: 2, chance: 0.2, troopLoss: 0.5 }, // 謀反の噂：A 備える / B 無視
  },

  AUTO_BUILD_INTERVAL: 1,          // 自動普請：この秒数ごとに1つ建てる
  AUTO_DEFENSE_POWER_RATIO: 1.5,   // 自動迎撃：守備戦力が侵攻軍の戦力のこの倍率に届く分まで援軍を送る

  // ---- 敵の侵攻 ----
  INVASION: {
    INTERVAL_MIN: 60,       // 侵攻の間隔（秒）：この範囲でランダム
    INTERVAL_MAX: 90,
    STAGE_STEP: 5,          // 段階が1つ上がるごとに間隔をこの秒数短くする
    INTERVAL_FLOOR: 40,     // 間隔の最短
    WARNING_SECONDS: 15,    // 警告が出てから侵攻軍が城に着くまで
    SOURCE_RATE: 0.3,       // 侵攻軍 = 攻めてくる城の守備兵 × この値
    CAP_RATE: 1.5,          // 侵攻軍の上限 = 自軍の総兵力 × この値
    MIN_TROOPS: 1,          // これより少ない侵攻軍は出さない
    POWER_MULT: 1,          // 侵攻軍の戦力 = 兵 × この値
    DEFENSE_PER_CASTLE_LEVEL: 0.2, // 守備戦力 = 守備兵の戦力 × (1 + 城郭Lv × この値)
    HOME_LOOT_RATE: 0.2,    // 本拠地で負けたら米と金をこの割合奪われる
  },

  // ---- 一括購入 ----
  BULK_OPTIONS: [
    { key: '1', label: '×1', count: 1 },
    { key: '10', label: '×10', count: 10 },
    { key: 'max', label: '最大', count: Infinity },
  ],
  DEFAULT_BULK: '1',

  // ---- 目標カーブ（仕様書 1章。設定タブの「各代の石高ログ」で比べる）----
  TARGET: {
    // [代, その代の石高の目安]。シミュレーション10通りの相乗平均を上1桁に丸めた（2026-10-27）。15代より先は端の伸びを延ばす
    KOKUDAKA: [[1, 1e4], [2, 6000], [3, 7000], [4, 5e4], [5, 2e5], [6, 1e6], [7, 6e6], [8, 5e7], [9, 7e8], [10, 1e10],
      [11, 1e11], [12, 4e11], [13, 3e12], [14, 1e13]],
    STAGE_GEN: { 2: 3, 3: 6, 4: 9, 5: 13 }, // 段階に入る目安の代
    UNIFY_GEN: [10, 15],                   // 天下統一の目安の代
    UNIFY_MINUTES: [60, 120],              // 天下統一までの目安の合計時間（分）
  },
};

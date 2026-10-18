// 数値・定数（バランス調整はこのファイルだけで行う）
window.Game = window.Game || {};

Game.config = {
  // ---- ゲームループ ----
  TICK_MS: 100,             // 更新間隔（1秒10ティック）
  MAX_TICK_SECONDS: 1,      // 1ティックで進める最大秒数（スリープ復帰などで時間が飛ばないように）
  DEV_SPEED: 1,             // 開発用の速度倍率（設定画面の実装はステップ5以降）
  DEV_TOOLS: true,          // 設定タブに開発用ボタンを表示する（公開時は false）

  // ---- セーブ ----
  SAVE_KEY: 'sengoku_incremental_save_v1',
  SAVE_VERSION: 1,
  AUTOSAVE_MS: 10000,       // オートセーブ間隔

  // ---- 家 ----
  DEFAULT_HOUSE_NAME: '天野家',

  // ---- 開墾クリック ----
  CLICK: {
    BASE_RICE: 1,           // 1クリックの基本量
    FIELD_LEVEL_STEP: 10,   // 田畑レベルこの数ごとに…
    RATE_SHARE_PER_STEP: 0.05, // …米の毎秒生産量のこの割合をクリック量に加算
  },

  // ---- 節目ボーナス（田畑・市場・兵舎） ----
  MILESTONE_LEVELS: [25, 50, 100, 200],
  MILESTONE_MULT: 2,

  // ---- 施設 ----
  // costBase: 資源ごとの基本コスト / growth: 成長率 / effect: 1レベルあたりの効果
  // produces: 生産する資源（null は生産しない） / unlock: 解放条件（null は最初から）
  FACILITIES: {
    field: {
      costBase: { rice: 10 }, growth: 1.15, effect: 1,
      produces: 'rice', milestone: true, unlock: null,
    },
    market: {
      costBase: { rice: 30 }, growth: 1.15, effect: 0.5,
      produces: 'gold', milestone: true, unlock: { facility: 'field', level: 5 },
    },
    barracks: {
      costBase: { gold: 20 }, growth: 1.17, effect: 0.3,
      produces: 'troops', milestone: true, unlock: { facility: 'market', level: 3 },
    },
    smithy: {
      costBase: { gold: 100 }, growth: 1.25, effect: 0.1, // 戦力 +10%/Lv
      produces: null, milestone: false, unlock: { facility: 'barracks', level: 5 },
    },
    castle: {
      costBase: { rice: 1000, gold: 500 }, growth: 2.0, effect: 1.25, // 全生産 ×1.25^Lv
      produces: null, milestone: false, unlock: { flag: 'firstVictory' },
    },
  },
  // 城の見た目が変わるレベル（砦 / 平城 / 天守 / 巨大城郭）
  CASTLE_LOOK_LEVELS: [0, 3, 6, 10],

  // ---- 武将 ----
  GENERALS: {
    RECRUIT_BASE_COST: 50,    // 登用コスト = 基本 × 成長率^(登用済み人数)（金）
    RECRUIT_GROWTH: 2.2,
    STAT_MIN: 1,              // 能力の範囲
    STAT_MAX: 100,
    // レア度：weight は出現の重み、bonus は能力の底上げ
    // （能力 = (STAT_MIN〜STAT_MAX-bonus のランダム) + bonus。上限は STAT_MAX のまま）
    RARITIES: [
      { id: 'normal', weight: 70, bonus: 0, epithet: false },
      { id: 'good', weight: 25, bonus: 20, epithet: false },
      { id: 'great', weight: 5, bonus: 40, epithet: true },
    ],
    DOMESTIC_PER_POLITICS: 0.01, // 内政担当：全生産 +政治×1%
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
    DEALT_RATE: 0.2,          // 毎秒、敵の守備兵が「自軍戦力 × この値」減る
    TAKEN_RATE: 0.12,         // 毎秒、自軍の兵が「敵の守備戦力 × この値」減る
    ENEMY_RECOVERY_RATE: 0.01, // 戦っていない敵城は、毎秒「満員の守備兵 × この値」ずつ回復
    MIN_SIEGE_SECONDS: 5,     // 攻城戦の最低の長さ。これより早く決着しそうなら、双方の損害を同じ割合で遅くする（0 で無効）
    // 采配
    CHARGE_SECONDS: 5,  CHARGE_DEALT: 2,   CHARGE_TAKEN: 1.5, CHARGE_COOLDOWN: 20,
    RALLY_SECONDS: 5,   RALLY_TAKEN: 0.5,  RALLY_COOLDOWN: 25,
    AMBUSH_RATE: 0.15,  AMBUSH_PER_INTELLECT: 0.001, AMBUSH_COOLDOWN: 40, // 知略100で +10%
    RETREAT_TAKEN: 0.5,       // 退却中に受ける損害の倍率
    RETREAT_PURSUIT_SECONDS: 3, // 退却を始めてから追撃を受ける秒数
    // 勝利報酬
    TERRITORY_RICE_RATE: 0.02, // 領地：米 +敵兵力 × この値 /秒（全体倍率がかかる）
    MERIT_RATE: 0.1,           // 功績 +敵兵力 × この値
  },

  // ---- 当主と家督継承 ----
  LORD: {
    // 当主に寿命はない。継承はプレイヤーが隠居したときだけ
    RETIRE_AFTER: 60,       // 代の開始からこの秒数たつと隠居できる
    GROWTH_WINDOW: 60,      // 家格の伸び = 直近この秒数で増えた「今隠居すると得る家格」
    GROWTH_SAMPLE: 1,       // 伸びを測るために記録する間隔（秒）
    CHANCE_RATIO: 0.5,      // 伸びが最大時のこの割合を下回ったら「隠居の好機」
    HEIR_CANDIDATES: 3,     // 跡継ぎ候補の人数
    BASE_RETAINER_SLOTS: 1, // 譜代家臣として次の代へ連れていける人数
    FORMER_LAND_RATE: 0.1,  // 旧領（前の代までに落とした城）は守備兵がこの割合になる
  },
  PRESTIGE: {
    // 継承で得る家格 = floor((その代の石高 ÷ DIVISOR) ^ EXPONENT)
    DIVISOR: 1000,
    EXPONENT: 0.5,
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
    secretBook: { virtue: 1.5 },           // 秘伝の書：得る遺徳 ×1.5（遺徳はステップ4c）
    crown: { prestigeMult: 1.5 },          // 天下の宝冠：家格倍率 ×1.5
  },

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
    MERIT_RATE: 0.2,        // 守りきったら 功績 +侵攻軍の兵力 × この値
    HOME_LOOT_RATE: 0.2,    // 本拠地で負けたら米と金をこの割合奪われる
  },

  // ---- 一括購入 ----
  BULK_OPTIONS: [
    { key: '1', label: '×1', count: 1 },
    { key: '10', label: '×10', count: 10 },
    { key: 'max', label: '最大', count: Infinity },
  ],
  DEFAULT_BULK: '1',
};

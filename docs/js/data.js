// データ定義（名前・説明など。数値は config.js）
window.Game = window.Game || {};

Game.data = {
  RESOURCES: {
    rice: { name: '米', unit: '石' },
    gold: { name: '金', unit: '貫' },
    troops: { name: '兵', unit: '人' },
  },

  // 表示順に並べる
  FACILITIES: [
    { id: 'field', name: '田畑', desc: '田を拓き、米を実らせる。' },
    { id: 'market', name: '市場', desc: '商人を呼び込み、金を稼ぐ。' },
    { id: 'barracks', name: '兵舎', desc: '足軽を集め、兵を養う。' },
    { id: 'smithy', name: '鍛冶場', desc: '刀槍を鍛え、軍の戦力を高める。' },
    { id: 'castle', name: '城郭', desc: '本拠地の城を広げ、国全体を富ませる。' },
  ],
  CASTLE_LOOKS: ['砦', '平城', '天守', '巨大城郭'],
  FLAG_NAMES: { firstVictory: '最初の合戦に勝利' },

  // ---- 武将 ----
  RARITY_NAMES: { normal: '並', good: '良将', great: '名将' },

  STATS: [
    { id: 'leadership', name: '統率' },
    { id: 'valor', name: '武勇' },
    { id: 'intellect', name: '知略' },
    { id: 'politics', name: '政治' },
  ],

  // 配置先
  ASSIGNMENTS: [
    { id: 'domestic', name: '内政担当' },
    { id: 'commander', name: '軍団長' },
    { id: 'castellan', name: '城代' },
    { id: 'idle', name: '待機' },
  ],

  // 姓・名の候補（実在の有名武将と一致しないよう、有名な名は入れない）
  SURNAMES: [
    '青木', '秋山', '天方', '新井', '有馬', '池野', '石原', '稲垣', '今井', '岩城',
    '上野', '内藤', '岡田', '小川', '尾関', '笠原', '梶原', '川村', '菊池', '木村',
    '久保', '栗田', '小島', '坂井', '佐野', '篠原', '清水', '杉浦', '高木', '田代',
    '土屋', '中川', '永井', '西尾', '野村', '長谷川', '平野', '堀田', '松井', '三浦',
    '村上', '森川', '矢島', '山口', '横山', '吉岡', '和田',
  ],
  GIVEN_NAMES: [
    '与一郎', '源五郎', '弥太郎', '新八郎', '清兵衛', '甚内', '小平太', '藤十郎', '半右衛門', '孫六',
    '喜兵衛', '惣兵衛', '市之丞', '主水', '帯刀', '隼人', '内記', '采女', '左馬助', '彦四郎',
    '又七', '長兵衛', '忠右衛門', '勘解由', '太郎左衛門', '弥平次', '兵庫助', '求馬', '数馬', '久蔵',
  ],
  // ---- 段階と敵城 ----
  // castles: 敵城（troops = 守備兵、heirloom = 落としたときに得る家宝）
  // map: 地図の配置（座標は viewBox 1000×560 基準）
  HOME_NAME: '本拠地',
  STAGES: [
    {
      stage: 1, name: '国人衆期', region: '尾張の郡',
      castles: [
        { id: 's1_nobushi', name: '野武士の砦', troops: 30 },
        { id: 's1_dogou', name: '隣村の土豪', troops: 100 },
        { id: 's1_kawazoi', name: '川沿いの国人', troops: 300 },
        { id: 's1_hatagashira', name: '郡の旗頭', troops: 1000, boss: true, heirloom: 'teaBowl' },
      ],
      map: {
        positions: {
          home: { x: 90, y: 330 },
          s1_nobushi: { x: 300, y: 220 },
          s1_dogou: { x: 450, y: 130 },
          s1_kawazoi: { x: 540, y: 420 },
          s1_hatagashira: { x: 830, y: 280 },
        },
        roads: [
          ['home', 's1_nobushi'],
          ['s1_nobushi', 's1_dogou'],
          ['s1_nobushi', 's1_kawazoi'],
          ['s1_dogou', 's1_hatagashira'],
          ['s1_kawazoi', 's1_hatagashira'],
        ],
        // 飾り（川・山）。SVG のパス
        rivers: ['M 400 0 C 450 140, 360 300, 430 420 S 470 520, 450 560'],
        mountains: [{ x: 700, y: 110 }, { x: 740, y: 140 }, { x: 680, y: 470 }],
      },
    },
    {
      stage: 2, name: '一国統一期', region: '尾張',
      castles: [
        { id: 's2_inuyama', name: '犬山の城主', troops: 3000 },
        { id: 's2_iwakura', name: '岩倉の城主', troops: 9000 },
        { id: 's2_narumi', name: '鳴海の城主', troops: 24000 },
        { id: 's2_kiyosu', name: '清洲の守護代', troops: 90000, boss: true, heirloom: 'artOfWar' },
      ],
      map: {
        positions: {
          home: { x: 110, y: 150 },
          s2_inuyama: { x: 405, y: 145 },
          s2_iwakura: { x: 530, y: 260 },
          s2_narumi: { x: 580, y: 420 },
          s2_kiyosu: { x: 790, y: 330 },
        },
        roads: [
          ['home', 's2_inuyama'],
          ['s2_inuyama', 's2_iwakura'],
          ['s2_iwakura', 's2_narumi'],
          ['s2_iwakura', 's2_kiyosu'],
          ['s2_narumi', 's2_kiyosu'],
        ],
        rivers: ['M 660 0 C 620 150, 720 300, 650 420 S 640 520, 660 560'],
        mountains: [{ x: 160, y: 80 }, { x: 200, y: 110 }, { x: 380, y: 480 }],
      },
    },
    {
      stage: 3, name: '地方統一期', region: '東海・近畿',
      castles: [
        { id: 's3_mikawa', name: '三河の国衆', troops: 3e5 },
        { id: 's3_kitabatake', name: '伊勢の北畠家', troops: 1.2e6 },
        { id: 's3_azai', name: '近江の浅井家', troops: 4.5e6 },
        { id: 's3_saito', name: '美濃の斎藤家', troops: 3e7, boss: true, heirloom: 'famedSword' },
      ],
      map: {
        positions: {
          home: { x: 80, y: 280 },
          s3_mikawa: { x: 300, y: 400 },
          s3_kitabatake: { x: 640, y: 330 },
          s3_azai: { x: 480, y: 170 },
          s3_saito: { x: 830, y: 230 },
        },
        roads: [
          ['home', 's3_mikawa'],
          ['s3_mikawa', 's3_kitabatake'],
          ['s3_mikawa', 's3_azai'],
          ['s3_azai', 's3_saito'],
          ['s3_kitabatake', 's3_saito'],
        ],
        rivers: ['M 0 120 C 200 160, 330 90, 420 0', 'M 700 560 C 680 420, 760 360, 720 260'],
        mountains: [{ x: 640, y: 90 }, { x: 680, y: 120 }, { x: 720, y: 90 }, { x: 200, y: 520 }],
      },
    },
    {
      stage: 4, name: '大国攻略期', region: '東国・西国',
      castles: [
        { id: 's4_imagawa', name: '駿河の今川家', troops: 3e7 },
        { id: 's4_hojo', name: '相模の北条家', troops: 2e8, heirloom: 'secretBook' },
        { id: 's4_takeda', name: '甲斐の武田家', troops: 1e9 },
        { id: 's4_uesugi', name: '越後の上杉家', troops: 5e9 },
        { id: 's4_mori', name: '安芸の毛利家', troops: 3e10, boss: true, heirloom: 'crown' },
      ],
      map: {
        positions: {
          home: { x: 90, y: 250 },
          s4_imagawa: { x: 280, y: 270 },
          s4_hojo: { x: 470, y: 360 },
          s4_takeda: { x: 450, y: 230 },
          s4_uesugi: { x: 690, y: 150 },
          s4_mori: { x: 870, y: 340 },
        },
        roads: [
          ['home', 's4_imagawa'],
          ['s4_imagawa', 's4_hojo'],
          ['s4_imagawa', 's4_takeda'],
          ['s4_hojo', 's4_takeda'],
          ['s4_takeda', 's4_uesugi'],
          ['s4_uesugi', 's4_mori'],
          ['s4_hojo', 's4_mori'],
        ],
        rivers: ['M 340 0 C 380 120, 330 220, 380 330 S 330 480, 360 560'],
        mountains: [{ x: 560, y: 340 }, { x: 600, y: 370 }, { x: 640, y: 340 }, { x: 860, y: 110 }],
      },
    },
    {
      stage: 5, name: '天下統一', region: '天下',
      castles: [
        { id: 's5_rengo', name: '西国大名連合', troops: 1e11 },
        { id: 's5_kessen', name: '天下分け目の決戦', troops: 1e12, boss: true },
      ],
      map: {
        positions: {
          home: { x: 550, y: 315 },
          s5_rengo: { x: 290, y: 300 },
          s5_kessen: { x: 150, y: 380 },
        },
        roads: [
          ['home', 's5_rengo'],
          ['s5_rengo', 's5_kessen'],
        ],
        rivers: ['M 650 0 C 610 180, 700 380, 640 560'],
        mountains: [{ x: 300, y: 120 }, { x: 340, y: 150 }, { x: 300, y: 470 }, { x: 760, y: 120 }],
      },
    },
  ],

  // ---- 稲刈りと金山の道具（数値は config.js の WORK.SICKLES / PICKAXES）----
  SICKLE_NAMES: ['錆びた鎌', '鉄の鎌', '鋼の鎌', '名工の鎌', '天下の大鎌'],
  PICKAXE_NAMES: ['鉄のツルハシ', '鋼のツルハシ', '名工のツルハシ', '天下のツルハシ'],

  // ---- イベント（数値は config.js の EVENTS。選択肢の説明は systems.eventChoiceText）----
  EVENTS: {
    merchant: { title: '旅の商人が来た', text: '珍しい品を携えた旅の商人が、城下を訪ねてきた。「何かお役に立てることは」', choices: ['品を買い取らせる', '人の噂を聞く'] },
    marriage: { title: '隣国の姫との縁談', text: '尾張の国人たちをまとめつつある当家に、隣国から姫との縁談が持ち込まれた。', choices: ['家柄の良い姫を迎える', '子だくさんの家と結ぶ'] },
    ikki: { title: '一揆が起きた', text: '重い年貢に耐えかねた百姓たちが、一揆を起こした。', choices: ['米を配る', '鎮圧する'] },
    alliance: { title: '大大名からの同盟の誘い', text: '東国の大大名から、同盟の誘いが届いた。「手を結べば、一国を任せよう」', choices: ['受ける', '断る'] },
    rebellion: { title: '本拠地で謀反の噂', text: '天下を目前にして、本拠地の家臣に謀反の噂が立っている。', choices: ['備える', '無視する'] },
  },

  // ---- 家宝（効果の数値は config.js の HEIRLOOMS）----
  HEIRLOOMS: [
    { id: 'teaBowl', name: '名物の茶器', desc: '全生産 ×1.5' },
    { id: 'artOfWar', name: '古の兵法書', desc: '戦力 ×1.5、譜代枠 +1' },
    { id: 'famedSword', name: '名刀', desc: 'ボス城での戦力 ×1.3' },
    { id: 'secretBook', name: '秘伝の書', desc: '得る遺徳 ×1.5' },
    { id: 'crown', name: '天下の宝冠', desc: '家格倍率 ×1.5' },
  ],

  // ---- 家訓（数値は config.js の PRECEPTS）----
  // 系統ごとに列で並べる。系統の中は前提の家訓の下に字下げして並べる
  // （ステップ4dの家訓は、ここと config に足せば同じ画面に並ぶ）
  PRECEPT_BRANCHES: [
    { id: 'domestic', name: '内政' },
    { id: 'military', name: '軍事' },
    { id: 'talent', name: '人材' },
    { id: 'house', name: '家督' },
    { id: 'automation', name: '自動化' },
    { id: 'strategy', name: '軍略' },
  ],
  PRECEPTS: [
    { id: 'rakuichi', branch: 'domestic', name: '楽市楽座' },
    { id: 'kenchi', branch: 'domestic', name: '検地' },
    { id: 'fukoku', branch: 'domestic', name: '富国' },
    { id: 'hosaku', branch: 'domestic', name: '豊作' },
    { id: 'kinzan', branch: 'domestic', name: '金山開発' },
    { id: 'koudou', branch: 'domestic', name: '坑道の記録' },
    { id: 'koumyaku', branch: 'domestic', name: '鉱脈探し' },
    { id: 'heinou', branch: 'military', name: '兵農分離' },
    { id: 'teppou', branch: 'military', name: '鉄砲隊' },
    { id: 'joubi', branch: 'military', name: '常備兵' },
    { id: 'touyou', branch: 'talent', name: '人材登用' },
    { id: 'kashindan', branch: 'talent', name: '家臣団' },
    { id: 'homare', branch: 'house', name: '家名の誉れ' },
    { id: 'eisai', branch: 'house', name: '英才教育' },
    { id: 'ando', branch: 'automation', name: '旧領安堵' },
    { id: 'fushin', branch: 'automation', name: '自動普請' },
    { id: 'ninsoku', branch: 'automation', name: '人足' },
    { id: 'meikou', branch: 'automation', name: '名工の伝手' },
    { id: 'kaidou', branch: 'strategy', name: '街道整備' },
    { id: 'monomi', branch: 'strategy', name: '物見櫓' },
    { id: 'geigeki', branch: 'strategy', name: '自動迎撃' },
    { id: 'saihai', branch: 'strategy', name: '采配の極意' },
  ],

  // ---- 当主 ----
  // 当主の名（姓は家名から取る）。実在の有名武将の名は入れない
  LORD_GIVEN_NAMES: [
    '宗則', '頼方', '貞道', '康成', '正綱', '重光', '直房', '政景', '長頼', '勝重',
    '時定', '景継', '秀種', '元周', '利貞', '高綱', '清胤', '定房', '義範', '経之',
    '宗佐', '忠房', '昌胤', '広成',
  ],
  // 特性の名前（効果の説明は config の数値から作る）
  TRAITS: {
    domestic: { name: '内政型' },
    martial: { name: '武勇型' },
    veteran: { name: '老練型' },
    thrifty: { name: '倹約型' },
    precocious: { name: '早熟型' },
    wise: { name: '名君' },
  },
  TRAIT_GRADE_NAMES: ['凡', '良', '優', '傑', '天'],

  // 名将の二つ名
  EPITHETS: [
    '鬼神', '疾風', '鉄壁', '剛勇無双', '千里眼', '仁将', '不動', '槍の名手', '治世の才', '智謀の泉',
    '常勝', '雷光', '獅子奮迅', '算勘の鬼', '白髪の老将',
  ],
};

// 初期化とゲームループ
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  let lastTime = Date.now();
  Game.devSpeed = cfg.DEV_SPEED; // 開発用の速度倍率（設定タブで切り替える）

  function loop() {
    const now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // 時計の巻き戻りや長時間の停止（スリープ等）で時間が飛ばないように制限
    dt = Math.max(0, Math.min(dt, cfg.MAX_TICK_SECONDS)) * Game.devSpeed;

    // 速度倍率を上げたときは細かく分けて進める
    while (dt > 1e-9) {
      const step = Math.min(dt, cfg.STEP_SECONDS);
      Game.systems.tick(Game.state.current, step);
      dt -= step;
    }
    Game.ui.update();
  }

  function start() {
    Game.state.load();
    Game.ui.init();

    lastTime = Date.now();
    setInterval(loop, cfg.TICK_MS);
    setInterval(Game.state.save, cfg.AUTOSAVE_MS);
    // リロード・終了時にも保存（最大10秒ぶんの巻き戻りを防ぐ）
    window.addEventListener('beforeunload', Game.state.save);
    // スマホはアプリを切り替えると beforeunload が来ないことがあるので、隠れたときにも保存する
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') Game.state.save();
    });
    registerServiceWorker();
  }

  // PWA：オフラインでも遊べるようにする（http/https で開いたときだけ。file:// では使えない）
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  start();
})();

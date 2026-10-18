// 初期化とゲームループ
window.Game = window.Game || {};

(function () {
  const cfg = Game.config;
  let lastTime = Date.now();

  function loop() {
    const now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // 時計の巻き戻りや長時間の停止（スリープ等）で時間が飛ばないように制限
    dt = Math.max(0, Math.min(dt, cfg.MAX_TICK_SECONDS)) * cfg.DEV_SPEED;

    Game.systems.tick(Game.state.current, dt);
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
  }

  start();
})();

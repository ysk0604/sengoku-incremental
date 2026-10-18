// 数値の表示（万・億・兆・京…）
window.Game = window.Game || {};

(function () {
  const UNITS = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極'];
  const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 表示桁で切り捨て（「持っている量」を多く見せないため）
  function truncate(v, decimals) {
    const p = Math.pow(10, decimals);
    return Math.floor(v * p + 1e-9) / p;
  }

  function num(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + num(-n);

    if (n < 1e4) {
      const v = truncate(n, 1);
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    }

    let idx = Math.floor(Math.log10(n) / 4);
    let v = n / Math.pow(10, idx * 4);
    // 浮動小数の誤差で境界がずれた場合の補正
    if (v >= 1e4) { idx++; v /= 1e4; }
    if (v < 1) { idx--; v *= 1e4; }

    if (idx >= UNITS.length) {
      return n.toExponential(2).replace('+', '');
    }

    const decimals = v < 10 ? 2 : v < 100 ? 1 : 0;
    return truncate(v, decimals).toFixed(decimals) + UNITS[idx];
  }

  // 毎秒の増加量
  function rate(n) {
    return '+' + num(n) + '/秒';
  }

  // 倍率表示（×1.25 など）
  function mult(n) {
    return '×' + (n < 1e4 ? String(Math.round(n * 100) / 100) : num(n));
  }

  // 1〜99 を漢数字に（代数の表示用）
  function kanji(n) {
    if (n < 10) return KANJI_DIGITS[n];
    if (n >= 100) return String(n);
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return (tens > 1 ? KANJI_DIGITS[tens] : '') + '十' + (ones ? KANJI_DIGITS[ones] : '');
  }

  Game.format = { num, rate, mult, kanji };
})();

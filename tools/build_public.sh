#!/bin/sh
# 公開用のファイルを docs/ にまとめる（GitHub Pages は main ブランチの /docs を公開する）
# 使い方：リポジトリの一番上で  sh tools/build_public.sh
#
# - 入れるもの：index.html・manifest.webmanifest・sw.js・css/・js/・assets/img/・assets/icon/
# - 入れないもの：tools/（シミュレーション）・GAME_SPEC.md・PUBLISH.md・assets/IMAGE_LIST.md
# - 開発用ボタンを消す（js/config.js の DEV_TOOLS を false に）
# - sw.js の CACHE を作った日時に変える（スマホに保存された古いファイルを、新しいものに入れ替えさせるため）
set -e
cd "$(dirname "$0")/.."

OUT=docs
rm -rf "$OUT"
mkdir -p "$OUT/assets"

cp index.html manifest.webmanifest sw.js "$OUT/"
cp -r css js "$OUT/"
cp -r assets/img assets/icon "$OUT/assets/"
# GitHub Pages の変換（Jekyll）を使わず、ファイルをそのまま出す
: > "$OUT/.nojekyll"

# 開発用ボタンを消す
sed -i 's/^  DEV_TOOLS: true,/  DEV_TOOLS: false,/' "$OUT/js/config.js"
grep -q '^  DEV_TOOLS: false,' "$OUT/js/config.js" || { echo 'DEV_TOOLS を false にできませんでした' >&2; exit 1; }

# 保存の名前（CACHE）を作った日時にする
STAMP=$(date +%Y%m%d-%H%M%S)
sed -i "s/^const CACHE = '[^']*';/const CACHE = 'sengoku-$STAMP';/" "$OUT/sw.js"
grep -q "^const CACHE = 'sengoku-$STAMP';" "$OUT/sw.js" || { echo 'sw.js の CACHE を変えられませんでした' >&2; exit 1; }

# sw.js に書いたファイルが、すべて docs/ にあるか確かめる
missing=0
for f in $(grep -o "^  '[^']*'," "$OUT/sw.js" | tr -d " ',"); do
  [ "$f" = './' ] && continue
  if [ ! -f "$OUT/$f" ]; then echo "見つからない：$f" >&2; missing=1; fi
done
# assets/img/ の画像が、すべて sw.js に書いてあるか確かめる
for f in "$OUT"/assets/img/*.webp; do
  name="assets/img/$(basename "$f")"
  grep -q "'$name'" "$OUT/sw.js" || { echo "sw.js の IMAGES に無い：$name" >&2; missing=1; }
done
[ $missing -eq 0 ] || exit 1

echo "docs/ を作りました（CACHE = sengoku-$STAMP、$(find "$OUT" -type f | wc -l) ファイル）"

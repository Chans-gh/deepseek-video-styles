#!/usr/bin/env bash
# 确定性校验：同一 t 渲染两次，逐张比哈希。
# 用法：bash scripts/check-determinism.sh <场景.html> [16:9|9:16] [1.2,3.4,5.6]
#
# 为什么只比样帧不比整片：整片相同的充要条件就是每帧相同，
# 取三个时间点已能抓住 Math.random / Date.now / 累计状态这三类漏网。
set -euo pipefail
ORIGPWD=$PWD
cd "$(dirname "$0")"

SCENE=${1:?用法: check-determinism.sh <场景.html> [aspect] [时间点,逗号分隔]}
ASPECT=${2:-16:9}
TIMES=${3:-1.2,3.4,5.6}
# 脚本会 cd 到自身目录，相对路径要按调用处解析，否则一律找不到文件
[[ "$SCENE" = /* ]] || SCENE="$ORIGPWD/$SCENE"

hash_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    sha256sum "$1" | cut -d' ' -f1
  fi
}

rm -rf /tmp/dv-det-a /tmp/dv-det-b
for run in a b; do
  node render.mjs --scene "$SCENE" --out "/tmp/dv-det-$run" \
    --aspect "$ASPECT" --stills "$TIMES" --stills-only > /dev/null
done

ok=1
for f in /tmp/dv-det-a/stills/*.png; do
  b="/tmp/dv-det-b/stills/$(basename "$f")"
  if [ "$(hash_of "$f")" != "$(hash_of "$b")" ]; then
    ok=0
    echo "✗ $(basename "$f") 两次渲染不一致"
  fi
done

if [ $ok = 1 ]; then
  echo "✓ 确定性通过（${SCENE} ${ASPECT}，${TIMES} 三点像素一致）"
else
  echo "✗ 不确定：按顺序排查 Math.random / Date.now / requestAnimationFrame / 字体未就绪"
  exit 1
fi

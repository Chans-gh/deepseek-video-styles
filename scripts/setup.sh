#!/usr/bin/env bash
# 一次性准备渲染环境：装依赖 + 探测 Chrome。
# 用法：bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "→ 安装依赖（puppeteer-core + @ffmpeg-installer/ffmpeg）…"
  npm install --no-fund --no-audit
else
  echo "→ 依赖已存在，跳过安装"
fi

# render.mjs 用 puppeteer-core 驱动本机 Chrome，不下载 Chromium
CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  "/usr/bin/google-chrome"
  "/usr/bin/chromium"
  "/usr/bin/chromium-browser"
)
FOUND=""
for p in "${CANDIDATES[@]}"; do
  [ -x "$p" ] && { FOUND="$p"; break; }
done

if [ -n "$FOUND" ]; then
  echo "→ 浏览器：$FOUND"
  echo "   （若不是上面这个，运行前 export CHROME_PATH=/你的/路径）"
else
  echo "✗ 没找到 Chrome / Chromium / Edge。"
  echo "  装一个，或 export CHROME_PATH=/path/to/chrome 后再跑渲染。"
  exit 1
fi

echo "✓ 环境就绪。先试一条："
echo "  node scripts/render.mjs --scene assets/scenes/_starter-canvas.html --out /tmp/try --aspect 16:9 --stills 1,3,5 --stills-only"

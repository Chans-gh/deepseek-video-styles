#!/usr/bin/env node
/**
 * 确定性逐帧渲染器（Canvas / SVG / WebGL / Three.js 通用）
 *
 * 场景契约（每个 scene HTML 必须提供）：
 *   window.__meta = { width, height, fps, duration }
 *   window.seek(t)  ->  画出 t 秒这一帧；同一 t 必须得到同一像素
 *
 * 用法：
 *   node render.mjs --scene scenes/x.html --out out/x [--fps 24] [--duration 6]
 *                   [--stills 0,1.5,3] [--crf 18]
 */
import puppeteer from 'puppeteer-core';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Chrome 由 puppeteer-core 驱动，不下载 Chromium。按平台逐个探测，
// 也可以 export CHROME_PATH=/path/to/chrome 直接指定。
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!CHROME) {
  console.error('没找到 Chrome / Chromium / Edge。装一个，或 export CHROME_PATH=/path/to/chrome 再跑。');
  console.error('已尝试：');
  for (const p of CHROME_CANDIDATES) console.error('  ' + p);
  process.exit(1);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const sceneArg = arg('scene');
if (!sceneArg) {
  console.error('缺少 --scene <html>');
  process.exit(1);
}
const scenePath = path.resolve(sceneArg);
// 生成自包含副本（lib 已内联），渲染跑这个文件
const BUILT = path.join(path.dirname(scenePath), '.' + path.basename(scenePath, '.html') + '.build.html');
fs.writeFileSync(BUILT, inlineScripts(fs.readFileSync(scenePath, 'utf8'), path.dirname(scenePath)), 'utf8');
const outDir = path.resolve(arg('out', path.join(HERE, 'out', path.basename(sceneArg, '.html'))));
const fpsOverride = Number(arg('fps', '0'));
const durOverride = Number(arg('duration', '0'));
// 注意：不能写成 ''.split(',').map(Number) —— Number('') 是 0 不是 NaN，
// 不加 --stills 时会静默多截一张 t=0 的样帧，还要去删一次 stills 目录。
// 批量渲染跑久了会累计触发安全删除阈值，进程在编码前就崩掉（看起来像"渲染失败"）。
const stillsArg = arg('stills', '').trim();
const stills = stillsArg
  ? stillsArg.split(',').map(Number).filter((n) => !Number.isNaN(n))
  : [];
const stillsOnly = process.argv.includes('--stills-only');
const crf = arg('crf', '18');
// 双画幅：--aspect 16:9 | 9:16。场景从 ?aspect= 读取并选用对应版面表，
// 不是缩放——竖屏要重排，横屏的版面塞进竖屏会字太小、留白失衡。
const aspect = arg('aspect', '');
const aspectTag = aspect ? '-' + aspect.replace(':', 'x') : '';

fs.mkdirSync(outDir, { recursive: true });
const frameDir = path.join(outDir, 'frames');
// 批量删除会被安全策略拦下（一次删 144 个文件）。
// 帧文件名是固定的 f%05d.png，逐帧覆盖即可，不必先清目录。
try {
  fs.rmSync(frameDir, { recursive: true, force: true });
} catch {
  /* 复用已有目录 */
}
fs.mkdirSync(frameDir, { recursive: true });

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-render-'));
process.on('exit', () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ } });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: PROFILE,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--disable-background-networking',
    '--force-color-profile=srgb',
    '--force-device-scale-factor=1',
    '--disable-lcd-text',
    '--allow-file-access-from-files',
    // 字形栅格化必须钉死：默认会做亚像素定位 + hinting，
    // 同一 t 两次渲染会在笔画的抗锯齿边缘差十来个像素，
    // 确定性校验（sha256）就会偶发地挂，而画面本身看不出区别。
    '--disable-font-subpixel-positioning',
    '--font-render-hinting=none',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
  ],
});

// 复用初始页（Chrome 156 下 newPage 偶发拿不到主帧）
const openPages = await browser.pages();
const page = openPages[0] || await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text());
});
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

await page.goto('file://' + BUILT + (aspect ? '?aspect=' + encodeURIComponent(aspect) : ''), { waitUntil: 'load' });await page.waitForFunction(() => typeof window.seek === 'function', { timeout: 20000 });
// 字体必须先就绪：系统字体是懒加载的，seek 一执行 measureText 就可能拿到
// 回退字体的宽度，同样的 t 两次渲染差几个像素——确定性校验会随机挂。
await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
await page.evaluate(() => window.seek(0));

const meta = await page.evaluate(() => window.__meta || {});
const width = Number(meta.width) || 1080;
const height = Number(meta.height) || 1080;
const fps = fpsOverride || Number(meta.fps) || 24;
const duration = durOverride || Number(meta.duration) || 5;
const total = Math.round(fps * duration);

await page.setViewport({ width, height, deviceScaleFactor: 1 });

console.log(`场景 ${path.basename(scenePath)}${aspect ? ' [' + aspect + ']' : ''} → ${width}x${height} ${fps}fps ${duration}s (${total} 帧)`);

/* 把 <script src="..."> 内联后再加载：
   file:// 下的子资源加载在不同 Chrome 版本上行为不一致，
   内联成单文件既稳，也符合"场景自包含"的交付约定。 */
function inlineScripts(html, baseDir) {
  return html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
    const p = path.resolve(baseDir, src);
    if (!fs.existsSync(p)) { console.warn('  警告：缺少脚本', src); return m; }
    return `<script>\n${fs.readFileSync(p, 'utf8')}\n</script>`;
  });
}

const t0 = Date.now();
if (!stillsOnly) {
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    await page.evaluate((tt) => window.seek(tt), t);
    await page.screenshot({
      path: path.join(frameDir, `f${String(i).padStart(5, '0')}.png`),
      type: 'png',
      captureBeyondViewport: false,
    });
    if (i % 24 === 0) process.stdout.write(`\r  渲染 ${i + 1}/${total}`);
  }
  process.stdout.write(`\r  渲染 ${total}/${total}\n`);
}
const renderSec = (Date.now() - t0) / 1000;

// 指定时间点的样帧（用于快速看风格是否成立）
if (stills.length) {
  const stillDir = path.join(outDir, 'stills');
  // 同理：清目录会被安全策略拦（累计删除额度），样帧名是按时间点固定的，
  // 直接覆盖即可。
  try {
    fs.rmSync(stillDir, { recursive: true, force: true });
  } catch {
    /* 复用 */
  }
  fs.mkdirSync(stillDir, { recursive: true });
  for (const s of stills) {
    await page.evaluate((tt) => window.seek(tt), s);
    await page.screenshot({ path: path.join(stillDir, `t${s.toFixed(2)}.png`), type: 'png' });
  }
  console.log(`  样帧 ${stills.length} 张 → stills/`);
}

await browser.close();

if (stillsOnly) {
  console.log(`  仅样帧模式，跳过编码。耗时 ${renderSec.toFixed(1)}s`);
  process.exit(0);
}

// 编码
const mp4 = path.join(outDir, `${path.basename(scenePath, '.html')}${aspectTag}.mp4`);
const ff = spawnSync(ffmpegPath.path, [
  '-y', '-loglevel', 'error',
  '-framerate', String(fps),
  '-i', path.join(frameDir, 'f%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  mp4,
], { encoding: 'utf8' });
if (ff.status !== 0) {
  console.error('ffmpeg 编码失败:', ff.stderr);
  process.exit(2);
}
const size = (fs.statSync(mp4).size / 1024 / 1024).toFixed(1);
console.log(`  成片 ${path.relative(process.cwd(), mp4)} (${size} MB)  渲染耗时 ${renderSec.toFixed(1)}s`);

// 自检：相邻帧差异（抓“整片没动”和“帧间闪烁”）
const probe = spawnSync(ffmpegPath.path, [
  '-i', mp4, '-vf', 'select=gt(scene\\,0.0001),metadata=print', '-f', 'null', '-',
], { encoding: 'utf8' });
const moved = (probe.stderr.match(/pts_time/g) || []).length;
console.log(`  动态帧 ${moved}/${total}`);

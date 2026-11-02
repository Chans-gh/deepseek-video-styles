/* ============================================================
   DV core —— 确定性基础设施
   规则：不许 Math.random / Date.now；同一 t 必须得到同一像素。
   本文件用经典 <script> 引入，挂到 window.DV。
   ============================================================ */
window.DV = window.DV || {};
(function (DV) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const smooth5 = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const remap = (v, a, b, c, d) => lerp(c, d, inv(a, b, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const sign = (v) => (v < 0 ? -1 : 1);

  /* ---------- 整数哈希（跨平台确定，不依赖 Math.sin） ---------- */
  function hash32(x) {
    x = x | 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  const h2 = (x, y) => hash32(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263));
  const h3 = (x, y, z) => hash32(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177));

  /* ---------- 种子随机 ---------- */
  function rng(seed = 1) {
    let a = (seed >>> 0) || 1;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      sign: () => (next() < 0.5 ? -1 : 1),
      // 粗略高斯（Box-Muller）
      gauss: () => {
        const u = Math.max(1e-9, next()), v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
      },
    };
  }

  /* ---------- 值噪声 / fbm ---------- */
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth5(xf), v = smooth5(yf);
    const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  const noise1 = (x) => noise2(x, 13.37);
  function fbm2(x, y, oct = 4, lac = 2.0, gain = 0.5) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
    return s / norm;
  }
  const fbm1 = (x, oct = 4) => fbm2(x, 13.37, oct);
  // 山脊噪声：做山脉轮廓比 fbm 更像山
  function ridge1(x, oct = 5) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(noise2(x * f, 91.7) * 2 - 1);
      s += amp * n * n; norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  }

  /* ---------- 缓动 ---------- */
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
    outElastic: (t) => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
  };

  /* ---------- 颜色 ---------- */
  const hex2rgb = (h) => {
    const s = h.replace('#', '');
    const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  const rgb2hex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  // css('r,g,b', a) 也支持："126,255,158"
  function css(c, a = 1) {
    if (Array.isArray(c)) return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    if (typeof c === 'string' && c.startsWith('#')) {
      const [r, g, b] = hex2rgb(c);
      return a >= 1 ? c : `rgba(${r},${g},${b},${a})`;
    }
    if (typeof c === 'string' && c.includes(',') && !c.startsWith('rgb')) {
      return `rgba(${c},${a})`;
    }
    return c;
  }
  const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const shade = (c, k) => c.map((v) => clamp(v * k, 0, 255));

  /* ---------- Canvas 工具 ---------- */
  function cv2d(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    return cv;
  }
  const ctxOf = (cv) => cv.getContext('2d');
  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }
  function fitSize(g, text, maxW, maxH, family, weight = '700', start = 0) {
    let size = start || maxH;
    g.font = `${weight} ${size}px ${family}`;
    const w = g.measureText(text).width || 1;
    if (w > maxW) size = Math.max(6, Math.floor((size * maxW) / w));
    return size;
  }
  function wrapLines(g, text, maxW) {
    const out = [];
    let line = '';
    for (const ch of text) {
      if (ch === '\n') { out.push(line); line = ''; continue; }
      if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
    return out;
  }
  // 版面网格：把矩形切成 cols×rows 的单元
  function grid(x, y, w, h, cols, rows, gap = 0) {
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      cells.push({ c, r, x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch });
    }
    return cells;
  }

  /* ---------- 时间工具 ---------- */
  const prog = (t, a, b) => inv(a, b, t);
  const enter = (t, start, dur = 0.6, ease = 'outCubic') => E[ease](prog(t, start, start + dur));
  const stagger = (t, i, start, step = 0.08, dur = 0.5, ease = 'outCubic') => E[ease](prog(t, start + i * step, start + i * step + dur));
  const typewrite = (str, t, start, cps = 40) => str.slice(0, Math.max(0, Math.floor((t - start) * cps)));

  /* ---------- 数字格式 ---------- */
  const pad = (n, w = 2, ch = '0') => String(Math.round(n)).padStart(w, ch);
  const fmt = (n, d = 0) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  /* ---------- 场景骨架 ---------- */
  function scene(opt) {
    const qs = new URLSearchParams(location.search);
    const key = qs.get('aspect') || opt.defaultAspect || '16:9';
    const L = (opt.aspects && (opt.aspects[key] || opt.aspects['16:9']));
    if (!L) throw new Error('缺少版面表 aspects');
    const cv = document.getElementById(opt.canvas || 'c');
    const W = L.W, H = L.H;
    cv.width = W; cv.height = H;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d', { alpha: true });
    window.__meta = { width: W, height: H, fps: opt.fps || 24, duration: opt.duration || 6 };
    const api = { ctx, cv, W, H, L, aspect: key, t: 0 };
    if (opt.setup) opt.setup(api);
    window.seek = (t) => {
      api.t = t;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      if (opt.bg) { ctx.fillStyle = opt.bg; ctx.fillRect(0, 0, W, H); }
      else ctx.clearRect(0, 0, W, H);
      ctx.restore();
      /* 极缓推镜（drift，单位是画幅比例，0.008 = 全程 0.8%）：
         讲义型片子打完字就彻底静止，测出来"动态帧"只有四五成。
         停住那两秒观众读字没问题，但配上音乐就显得死了。
         0.8% 的推近肉眼察觉不到，却让每帧都在变——既救活画面，
         也补上检测口径。像素风场次别开：非整数缩放会把硬边糊掉。 */
      const drift = opt.drift || 0;
      const dur = opt.duration || 6;
      if (drift) {
        const k = 1 + drift * (t / dur);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(k, k);
        ctx.translate(-W / 2, -H / 2);
        opt.draw(api, t);
        ctx.restore();
      } else {
        opt.draw(api, t);
      }
    };
    window.__ready = true;
    window.seek(0);
    return api;
  }

  DV.core = {
    TAU, clamp, lerp, inv, smooth, smooth5, remap, mod, sign,
    hash32, h2, h3, rng, noise2, noise1, fbm2, fbm1, ridge1,
    E, css, hex2rgb, rgb2hex, mixC, shade,
    cv2d, ctxOf, roundRect, fitSize, wrapLines, grid,
    prog, enter, stagger, typewrite, pad, fmt, scene,
  };
  // 顶层别名，场景里少打字
  Object.assign(DV, DV.core);
})(window.DV);

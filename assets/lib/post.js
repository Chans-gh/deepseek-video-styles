/* ============================================================
   DV post —— 后期合成（确定性）
   原则：纹理预烘焙成离屏画布，逐帧只做 drawImage；
   逐像素处理只允许在 setup 里跑一次。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;
  const T = DV.type;

  const _canvasCache = new Map();
  function cached(key, w, h, build) {
    const k = key + '|' + w + 'x' + h;
    let cv = _canvasCache.get(k);
    if (!cv) { cv = C.cv2d(w, h); build(cv.getContext('2d'), cv); _canvasCache.set(k, cv); }
    return cv;
  }

  /* ---------- 暗角 ---------- */
  function vignette(g, W, H, o = {}) {
    const { inner = 0.38, outer = 1.0, alpha = 0.6, color = '0,0,0', cx = 0.5, cy = 0.5 } = o;
    const r0 = Math.min(W, H) * inner;
    const r1 = Math.max(W, H) * outer;
    const rg = g.createRadialGradient(W * cx, H * cy, r0, W * cx, H * cy, r1);
    rg.addColorStop(0, `rgba(${color},0)`);
    rg.addColorStop(1, `rgba(${color},${alpha})`);
    g.save(); g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
  }

  /* ---------- 扫描线 ---------- */
  function scanlines(g, W, H, o = {}) {
    const { gap = 3, thick = 1.2, alpha = 0.15, color = '#000', offset = 0 } = o;
    g.save(); g.globalAlpha = alpha; g.fillStyle = color;
    for (let y = offset; y < H; y += gap) g.fillRect(0, y, W, thick);
    g.restore();
  }

  /* ---------- 胶片颗粒 ----------
     三张预烘焙噪声片轮换 + 逐帧偏移，避免每帧都生成 200 万像素。 */
  function grainTile(seed, size = 256) {
    const cv = C.cv2d(size, size), g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const r = C.rng(seed);
    for (let i = 0; i < size * size; i++) {
      const v = r.next();
      const a = Math.abs(v - 0.5) * 2;          // 中心少、极端多 → 颗粒感更硬
      const lum = v < 0.5 ? 0 : 255;
      const k = i * 4;
      img.data[k] = lum; img.data[k + 1] = lum; img.data[k + 2] = lum;
      img.data[k + 3] = Math.round(Math.pow(a, 1.7) * 255);
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  let _tiles = null;
  function grain(g, W, H, o = {}) {
    const { t = 0, alpha = 0.1, blend = 'overlay', scale = 1 } = o;
    if (!_tiles) _tiles = [grainTile(11), grainTile(29), grainTile(47)];
    const frame = Math.floor(t * 24);
    const tile = _tiles[frame % 3];
    const s = Math.max(2, Math.round(256 * scale));
    const ox = -Math.round(C.h2(frame, 3) * 256);
    const oy = -Math.round(C.h2(frame, 9) * 256);
    g.save();
    g.globalCompositeOperation = blend;
    g.globalAlpha = alpha;
    for (let y = oy; y < H; y += s) for (let x = ox; x < W; x += s) g.drawImage(tile, x, y, s, s);
    g.restore();
  }

  /* ---------- 纸张 / 纤维底 ---------- */
  function paper(W, H, o = {}) {
    const { seed = 5, base = '#F3EFE4', fiber = 0.5, blotch = 0.5, warm = '#C9B48A' } = o;
    const cv = C.cv2d(W, H), g = cv.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const r = C.rng(seed);
    // 大块色斑
    for (let i = 0; i < 40; i++) {
      const x = r.range(0, W), y = r.range(0, H), rad = r.range(W * 0.05, W * 0.28);
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, C.css(warm, 0.05 * blotch));
      rg.addColorStop(1, C.css(warm, 0));
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // 纤维
    g.lineWidth = 1;
    for (let i = 0; i < 1400 * fiber; i++) {
      const x = r.range(0, W), y = r.range(0, H), len = r.range(4, 34), a = r.range(0, Math.PI);
      g.strokeStyle = r.next() < 0.5 ? 'rgba(120,105,80,0.055)' : 'rgba(255,255,255,0.09)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // 极细网点
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(90,80,60,${r.range(0.02, 0.07).toFixed(3)})`;
      g.fillRect(r.range(0, W), r.range(0, H), 1, 1);
    }
    return cv;
  }

  /* ---------- 辉光 ---------- */
  function glow(dst, src, o = {}) {
    const { blur = 8, alpha = 0.6, blend = 'lighter' } = o;
    const tmp = cached('glow' + blur, src.width, src.height, (g, cv) => {
      g.filter = `blur(${blur}px)`;
      g.drawImage(src, 0, 0);
      g.filter = 'none';
    });
    // 缓存画布内容必须是最新的：重新画一次
    const g2 = tmp.getContext('2d');
    g2.clearRect(0, 0, tmp.width, tmp.height);
    g2.filter = `blur(${blur}px)`;
    g2.drawImage(src, 0, 0);
    g2.filter = 'none';
    dst.save();
    dst.globalCompositeOperation = blend;
    dst.globalAlpha = alpha;
    dst.drawImage(tmp, 0, 0);
    dst.restore();
  }

  /* ---------- 背景模糊（玻璃拟态的关键） ----------
     Canvas 没有 backdrop-filter：把源画布的一块区域复制出来做 blur，
     再用圆角矩形裁回去。 */
  function backdropBlur(dst, src, x, y, w, h, r, blur = 24) {
    const bw = Math.max(1, Math.round(w)), bh = Math.max(1, Math.round(h));
    const tmp = C.cv2d(bw, bh);
    const tg = tmp.getContext('2d');
    tg.filter = `blur(${blur}px)`;
    // 多取一圈，避免边缘透明
    tg.drawImage(src, Math.round(x) - blur, Math.round(y) - blur, bw + blur * 2, bh + blur * 2, 0, 0, bw + blur * 2, bh + blur * 2);
    tg.filter = 'none';
    dst.save();
    C.roundRect(dst, x, y, w, h, r);
    dst.clip();
    dst.drawImage(tmp, Math.round(x), Math.round(y), bw, bh);
    dst.restore();
  }

  /* ---------- 放射线（Art Deco / 片头） ---------- */
  function rays(g, cx, cy, o = {}) {
    const { n = 24, r0 = 0, r1 = 900, color = '#D4AF37', alpha = 0.5, rot = 0, taper = 0.5, from = 0, to = 1 } = o;
    const span = (to - from) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = rot + from * Math.PI * 2 + (i / n) * span;
      const half = (span / n) * taper * 0.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0);
      g.closePath();
      g.fillStyle = C.css(color, alpha);
      g.fill();
    }
  }

  /* ---------- 光圈（默片 iris） ---------- */
  function iris(g, cx, cy, r, W, H) {
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(cx, cy, Math.max(0, r), 0, C.TAU, true);
    g.fillStyle = '#000';
    g.fill('evenodd');
    g.restore();
  }

  /* ---------- 胶片划痕 / 门晃 ---------- */
  function scratches(g, W, H, t, o = {}) {
    const { count = 3, alpha = 0.22 } = o;
    const frame = Math.floor(t * 24);
    for (let i = 0; i < count; i++) {
      const seed = C.h2(frame, i + 1);
      const x = seed * W;
      const y0 = C.h2(frame, i + 20) * H * 0.5;
      const len = C.h2(frame, i + 40) * H + 200;
      g.strokeStyle = `rgba(255,255,255,${(alpha * (0.4 + seed * 0.6)).toFixed(3)})`;
      g.lineWidth = 1 + (i % 2);
      g.beginPath();
      g.moveTo(x, y0);
      g.bezierCurveTo(x + 6, y0 + len * 0.3, x - 6, y0 + len * 0.7, x + 3, y0 + len);
      g.stroke();
    }
  }

  /* ---------- 抖动 / 半调（预烘焙用） ---------- */
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function halftone(src, o = {}) {
    const { dot = 7, angle = 0.42, ink = [17, 17, 17], paper = [242, 238, 228] } = o;
    const W = src.width, H = src.height;
    const s = src.getContext('2d').getImageData(0, 0, W, H).data;
    const cv = C.cv2d(W, H), g = cv.getContext('2d');
    g.fillStyle = C.css(paper); g.fillRect(0, 0, W, H);
    g.fillStyle = C.css(ink);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (let y = -dot; y < H + dot; y += dot) {
      for (let x = -dot; x < W + dot; x += dot) {
        // 旋转网格 → 反算采样点
        const sx = Math.round(x * ca - y * sa), sy = Math.round(x * sa + y * ca);
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const k = (sy * W + sx) * 4;
        const lum = (s[k] * 0.299 + s[k + 1] * 0.587 + s[k + 2] * 0.114) / 255;
        const r = (1 - lum) * dot * 0.78;
        if (r < 0.4) continue;
        g.beginPath();
        g.arc(x, y, r, 0, C.TAU);
        g.fill();
      }
    }
    return cv;
  }

  DV.post = { vignette, scanlines, grain, grainTile, paper, glow, backdropBlur, rays, iris, scratches, halftone, BAYER4, cached };
})(window.DV);

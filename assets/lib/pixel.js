/* ============================================================
   DV pixel —— 低分辨率离屏画布 / 精灵 / 抖色
   高保真的像素风只有一条路：真的用低分辨率渲染，再整数放大。
   在大画布上画小方块会得到"假像素"（边缘半透明、格距不均）。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;
  const { TAU, clamp } = C;

  function stage(w, h) {
    const cv = C.cv2d(w, h);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { cv, g, W: w, H: h };
  }

  // 整数倍放大，保持锐利。设备像素比在这里不重要——最终是视频帧。
  function blit(dst, cv, W, H, o = {}) {
    const { smooth = false, alpha = 1 } = o;
    dst.save();
    dst.imageSmoothingEnabled = smooth;
    dst.globalAlpha = alpha;
    dst.drawImage(cv, 0, 0, W, H);
    dst.restore();
  }

  /* ---------- 精灵 ----------
     rows 是字符网格，'.' 与空格为透明；palette 把字符映射到颜色。 */
  function sprite(g, rows, palette, x, y, px = 4, o = {}) {
    const { flip = false, alpha = 1 } = o;
    const w = rows[0].length;
    g.save();
    g.globalAlpha = alpha;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue;
        const cc = flip ? w - 1 - c : c;
        g.fillStyle = col;
        g.fillRect(x + cc * px, y + r * px, px, px);
      }
    }
    g.restore();
  }

  /* ---------- 抖色 ----------
     Bayer 4×4：两色之间用有序抖动过渡，比线性渐变更像当年的调色板限制。 */
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  function ditherRect(g, x, y, w, h, a, b, ratio) {
    g.fillStyle = a; g.fillRect(x, y, w, h);
    g.fillStyle = b;
    const th = clamp(ratio) * 16;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (BAYER[j & 3][i & 3] < th) g.fillRect(x + i, y + j, 1, 1);
    }
  }
  // 垂直抖色渐变（天空、雾、光照）
  function ditherGrad(g, x, y, w, h, stops) {
    for (let j = 0; j < h; j++) {
      const p = j / Math.max(1, h - 1);
      let k = 0;
      while (k < stops.length - 2 && p > stops[k + 1][0]) k++;
      const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
      const f = clamp((p - p0) / Math.max(1e-6, p1 - p0));
      const A = C.hex2rgb(c0), B = C.hex2rgb(c1);
      for (let i = 0; i < w; i++) {
        // 抖动核随行偏移，避免整列同色形成竖条
        const th = (BAYER[j & 3][(i + j) & 3] + 0.5) / 16;
        const band = Math.floor(f * 6 + th) / 6;
        const col = C.mixC(A, B, clamp(band));
        g.fillStyle = C.rgb2hex(col);
        g.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  /* ---------- 像素字体（5×7，整数格） ---------- */
  function text(g, str, x, y, px, color, o = {}) {
    const { alpha = 1, spacing = 1 } = o;
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const gl = DV.type.GLYPH[ch] || DV.type.GLYPH[' '];
      g.fillStyle = color;
      g.globalAlpha = alpha;
      for (let r = 0; r < 7; r++) for (let c = 0; c < gl[r].length; c++) {
        if (gl[r][c] === '1') g.fillRect(cx + c * px, y + r * px, px, px);
      }
      cx += (gl[0].length + spacing) * px;
    }
    g.globalAlpha = 1;
    return cx - x;
  }
  const textW = (str, px, spacing = 1) => DV.type.wordCols(str) + [...str].length * spacing;

  /* ---------- 视差层 ---------- */
  // 把一整个绘制回调按偏移画到离屏再贴回，是做多层视差最省事的办法
  function layer(W, H, draw, ox = 0, oy = 0) {
    const st = stage(W, H);
    draw(st.g);
    return { cv: st.cv, ox, oy };
  }

  DV.pixel = { stage, blit, sprite, ditherRect, ditherGrad, text, textW, BAYER, layer };
})(window.DV);

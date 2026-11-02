/* ============================================================
   DV type —— 逐字排版 / 方块网格 / 5×7 像素字模
   教训来源：CRT 场次里字宽写死导致实心块出现竖缝、像网点；
   ╔╗║═ 是双线框线字符，在实心块里会飘出平行细线（"重影"）。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;

  /* ---------- 字体栈 ---------- */
  // 只列本机确定存在的：macOS 自带。封装 Skill 前再做字体探测。
  const F = {
    sans: '"Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", "Songti SC", "STSong", serif',
    cn: '"PingFang SC", "Hiragino Sans GB", "Songti SC", sans-serif',
    mono: '"SF Mono", Menlo, Consolas, "PingFang SC", monospace',
    condensed: '"Helvetica Neue", "Arial Narrow", "PingFang SC", sans-serif',
  };
  const font = (size, family = F.sans, weight = '400') => `${weight} ${size}px ${family}`;

  /* ---------- 测量缓存 ---------- */
  const _mcache = new Map();
  function measure(g, text, f) {
    const key = f + '|' + text;
    let v = _mcache.get(key);
    if (v === undefined) {
      const prev = g.font;
      g.font = f;
      v = g.measureText(text).width;
      g.font = prev;
      if (_mcache.size > 4000) _mcache.clear();
      _mcache.set(key, v);
    }
    return v;
  }

  /* ---------- 方块字符网格 ----------
     核心：格宽由 measureText('█') 实测推导，不写死。
     矩形四边取整，否则相邻块各自抗锯齿，放大看是一片网格。 */
  function cell(g, size, family = F.mono) {
    const f = font(size, family, '400');
    return { w: measure(g, '█', f), h: size * 1.16, size, f };
  }
  function putBlocks(g, str, x, y, cw, ch, color, alpha = 1) {
    g.fillStyle = color;
    const y0 = Math.round(y), y1 = Math.round(y + ch);
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === ' ') continue;
      const x0 = Math.round(x + i * cw), x1 = Math.round(x + (i + 1) * cw);
      if (c === '█' || c === '▮') { g.globalAlpha = alpha; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      else if (c === '▀') { g.globalAlpha = alpha; g.fillRect(x0, y0, x1 - x0, Math.round(y + ch * 0.52) - y0); }
      else if (c === '░' || c === '▯') { g.globalAlpha = alpha * 0.13; g.fillRect(x0, Math.round(y + ch * 0.74), x1 - x0, y1 - Math.round(y + ch * 0.74)); }
      else { g.globalAlpha = alpha; g.font = font(ch * 1.35, F.mono); g.textBaseline = 'top'; g.fillText(c, x0, y0); }
    }
    g.globalAlpha = 1;
  }
  const blockBar = (n, fill, on = '█', off = '░') => on.repeat(Math.max(0, Math.min(n, fill))) + off.repeat(Math.max(0, n - fill));

  /* ---------- 5×7 像素字模 ----------
     为什么不用 ASCII 艺术字：框线字符是双线的，缩放到实心块里就变成重影。 */
  const GLYPH_RAW = {
    A: '01110 10001 10001 11111 10001 10001 10001',
    B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01111 10000 10000 10000 10000 10000 01111',
    D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111',
    F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01110',
    H: '10001 10001 10001 11111 10001 10001 10001',
    I: '11111 00100 00100 00100 00100 00100 11111',
    J: '00111 00010 00010 00010 00010 10010 01100',
    K: '10001 10010 10100 11000 10100 10010 10001',
    L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001',
    N: '10001 11001 10101 10011 10001 10001 10001',
    O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000',
    Q: '01110 10001 10001 10001 10101 10010 01101',
    R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110',
    T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110',
    V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 11011 10001',
    X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100',
    Z: '11111 00001 00010 00100 01000 10000 11111',
    0: '01110 10001 10011 10101 11001 10001 01110',
    1: '00100 01100 00100 00100 00100 00100 01110',
    2: '01110 10001 00001 00010 00100 01000 11111',
    3: '11111 00010 00100 00010 00001 10001 01110',
    4: '00010 00110 01010 10010 11111 00010 00010',
    5: '11111 10000 11110 00001 00001 10001 01110',
    6: '00110 01000 10000 11110 10001 10001 01110',
    7: '11111 00001 00010 00100 01000 01000 01000',
    8: '01110 10001 10001 01110 10001 10001 01110',
    9: '01110 10001 10001 01111 00001 00010 01100',
    ' ': '00000 00000 00000 00000 00000 00000 00000',
    '-': '00000 00000 00000 11111 00000 00000 00000',
    '.': '00000 00000 00000 00000 00000 01100 01100',
    ':': '00000 01100 01100 00000 01100 01100 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000',
    '+': '00000 00100 00100 11111 00100 00100 00000',
    '·': '00000 00000 00000 01100 01100 00000 00000',
  };
  const GLYPH = {};
  for (const k in GLYPH_RAW) GLYPH[k] = GLYPH_RAW[k].split(' ');
  const GAP = 1;

  const wordCols = (word) => {
    let n = 0;
    for (const ch of word) n += (GLYPH[ch] ? GLYPH[ch][0].length : 5) + GAP;
    return n - GAP;
  };
  // drawWord5：在 (x,y) 起画，cellPx 为单个像素格边长
  function drawWord5(g, word, x, y, cellPx, color, alpha = 1) {
    g.fillStyle = color;
    g.globalAlpha = alpha;
    let cx = x;
    for (const ch of word) {
      const gl = GLYPH[ch] || GLYPH[' '];
      for (let r = 0; r < gl.length; r++) {
        for (let c = 0; c < gl[r].length; c++) {
          if (gl[r][c] !== '1') continue;
          const x0 = Math.round(cx + c * cellPx), y0 = Math.round(y + r * cellPx);
          const x1 = Math.round(cx + (c + 1) * cellPx), y1 = Math.round(y + (r + 1) * cellPx);
          g.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
      cx += (gl[0].length + GAP) * cellPx;
    }
    g.globalAlpha = 1;
  }
  // 自动适配容器宽高
  function wordFit(g, word, x, y, maxW, maxH, color, alpha = 1) {
    const cols = wordCols(word);
    const cp = Math.min(maxW / cols, maxH / 7);
    drawWord5(g, word, x, y, cp, color, alpha);
    return cp;
  }

  /* ---------- 逐字定点（含中文混排） ----------
     系统字体回退会让等宽假设失效；逐字按实测宽度累加最稳。 */
  function putCells(g, str, x, y, color, alpha = 1, size = 18, family = F.mono) {
    g.font = font(size, family);
    g.textBaseline = 'top';
    g.fillStyle = color;
    g.globalAlpha = alpha;
    let cx = x;
    for (const ch of str) {
      if (ch !== ' ') g.fillText(ch, cx, y);
      cx += measure(g, ch, g.font);
    }
    g.globalAlpha = 1;
    return cx - x;
  }

  /* ---------- 追踪（letter-spacing）文字 ---------- */
  function trackedWidth(g, str, size, tracking, family = F.sans, weight = '400') {
    g.font = font(size, family, weight);
    let w = 0;
    for (const ch of str) w += measure(g, ch, g.font) + tracking;
    return w - tracking;
  }
  function drawTracked(g, str, x, y, size, tracking, color, alpha = 1, family = F.sans, weight = '400') {
    g.font = font(size, family, weight);
    g.fillStyle = color;
    g.globalAlpha = alpha;
    let cx = x;
    for (const ch of str) {
      g.fillText(ch, cx, y);
      cx += measure(g, ch, g.font) + tracking;
    }
    g.globalAlpha = 1;
  }

  /* ---------- 逐行裁切上浮（排版动画的核心动作） ---------- */
  // 文本从基线下方升上来，超出 mask 的部分被裁掉
  // mask:true  遮罩上推（拉丁字母好看，中文会先露出横笔画，像被切开）
  // mask:false 淡入 + 轻微上浮，中文标题用它
  function riseIn(g, str, x, baseline, size, p, color, opt = {}) {
    const { family = F.sans, weight = '700', tracking = 0, alpha = 1, mask = true, travel = 1.25 } = opt;
    g.save();
    if (mask) {
      g.beginPath();
      g.rect(x - size, baseline - size * 1.06, 4000, size * 1.34);
      g.clip();
    }
    g.font = font(size, family, weight);
    g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    g.globalAlpha = alpha * (mask ? 1 : p);
    const dy = (1 - p) * size * (mask ? travel : 0.32);
    if (tracking) {
      let cx = x;
      for (const ch of str) {
        g.fillText(ch, cx, baseline + dy);
        cx += measure(g, ch, g.font) + tracking;
      }
    } else {
      g.fillText(str, x, baseline + dy);
    }
    g.restore();
  }

  /* ---------- 打字机 ---------- */
  const typed = (str, t, start, cps = 42) => str.slice(0, Math.max(0, Math.floor((t - start) * cps)));

  DV.type = { F, font, measure, cell, putBlocks, blockBar, GLYPH, wordCols, drawWord5, wordFit, putCells, trackedWidth, drawTracked, riseIn, typed, fitSize: C.fitSize, wrapLines: C.wrapLines, grid: C.grid };
})(window.DV);

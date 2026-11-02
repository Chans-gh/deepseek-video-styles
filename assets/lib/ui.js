/* ============================================================
   DV ui —— 窗口 / 代码编辑器 / 手机框 / 键帽
   界面类风格（44 / 47 / 68 / 114）共用。所有尺寸由版面表传入，
   不写死像素值，横竖屏只是两套数字。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;
  const T = DV.type;
  const { TAU, clamp } = C;

  /* ---------- 窗口 ---------- */
  function win(g, x, y, w, h, o = {}) {
    const {
      r = 14, bar = 44, bg = '#15171C', barBg = '#1E2128', border = 'rgba(255,255,255,0.10)',
      dots = ['#FF5F57', '#FEBC2E', '#28C840'], title = '', titleColor = 'rgba(255,255,255,0.45)',
      shadow = 0.5, alpha = 1,
    } = o;
    g.save();
    g.globalAlpha = alpha;
    if (shadow) {
      g.save();
      g.shadowColor = `rgba(0,0,0,${shadow})`;
      g.shadowBlur = 46; g.shadowOffsetY = 18;
      C.roundRect(g, x, y, w, h, r); g.fillStyle = bg; g.fill();
      g.restore();
    }
    C.roundRect(g, x, y, w, h, r); g.fillStyle = bg; g.fill();
    if (bar) {
      g.save();
      C.roundRect(g, x, y, w, h, r); g.clip();
      g.fillStyle = barBg; g.fillRect(x, y, w, bar);
      g.fillStyle = border; g.fillRect(x, y + bar - 1, w, 1);
      dots.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(x + 20 + i * 19, y + bar / 2, 5.5, 0, TAU); g.fill(); });
      if (title) {
        g.fillStyle = titleColor;
        g.font = T.font(13, T.F.mono, '400');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(title, x + w / 2, y + bar / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      }
      g.restore();
    }
    C.roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
    g.strokeStyle = border; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  /* ---------- 代码着色 ----------
     一个够用的 JS/TS 词法器：注释、字符串、数字、关键字、调用、标点。
     不做 AST —— 画面上没人会去核对语义，只要颜色分层对就够了。 */
  const KW = /\b(const|let|var|function|return|if|else|for|while|of|in|new|class|import|from|export|default|await|async|try|catch|throw|type|interface|=>|null|true|false|this)\b/;
  function tokenize(line) {
    const out = [];
    const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.:=+\-*/%<>!&|?]+)|(\s+)/g;
    let m;
    while ((m = re.exec(line))) {
      const [txt] = m;
      let c = 'p';
      if (m[1]) c = 'c';
      else if (m[2]) c = 's';
      else if (m[3]) c = 'n';
      else if (m[4]) c = 'f';
      else if (m[5]) c = KW.test(txt) ? 'k' : 'p';
      else if (m[6]) c = 'o';
      out.push({ txt, c });
    }
    return out;
  }
  const CODE_COLORS = {
    k: '#C792EA', s: '#C3E88D', n: '#F78C6C', f: '#82AAFF',
    c: '#4E5666', o: '#89DDFF', p: '#C8D3E0',
  };
  // lines: 字符串数组；reveal: 每行已显示字符数（数字或函数）
  function code(g, lines, x, y, o = {}) {
    const {
      size = 16, lh = 26, family = T.F.mono, gutter = 52, colors = CODE_COLORS,
      reveal = null, alpha = 1, caret = true, active = -1, activeBg = 'rgba(255,255,255,0.035)',
      tab = 2,
    } = o;
    g.save();
    g.font = T.font(size, family, '400');
    g.textBaseline = 'top';
    const cw = T.measure(g, 'M', g.font);
    let lastX = x + gutter, lastY = y;
    lines.forEach((line, i) => {
      const ly = y + i * lh;
      const n = reveal == null ? line.length : Math.max(0, Math.floor(typeof reveal === 'function' ? reveal(i) : reveal));
      if (i === active) { g.fillStyle = activeBg; g.fillRect(x, ly - lh * 0.14, 9999, lh); }
      // 行号
      g.globalAlpha = alpha * (i === active ? 0.85 : 0.34);
      g.fillStyle = i === active ? '#9AE6B4' : '#8A93A5';
      g.textAlign = 'right';
      g.fillText(String(i + 1), x + gutter - 18, ly);
      g.textAlign = 'left';
      g.globalAlpha = alpha;
      let cx = x + gutter;
      let used = 0;
      for (const tk of tokenize(line.replace(/\t/g, ' '.repeat(tab)))) {
        if (used >= n) break;
        const piece = tk.txt.slice(0, Math.max(0, n - used));
        g.fillStyle = colors[tk.c] || colors.p;
        g.fillText(piece, cx, ly);
        cx += T.measure(g, piece, g.font);
        used += tk.txt.length;
        lastX = cx; lastY = ly;
      }
      if (caret && n >= line.length && i === lines.length - 1) { /* 由调用方画 */ }
    });
    g.globalAlpha = 1;
    g.restore();
    return { x: lastX, y: lastY };
  }

  function caret(g, x, y, h, on, o = {}) {
    const { color = '#9AE6B4', width = 2 } = o;
    if (!on) return;
    g.save(); g.fillStyle = color; g.globalAlpha = 0.9;
    g.fillRect(Math.round(x), Math.round(y), width, h);
    g.restore();
  }

  /* ---------- 手机 / 设备框 ---------- */
  function phone(g, x, y, w, h, o = {}) {
    const { r = 64, body = '#0E0F13', edge = 'rgba(255,255,255,0.16)', screen = '#151821', notch = true } = o;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 60; g.shadowOffsetY = 26;
    C.roundRect(g, x, y, w, h, r); g.fillStyle = body; g.fill();
    g.restore();
    g.save();
    C.roundRect(g, x + 10, y + 10, w - 20, h - 20, r - 10);
    g.fillStyle = screen; g.fill();
    g.strokeStyle = edge; g.lineWidth = 1.2; g.stroke();
    if (notch) {
      const nw = w * 0.3;
      C.roundRect(g, x + (w - nw) / 2, y + 22, nw, 28, 14);
      g.fillStyle = '#07080B'; g.fill();
    }
    g.restore();
  }

  /* ---------- 键帽 ---------- */
  function keycap(g, label, x, y, w, h, o = {}) {
    const { bg = 'rgba(255,255,255,0.10)', fg = '#E8EDF5', size = 15, r = 7, border = 'rgba(255,255,255,0.18)' } = o;
    C.roundRect(g, x, y, w, h, r); g.fillStyle = bg; g.fill();
    g.strokeStyle = border; g.lineWidth = 1; g.stroke();
    g.fillStyle = fg; g.font = T.font(size, T.F.mono, '500');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2 + 1);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  /* ---------- 图表：柱 / 折线 / 环 ---------- */
  function bars(g, x, y, w, h, vals, o = {}) {
    const { p = 1, color = '#5B8DEF', gap = 0.34, radius = 3, bg = 'rgba(255,255,255,0.07)', highlight = -1, hiColor = '#F2C14E' } = o;
    const n = vals.length;
    const bw = (w / n) * (1 - gap);
    vals.forEach((v, i) => {
      const bx = x + (w / n) * i + ((w / n) - bw) / 2;
      const bh = h * v * p;
      g.fillStyle = bg; C.roundRect(g, bx, y, bw, h, radius); g.fill();
      g.fillStyle = i === highlight ? hiColor : color;
      C.roundRect(g, bx, y + h - bh, bw, bh, radius); g.fill();
    });
  }
  function ring(g, cx, cy, r, p, o = {}) {
    const { color = '#6EE7B7', track = 'rgba(255,255,255,0.10)', width = 10, start = -Math.PI / 2 } = o;
    g.save();
    g.lineWidth = width; g.lineCap = 'round';
    g.strokeStyle = track;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    g.strokeStyle = color;
    g.beginPath(); g.arc(cx, cy, r, start, start + TAU * clamp(p)); g.stroke();
    g.restore();
  }

  DV.ui = { win, tokenize, CODE_COLORS, code, caret, phone, keycap, bars, ring };
})(window.DV);

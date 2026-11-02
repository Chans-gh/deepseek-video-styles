/* ============================================================
   DV draw —— 路径生长 / 手绘线 / 象形图 / 轴测
   为什么不用 SVG stroke-dashoffset：
     本套渲染器同一份代码要跑 Canvas 和离屏像素两种目标，
     路径采样后再描边，生长进度和像素输出都是同一个真相。
   教训：p<=0 时必须先 beginPath() 再返回，否则会把上一条路径重描一遍。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;
  const { TAU, lerp, clamp } = C;

  /* ---------- 采样 ---------- */
  function linePts(x1, y1, x2, y2, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push([lerp(x1, x2, i / n), lerp(y1, y2, i / n)]);
    return out;
  }
  function bezPts(p0, p1, p2, p3, n = 48) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return out;
  }
  function quadPts(p0, p1, p2, n = 32) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return out;
  }
  function arcPts(cx, cy, r, a0, a1, n = 64) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }
  function cat(...lists) {
    const out = [];
    for (const l of lists) for (const p of l) out.push(p);
    return out;
  }
  /* Catmull-Rom 过点样条：给几个锚点就能得到一条顺滑的线，
     一笔画、说明书的线稿都靠它——比手调贝塞尔控制点省事得多。 */
  function splinePts(pts, n = 16) {
    if (pts.length < 2) return pts.slice();
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function spiralPts(cx, cy, r0, r1, turns = 2, n = 120, phase = 0) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const r = lerp(r0, r1, u);
      const a = phase + u * TAU * turns;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }
  function pathLen(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  }
  // 按弧长切片（用于等距打点 / 虚线）
  function slice(pts, p0, p1) {
    const total = pathLen(pts);
    const out = [];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const s0 = acc / total, s1 = (acc + d) / total;
      if (s1 >= p0 && s0 <= p1) {
        const k0 = clamp((p0 - s0) / Math.max(1e-6, s1 - s0));
        const k1 = clamp((p1 - s0) / Math.max(1e-6, s1 - s0));
        out.push([lerp(a[0], b[0], k0), lerp(a[1], b[1], k0)]);
        out.push([lerp(a[0], b[0], k1), lerp(a[1], b[1], k1)]);
      }
      acc += d;
    }
    return out;
  }
  function at(pts, p) {
    const s = slice(pts, p, p);
    return s.length ? s[s.length - 1] : pts[0];
  }

  /* ---------- 生长描边 ---------- */
  function strokePts(g, pts, p, o = {}) {
    const { width = 4, color = '#111', alpha = 1, cap = 'round', taper = 0 } = o;
    g.beginPath();
    if (p <= 0 || pts.length < 2) return;
    const cut = slice(pts, 0, clamp(p));
    if (cut.length < 2) return;
    g.lineWidth = width;
    g.lineCap = cap;
    g.lineJoin = 'round';
    g.strokeStyle = C.css(color, alpha);
    if (!taper) {
      g.moveTo(cut[0][0], cut[0][1]);
      for (let i = 1; i < cut.length; i++) g.lineTo(cut[i][0], cut[i][1]);
      g.stroke();
      return;
    }
    // 收笔变细：分段画，末端两段押到 taper 宽度
    const n = cut.length - 1;
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      g.beginPath();
      g.lineWidth = width * (1 - taper * k * k);
      g.moveTo(cut[i][0], cut[i][1]);
      g.lineTo(cut[i + 1][0], cut[i + 1][1]);
      g.stroke();
    }
  }

  /* ---------- 手绘抖动 ----------
     真实手绘不是"抖"，是长线带低频弯 + 端点略微出头。
     这里用两个不同频率的正弦叠加，seed 决定相位。 */
  function roughPts(pts, seed = 1, amp = 1.6, step = 14) {
    const out = [];
    const r = C.rng(seed);
    const ph1 = r.range(0, TAU), ph2 = r.range(0, TAU);
    const total = pathLen(pts);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(d / step));
      const nx = -(b[1] - a[1]) / (d || 1), ny = (b[0] - a[0]) / (d || 1);
      for (let k = 0; k < n; k++) {
        const u = acc + d * (k / n);
        const s = u / 90;
        const off = (Math.sin(s * 1.7 + ph1) * 0.7 + Math.sin(s * 4.3 + ph2) * 0.3) * amp;
        out.push([lerp(a[0], b[0], k / n) + nx * off, lerp(a[1], b[1], k / n) + ny * off]);
      }
      acc += d;
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* ---------- 箭头 ---------- */
  function arrow(g, a, b, o = {}) {
    const { color = '#111', width = 2, head = 14, alpha = 1, curve = 0 } = o;
    let pts;
    if (curve) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      pts = quadPts(a, [mx - (dy / len) * curve, my + (dx / len) * curve], b, 40);
    } else pts = linePts(a[0], a[1], b[0], b[1], 20);
    g.save();
    g.strokeStyle = C.css(color, alpha); g.fillStyle = C.css(color, alpha);
    g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    const n = pts.length;
    for (let i = 1; i < n - 1; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
    const tip = pts[n - 1], prev = pts[n - 3] || pts[0];
    const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    g.beginPath();
    g.moveTo(tip[0], tip[1]);
    g.lineTo(tip[0] - Math.cos(ang - 0.42) * head, tip[1] - Math.sin(ang - 0.42) * head);
    g.lineTo(tip[0] - Math.cos(ang + 0.42) * head, tip[1] - Math.sin(ang + 0.42) * head);
    g.closePath(); g.fill();
    g.restore();
  }

  /* ---------- 象形图人物 ----------
     一个 pictogram = 头 + 躯干 + 两臂 + 两腿，关节角度驱动。
     pose: { lean, armL, armR, legL, legR, kneeL, kneeR }
     角度单位弧度，0 表示向下，正方向朝画面右。 */
  function limb(x, y, ang, len, knee = 0) {
    // len 是整条肢体长度：有膝/肘时按 55/45 拆成两段，
    // 否则弯曲的腿会比直腿长一倍，象形图会立刻失真。
    if (!knee) {
      return [[x, y], [x + Math.sin(ang) * len, y + Math.cos(ang) * len]];
    }
    const a = len * 0.55, b = len * 0.45;
    const x1 = x + Math.sin(ang) * a, y1 = y + Math.cos(ang) * a;
    const x2 = x1 + Math.sin(ang + knee) * b, y2 = y1 + Math.cos(ang + knee) * b;
    return [[x, y], [x1, y1], [x2, y2]];
  }
  // 关节角：0 = 竖直向下，正 = 朝画面右。lean 让整个人前倾。
  function personPts(pose = {}, s = 1) {
    const { lean = 0, armL = 0.3, armR = -0.3, legL = 0.35, legR = -0.35, kneeL = 0, kneeR = 0 } = pose;
    const sh = [Math.sin(lean) * 0.52 * s, -0.52 * s];
    const hip = [0, 0];
    const head = [Math.sin(lean) * 0.92 * s, -0.92 * s, 0.13 * s];
    return {
      head,
      spine: [hip, sh],
      // 脖子：不画这一段，头会跟身体断开，象形图一眼就假
      neck: [sh, [head[0], head[1] + head[2]]],
      armL: limb(sh[0], sh[1], armL + lean, 0.42 * s),
      armR: limb(sh[0], sh[1], armR + lean, 0.42 * s),
      legL: limb(hip[0], hip[1], legL, 0.48 * s, kneeL),
      legR: limb(hip[0], hip[1], legR, 0.48 * s, kneeR),
    };
  }

  function person(g, x, y, s, pose, o = {}) {
    const { color = '#111', width = 0.13, alpha = 1, head = true } = o;
    const P = personPts(pose, s);
    const w = Math.max(1, width * s);
    g.save();
    g.strokeStyle = C.css(color, alpha);
    g.fillStyle = C.css(color, alpha);
    g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    const seg = (pts) => {
      g.beginPath(); g.moveTo(x + pts[0][0], y + pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(x + pts[i][0], y + pts[i][1]);
      g.stroke();
    };
    seg(P.spine); seg(P.neck); seg(P.armL); seg(P.armR); seg(P.legL); seg(P.legR);
    if (head) { g.beginPath(); g.arc(x + P.head[0], y + P.head[1], P.head[2], 0, TAU); g.fill(); }
    g.restore();
  }

  /* ---------- 轴测投影 ----------
     等距/轴测只要一个投影函数，别为它上 3D 引擎。 */
  function iso(ox, oy, ux, uy, w = 1, h = 1, d = 1) {
    // ux/uy 是"一单位"对应的屏幕向量；w 沿 x，h 沿 y（竖直），d 沿 z
    return (x, y, z) => [ox + x * ux, oy + y * uy - z * h - x * d * 0.5 + y * d * 0.5];
  }

  /* ---------- 网格 / 点阵 ---------- */
  function dotGrid(g, x, y, w, h, step, color, alpha = 0.2, r = 1) {
    g.save(); g.fillStyle = C.css(color, alpha);
    for (let yy = y; yy <= y + h; yy += step) for (let xx = x; xx <= x + w; xx += step) {
      g.beginPath(); g.arc(xx, yy, r, 0, TAU); g.fill();
    }
    g.restore();
  }
  // 卡通对话气泡
  function bubble(g, x, y, w, h, o = {}) {
    const { fill = '#fff', stroke = '#111', width = 3, tail = 0.5, r = 18, alpha = 1 } = o;
    g.save();
    C.roundRect(g, x, y, w, h, r);
    g.fillStyle = C.css(fill, alpha); g.fill();
    g.strokeStyle = C.css(stroke, alpha); g.lineWidth = width; g.stroke();
    // 尾巴盖住描边
    const tx = x + w * tail;
    g.beginPath();
    g.moveTo(tx - 16, y + h - 1); g.lineTo(tx, y + h + 26); g.lineTo(tx + 14, y + h - 1);
    g.closePath();
    g.fillStyle = C.css(fill, alpha); g.fill();
    g.strokeStyle = C.css(stroke, alpha);
    g.beginPath(); g.moveTo(tx - 16, y + h); g.lineTo(tx, y + h + 26); g.lineTo(tx + 14, y + h); g.stroke();
    g.restore();
  }

  DV.draw = { linePts, bezPts, quadPts, arcPts, cat, splinePts, spiralPts, pathLen, slice, at, strokePts, roughPts, arrow, person, personPts, iso, dotGrid, bubble };
})(window.DV);

/* ============================================================
   DV anim —— 时间轴 / 入场预设 / 数值滚动
   所有函数的输入只有 t，没有内部状态 → 逐帧可复现。
   ============================================================ */
(function (DV) {
  'use strict';
  const C = DV.core;
  const { clamp, lerp, E } = C;

  // 区间进度 + 缓动：clip(t, 1.2, 2.4, 'outCubic') → {on, p, e}
  function clip(t, start, end, ease = 'outCubic') {
    const on = t >= start && t <= end;
    const p = clamp((t - start) / Math.max(1e-6, end - start));
    return { on, p, e: E[ease](p) };
  }

  // 关键帧插值：[{t, v}, ...]，值可以是数字或数组
  function keyframes(t, frames, ease = 'inOutCubic') {
    if (!frames.length) return 0;
    if (t <= frames[0].t) return frames[0].v;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      if (t <= b.t) {
        const p = E[ease]((t - a.t) / Math.max(1e-6, b.t - a.t));
        if (Array.isArray(a.v)) return a.v.map((v, k) => lerp(v, b.v[k], p));
        return lerp(a.v, b.v, p);
      }
    }
    return frames[frames.length - 1].v;
  }

  // 数字滚动（带千分位）
  function counter(v0, v1, p, digits = 0, ease = 'outCubic') {
    const v = lerp(v0, v1, E[ease](clamp(p)));
    return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // 依次入场：第 i 个元素在 start + i*step 开始
  function seq(t, i, start, step = 0.09, dur = 0.5, ease = 'outCubic') {
    return E[ease](clamp((t - start - i * step) / dur));
  }

  // 打字机：返回已显示字符数
  const chars = (t, start, cps = 40) => Math.max(0, Math.floor((t - start) * cps));

  // 沿路径取点（用于折线生长）
  function polyline(points, p) {
    if (p <= 0) return [points[0], 0];
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      segs.push(d); total += d;
    }
    let want = total * clamp(p);
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i]) {
        const k = want / segs[i];
        return [[lerp(points[i][0], points[i + 1][0], k), lerp(points[i][1], points[i + 1][1], k)], i + k];
      }
      want -= segs[i];
    }
    return [points[points.length - 1], points.length - 1];
  }

  // 画部分折线
  // 注意：p<=0 时也必须先 beginPath()。否则调用方随后的 stroke() 会
  // 把上一步残留的路径（常见是圆角矩形）按当前 lineWidth 描一遍，
  // 画面上会出现一条来历不明的亮线 —— 且只在动画开始前出现。
  function drawPolyline(g, points, p) {
    g.beginPath();
    if (p <= 0) return;
    const [last, idx] = polyline(points, p);
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i <= Math.floor(idx); i++) g.lineTo(points[i][0], points[i][1]);
    g.lineTo(last[0], last[1]);
  }

  // 呼吸/漂移，给静态版面加一点活气（不影响可复现）
  const sway = (t, amp = 6, freq = 0.4, phase = 0) => Math.sin(t * Math.PI * 2 * freq + phase) * amp;

  DV.anim = { clip, keyframes, counter, seq, chars, polyline, drawPolyline, sway };
  Object.assign(DV, DV.anim);
})(window.DV);

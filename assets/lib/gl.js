/* ============================================================
   DV gl —— WebGL2 全屏着色器底座
   ────────────────────────────────────────────────────────────
   为什么单独放一层：
   core.scene() 拿到的是 2d 上下文，拿不到 webgl2。所以 WebGL 场次
   叠两张画布——底层 gl 画整屏，顶层 2d 只画字/标。
   截图时浏览器会把两层合在一起，交付的仍是单个 PNG 序列。

   两个必须记住的坑：
   1) preserveDrawingBuffer 必须 true。默认 false 时，drawingBuffer
      在合成后就被丢弃，puppeteer 截到的是空白。
   2) 不能开 antialias。swiftshader 下 MSAA 会让 1080p 的 fbm 着色器
      慢 3 倍以上，而全屏渐变本来就不需要 MSAA。
   ============================================================ */
(function (DV) {
  'use strict';

  const VS = `#version 300 es
  in vec2 a;
  void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

  /* 公共 GLSL 片段：哈希 / 噪声 / fbm / 调色板 */
  const CHUNK = `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return s;
  }
  vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318530718 * (c * t + d));
  }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader 编译失败: ' + log);
    }
    return sh;
  }

  /**
   * 在给定 canvas 上装一套全屏着色器。
   * @returns {{gl, use(fn), clear(r,g,b), resize(w,h)}} 或 null（无 WebGL2）
   */
  function fullscreen(cv, fragBody, opt = {}) {
    const gl = cv.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    const FS = `#version 300 es
    precision ${opt.precision || 'highp'} float;
    uniform vec2 u_res;
    uniform float u_t;
    out vec4 outColor;
    ${CHUNK}
    ${fragBody}`;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program 链接失败: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    // 全屏三角形，比两个三角形的 quad 少一次光栅化接缝
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');
    // 场景专属的额外 uniform 由调用方声明
    const extra = {};
    (opt.uniforms || []).forEach((n) => { extra[n] = gl.getUniformLocation(prog, n); });

    gl.viewport(0, 0, cv.width, cv.height);

    const api = {
      gl, prog, cv,
      resize(w, h) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w; cv.height = h;
          cv.style.width = w + 'px'; cv.style.height = h + 'px';
        }
        gl.viewport(0, 0, w, h);
      },
      /** 画一帧；u 可带 1f / 2f / 3f 额外 uniform，按值长度自动选择 */
      frame(w, h, t, u = {}) {
        api.resize(w, h);
        gl.useProgram(prog);
        gl.uniform2f(uRes, w, h);
        gl.uniform1f(uT, t);
        for (const k in u) {
          const l = extra[k];
          if (!l) continue;
          const v = u[k];
          if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
          else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
          else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
    return api;
  }

  DV.gl = { fullscreen, CHUNK };
})(window.DV);

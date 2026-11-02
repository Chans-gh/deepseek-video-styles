# 技术选型矩阵：哪些能力真能跑出画面

> 结论先行：**Canvas 2D + SVG + CSS 能覆盖本库 34 种风格的全部；WebGL2 负责发光 / 流体 / 噪声；
> Three.js 负责几何 3D；Manim 只用于公式讲解；Blender 需要额外安装，本库不涉及。**
>
> 以下结论在 macOS + Chrome 156 + Node 22 + Python 3.13 的无头环境验证过。

---

## 一、运行环境

| 项 | 状态 | 影响 |
|---|---|---|
| Google Chrome | 156.x，由 `puppeteer-core` 驱动 | 逐帧渲染靠它 |
| `ffmpeg` | 系统可能没装 | `scripts/setup.sh` 用 npm 的 `@ffmpeg-installer/ffmpeg` 自带静态二进制 |
| Blender | 需额外安装 | 本库不涉及；程序化 3D 请自行接入 |
| Manim | 需 Python + LaTeX | 41 号以 Canvas 2D 实现，Manim 是可选升级 |
| Node / Python | 20+ / 3.10+ | 渲染器与拼图脚本 |
| Chrome 内部沙箱 | 容器或受限环境下常起不来 | 必须加 `--no-sandbox`（`render.mjs` 已内置） |
| puppeteer-core | **≥ 25** | 23 与 Chrome 156 协议不匹配，`goto` 报 `Requesting main frame too early` |

### 渲染管线

```text
场景 HTML（自带 seek(t)）
   ↓  puppeteer-core 打开、逐帧 evaluate(seek(t)) + screenshot
frames/f00000.png … f00143.png
   ↓  ffmpeg（libx264, crf 18, yuv420p）
<name>.mp4
   ↓  scripts/tools/sheet.py
联系表 PNG（人工或视觉模型验收用）
```

参考性能：1920×1080 / 24fps / 6 秒 = 144 帧，纯几何场景约 19s 渲完（每帧约 130ms），
重计算场景（逐像素处理）约 60s。这个速度足够做迭代，不必为了"快"牺牲画面。

---

## 二、技术栈矩阵

| 能力 | 强项 | 弱项 | 本库用在哪些风格 | 依赖 / 坑 |
|---|---|---|---|---|
| **Canvas 2D** | 逐像素控制、blend 模式、`filter: blur()`、文字排版 | 无 3D、无光照、大量绘制易掉帧 | 33 种（见第四节） | 无。注意预烘焙 |
| **SVG** | 矢量锐利、路径动画、`stroke-dashoffset` 描边生长 | 逐帧改属性开销大、复杂滤镜慢 | 同 Canvas 2D——线条类风格可平移到 SVG | 无 |
| **HTML/CSS** | 排版最快、字体最好看、动画用 transition | 难做像素级纹理、截帧需等动画结束 | 33 68 | 必须用 `seek(t)` 驱动而非 CSS 动画，否则截帧不稳定 |
| **WebGL2 / 原生 shader** | 噪声、流体、发光、光线步进，性能最好 | 学习曲线、代码长、无文字渲染 | 77；113 可切 WebGL2 备选 | 需 `--enable-unsafe-swiftshader`；无头下可跑 |
| **Three.js** | 几何 3D、材质、相机运动 | 体积大、需本地包 | 不涉及 | 要用就别引 CDN，用本地 `node_modules` 或内联精简版 |
| **p5.js / p5.brush** | 手绘笔触、快速原型 | brush 笔触质量仍不稳定 | 不涉及 | 笔触型风格不在本库范围 |
| **GSAP** | 缓动库、时间轴编排 | 无法替代绘制 | 不涉及 | 需本地包；`core.js` 的 `E` 已含常用缓动，30 行可替代 |
| **Remotion** | React 组件化、可编辑工程 | 依赖 React 与打包，渲染需其 CLI | 不涉及 | 收益/成本不划算 |
| **HyperFrames** | 分帧渲染思路 | 生态小 | 不涉及 | — |
| **Manim** | 公式推导最强 | 需 Python 环境 + LaTeX | 41 可选 | 41 号以 Canvas 2D 实现；Manim 是升级路径 |
| **Blender** | 真 3D、程序化建模、光照 | 需额外安装、渲染慢 | 不涉及 | — |

---

## 三、选型决策树

```text
要画的东西里有真实 3D 体积/光照吗？
├─ 有 → WebGL2（自写 shader）或 Three.js
└─ 没有
   ├─ 主要是文字/排版 → HTML/CSS 或 SVG
   ├─ 主要是几何图形/图表 → SVG 或 Canvas 2D
   ├─ 需要像素级纹理/噪声/混合 → Canvas 2D 或 WebGL2
   └─ 需要"手绘笔触" → 归为笔触型：要专门的笔刷引擎，不要用几何硬凑
```

---

## 四、34 种风格的技术栈落位

34 种全部落在 Canvas 2D 系（只有 77 用 WebGL2 做底层），差别在**用哪套底座**：

| 底座特征 | 风格编号 | 数量 | 主要公共件 |
|---|---|---|---|
| 直接绘制（几何 / 排版 / 图表 / 线稿） | 8 21 24 30 31 32 33 34 35 36 37 40 41 42 43 44 47 59 63 66 68 79 93 112 113 114 115 | 27 | core / type / post / anim / draw / ui |
| 低分辨率离屏 + 整数放大 | 55 56 58 | 3 | pixel |
| 离屏模糊 / 辉光合成 | 67 92 | 2 | post |
| 手绘抖动（`roughPts`） | 9 | 1 | draw |
| WebGL2 着色器 + 2D 字层 | 77 | 1 | gl |

> 27 种走"直接绘制"——**先把 Canvas 2D 的那套工具函数写扎实，就覆盖了大半工作量**。
> `assets/lib/` 里的公共件正是这么来的：种子随机、值噪声/fbm、缓动集、预烘焙、逐字定点排版、扫描线/暗角/辉光合成。

---

## 五、怎么跑

```bash
bash scripts/setup.sh                    # 装 puppeteer-core + 内置 ffmpeg

# 先出静帧看效果（2 秒）
node scripts/render.mjs --scene assets/scenes/_starter-canvas.html \
  --out out/try --aspect 16:9 --stills 1,3,5 --stills-only

# 再出整片
node scripts/render.mjs --scene assets/scenes/_starter-canvas.html --out out/try --aspect 16:9

# 拼联系表（单条片子的时间轴）
python3 scripts/tools/sheet.py out/try/frames --out out/try/sheet.png --fps 24
```

**必须加 `--no-sandbox`**（`render.mjs` 已写死）。原因不是安全偏好，而是受限环境里
Chrome 的子进程沙箱初始化会被系统拒绝：

```text
Failed to initialize sandbox. Operation not permitted
GPU process isn't usable. Goodbye.
```

不加这个参数，表现是 puppeteer 报 `Requesting main frame too early!`——**看起来像代码 bug，其实是环境限制**。

---

## 六、已知限制

| 项 | 限制 | 应对 |
|---|---|---|
| Three.js 无头初始化 | 需 `--enable-unsafe-swiftshader`，部分环境仍失败 | 优先用原生 WebGL2 写 shader |
| 中文字体 | 不同系统字体集不同，`measureText` 宽度会漂 | 只用系统自带字体；关键文字逐字定点，宽度 `Math.round` |
| 逐像素处理 | 1920×1080 全帧 `ImageData` 单层约 0.3s | 预烘焙到离屏 canvas，逐帧只做合成 |
| WebGL 截图 | `preserveDrawingBuffer` 默认 false，会截到全黑 | `assets/lib/gl.js` 已设为 true，不要改 |
| 长片渲染 | 渲染器无并发，144 帧约 19s，60 秒片会到分钟级 | 分片渲染或降低帧率 |

---
name: deepseek-video-styles
description: 用纯代码产出短片（默认 6 秒）时使用本技能——不调用任何图像/视频生成模型，覆盖动态图形、讲义型讲解、动态字体、像素游戏片头、UI 形变、数据叙事、品牌片头等 34 种风格，横竖双画幅。技能内含带精确坐标/时间轴/色值的风格配方、确定性 Canvas2D 与 WebGL2 渲染器，以及两条硬验收（同一时刻重渲像素一致、动态帧占比≥60%）。触发词：做个视频、出片、片头、开场动画、动态图形、风格化短片、16:9、9:16、竖屏。
agent_created: true
---

# 纯代码视频风格库

## 用途

把"某种视觉风格"翻译成**能执行的渲染规格**，用代码出片。不依赖 Seedance / Kling / Runway 这类生成模型，也不依赖实拍素材。

同一个风格，只给形容词大约 5 分，给足坐标、色值、时间轴能到 8 分以上——这是本技能存在的全部理由。

**适用**：6 秒上下的风格短片、片头、转场、讲义型动画、数据可视化叙事、游戏片头、UI 演示。
**不适用**：写实人物、口播剪辑、文章混剪、需要真实素材的 2.5D 视差、笔触型风格（水墨 / 水彩 / 油画）。

## 五步工作流

1. **选风格**：翻 `references/styles.md`（34 种，带"按用途找"表）。
2. **读配方**：打开对应风格的 `references/styles/<编号>-<名>.md`。参数表（横竖两套坐标）、时间轴、注意事项、规格卡都在里面，**参数直接抄，别自己估**。
3. **写场景**：复制 `assets/scenes/_starter-canvas.html`（或 `_starter-pixel` / `_starter-gl`），引 `assets/lib/` 里的公共件，只写"拼装"部分。一个场景通常 150–250 行。
4. **看样帧**：先只出静帧（`--stills-only`），改到满意再渲整片。整片 6 秒要 40–60 秒，样帧 2 秒。
5. **验收出片**：跑确定性校验 + 动态帧统计，两条都过再交。口径见 `references/acceptance.md`。

## 目录导航

| 路径 | 什么时候读 |
|---|---|
| `references/styles.md` | 选风格、按用途找 |
| `references/styles/*.md` | 34 份配方，一份一条 |
| `references/prompt-spec.md` | 要把一句风格描述展开成规格时（六段式、参数翻译表、黑名单） |
| `references/tech-matrix.md` | 不确定该用 Canvas / WebGL / 离屏像素时；含运行环境与已知限制 |
| `references/acceptance.md` | 交付前的验收口径（技术合规 10 项、视觉五维、失败归因） |
| `references/recipe-format.md` | 要新写一份配方时照这个字段填 |
| `assets/lib/` | 8 件公共件，见下表 |
| `assets/scenes/` | 三个起手模板（Canvas / 像素 / WebGL），复制改名即用 |
| `assets/examples/` | 三份完整源码：42 时间轴（排版）、55 像素平台（离屏）、77 品牌片（WebGL） |
| `scripts/render.mjs` | 确定性渲染器：`seek(t)` → 逐帧 PNG → mp4 |
| `scripts/check-determinism.sh` | 同一 t 渲两次比 sha256 |
| `scripts/tools/` | 联系表 `sheet.py`（单条时间轴）、总览图 `gallery.py`（一批横向对比） |

## 公共件（引了就别重写）

| 文件 | 提供 | 典型用在 |
|---|---|---|
| `core.js` | `DV.scene()` 骨架、`E` 缓动、`prog` 区间进度、噪声、`roundRect`、`drift` 推镜 | 全部 |
| `type.js` | `font` / `measure` / `riseIn`（带上浮遮罩）/ `typed`（打字机）/ `drawTracked` | 33 31 40 66 36 112 |
| `post.js` | `grain` / `vignette` / `scanlines` / `halftone` / `glow` / `paper` / `rays` | 全部 |
| `anim.js` | `clip` / `keyframes` / `counter` / `chars` / `polyline` / `sway` | 全部 |
| `draw.js` | 路径生长 `strokePts` / 手绘抖动 `roughPts` / 关节人 `person` / 轴测 `iso` / 引线 `arrow` / 对话框 `bubble` | 8 9 30 34 37 43 93 115 |
| `pixel.js` | 低分辨率离屏 `stage` + 整数放大 `blit` + `ditherGrad` + 5×7 字模 | 55 56 58 |
| `ui.js` | 窗口 `win`、代码着色 `code`、手机框 `phone`、键帽 `keycap`、`bars` / `ring` | 44 47 68 114 |
| `gl.js` | WebGL2 全屏着色器底座（含 fbm / 调色板 GLSL 片段） | 77 113 备选 |

## 六条硬规矩

1. **只依赖 `t`**。禁止 `Math.random` / `Date.now` / `requestAnimationFrame` / 累计状态。同一 `t` 必须渲染出同一像素，否则交付的片子无法复现、无法返修。
2. **先写版面表，再写绘制**。`aspects: { '16:9': {...}, '9:16': {...} }`，坐标成表。反过来写一定堆左上角。
3. **双画幅是重排，不是缩放**。竖屏要重新算字号、行距、留白；横屏内容塞进竖屏会字太小、底部空 1/3。
4. **材质必须多层**：底色 + 纹理 + 硬边 + 噪点。一层渐变冒充材质，一定像 PPT。
5. **字号有下限**：横屏正文 ≥18px，竖屏 ≥16px（按 1080 宽计）。低于这个数在手机上看是糊的。
6. **讲义型片子开 `drift: 0.008`**。内容在 3 秒就位后彻底静止，动态帧会掉到 45%，配乐一放就"死"。0.8% 推镜肉眼无感但每帧都在变。像素风**不要**开（非整数缩放会糊掉硬边）。

## 常用命令

```bash
# 1) 一次性装依赖（puppeteer-core + 内置 ffmpeg）
bash scripts/setup.sh

# 2) 只出样帧看效果（快，2 秒）
node scripts/render.mjs --scene assets/scenes/_starter-canvas.html \
  --out /tmp/try --aspect 16:9 --stills 1.0,3.0,5.0 --stills-only

# 3) 出整片（6 秒 × 24fps = 144 帧）
node scripts/render.mjs --scene scenes/my.html --out out/my --aspect 16:9
node scripts/render.mjs --scene scenes/my.html --out out/my-9x16 --aspect 9:16

# 4) 两条硬验收
bash scripts/check-determinism.sh scenes/my.html
ffmpeg -i out/my/my-16x9.mp4 -vf "select=gt(scene\,0.0001),metadata=print" -f null - 2>&1 | grep -c "pts_time"
```

渲染器的三个环境注意点：必须带 `--no-sandbox`（已内置）；字体要先 `document.fonts.ready` 再 `seek`，否则中英混排宽度会漂 0.几像素、确定性校验随机挂；`--stills` 为空时不要传 `''`（`Number('') === 0` 会静默多截一张 t=0 的帧）。

## 症状 → 去哪查

| 症状 | 根因 | 处置 |
|---|---|---|
| 动态帧 < 60%（<86/144） | 检测口径是**整帧面积差**，几十像素的字跳动等于没动 | 让大片区域亮暗：光扫、光团、纸面柔影、像素真的挪位；或开 `drift` |
| 同一 t 两次渲染差几像素 | 字体未就绪 / 亚像素定位 | `--disable-font-subpixel-positioning --font-render-hinting=none`；宽度 `Math.round` |
| WebGL 截图全黑 | `preserveDrawingBuffer` 默认 false | 已在 `gl.js` 设 true，别改 |
| WebGL 1080p 卡死 | swiftshader 下 MSAA 慢 3 倍 | `antialias: false`（`gl.js` 已设） |
| 竖屏中间一条灰带 | 压暗用了固定像素阈值，竖屏归一化坐标范围不同 | 用 `gl_FragCoord / u_res` 或按画幅取比例 |
| 铺满全幅的横带露边 | 线性渐变横向拉满，边缘笔直 | 改成径向光团，或让带子超出画面 |
| 形变类片子最后一秒发空 | 主体收成小控件，80% 面积无内容 | 给终止态配同题材主视觉（见 `styles/47-ui-morph.md`） |

更多逐条问题写在每份配方的「注意事项」节里，遇到具体风格先翻那一节。

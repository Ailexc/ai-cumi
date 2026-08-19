# AiCumi · 2026 顶级 AI 聊天产品界面设计研究报告

> 调研对象：ChatGPT / Claude / Gemini / Linear / Arc / Raycast / Notion / Perplexity / Cursor / Vercel(v0)
> 调研方法：抓取各产品真实设计 token（ChatGPT 直接提取自 chatgpt.com 运行时 CSS 变量）、品牌色库、设计系统文档（Linear·Perplexity·Claude·Cursor·Vercel·Arc·Notion 的 DesignMD token 表、shadcn Claude 主题、ColorFetch 调色板历史）与 2026 趋势综述。
> 说明：标注 ✅ 为**从真实页面/文档核实**的数值；标注 ⚠️ 为依据惯例估算、建议再核实。本报告聚焦**明亮系**（当前 AiCumi 深色主题不在本报告范围）。

---

## 〇、一句话结论

2026 年顶级 AI 产品的共同语言是：**暖调的"接近白"而非纯白、近黑而非纯黑、黑色低透明度的发丝边框而非灰边框、克制的阴影、单一低饱和强调色、超大行高 + 留白**。冷蓝灰 + 高饱和渐变 + 大圆角 + 厚重阴影 = "模板感/AI 廉价感"。

---

## 一、色彩系统

### 1.1 各产品色板（明亮系）

| 产品 | 画布背景 | 次级表面/侧栏 | 主文字 | 次要文字 | 边框 | 主色/强调色 |
|---|---|---|---|---|---|---|
| **ChatGPT** ✅ | `#fcfcfc`（暖白） | `#f9f9f9` | `#0d0d0d`（近黑） | 灰约 `#6e6e6e` | `rgba(0,0,0,.10)` 系 | CTA 纯黑 `#000`；accent 蓝 `#3a83f7` |
| **Claude** ✅ | `#faf9f5`（奶油白） | `#f5f0e8`（暖米） | `#141413`（近黑） | `#6c6a64`（暖灰） | `#e6dfd8`（暖发丝线） | 陶土橘 `#cc785c`（≈`#d97757`） |
| **Gemini** ✅ | `#fdfcfc`（微暖白） | `#ffffff` | `#1f1f1f` | 灰 | 低对比发丝线 | 近黑 `#1f1f1f`（黑白驱动） |
| **Linear** ⚠️(亮) | `#f8f9f9` | `#ffffff` | `#09090a` | `#62666d` | 发丝线 | 靛蓝 `#5e6acc` / `#5e6ad2` |
| **Perplexity** ✅ | `#fcfcf9`（暖白） | `#fdfbfa` | `#000000` | `#27251e`（暖黑） | 暖发丝线 | 暖黑 `#27251e`（黑白驱动） |
| **Raycast**（深色为主）✅ | `#1c1c1e` | `#242424`/`#2c2c2e` | `#f9f9f9` | `#9c9c9d` | hairline | 品牌红 `#FF6363` |
| **Notion** ✅ | `#ffffff` | `#f7f6f3`（暖灰） | `#37352f`（暖黑） | `#9b9a97` | `#e3e3e0` | 紫 `#5645d4`；链接蓝 `#0075de` |
| **Cursor** ✅ | `#f7f7f4`（暖奶油） | `#fafaf7` | `#26251e`（暖黑） | `#807d72` | `#e6e5e0` | 橙 `#f54e00`（仅 CTA/字标） |
| **Vercel** ✅ | `#ffffff` | `#fafafa` / `#f5f5f5` | `#171717` | `#4d4d4d`/`#888` | `#ebebeb` | 近黑 `#171717`；链接蓝 `#0070f3` |
| **Arc** ✅ | `#ffffff` | `#fffcec`（奶油） | `#3139fb` 系 | — | — | 电光蓝 `#3139fb` |

### 1.2 关键规律（直接抄）

1. **背景不是纯白**：`#fcfcfc`~`#faf9f5` 的微暖白（R 通道略高于 G/B 或 RGB 极接近但略低于纯白）。冷白 `#ffffff` 容易显"网页模板感"，暖白显"产品感"。
2. **文字不是纯黑**：ChatGPT `#0d0d0d`、Claude `#141413`、Cursor `#26251e`、Notion `#37352f`，都是**带一点暖的深炭**，比 `#000` 柔和。
3. **边框用"黑色 + 低透明度"而不是灰色**（ChatGPT 是最佳范本）✅：
   - 最弱 `rgba(0,0,0,.05)`、常规 `rgba(0,0,0,.10)`、强 `rgba(0,0,0,.15)`
   - Claude 的暖灰发丝线 `#e6dfd8`、Vercel `#ebebeb` 同理——都是"很浅、很细"。
   - 灰边框（如 `#d1d5db` Tailwind gray-300）是"模板感"最大来源。
4. **主色饱和度低、偏暖/偏沉稳**：coral 陶土橘（Claude）、indigo 靛蓝（Linear）、sage 鼠尾草（ChatGPT 品牌）、teal（Perplexity 早期）、暖黑（Perplexity/Vercel/Gemini 走黑白驱动）。**高饱和电光蓝/紫 + 渐变是廉价感来源**。
5. **ChatGPT 的 accent 主题体系**（可参考做"换肤"）✅：
   - 蓝：accent `#3a83f7`，浅色 tint `#e8f3fe`，hover pill bg `#e8f3fe`
   - 绿：`#53b559` / `#def3e5`；紫：`#8952ee` / `#ede5fc`；橙：`#ee7c37` / `#fbe8db`；粉：`#f077af` / `#fdedf4`
   - 黑（黑白驱动）：CTA `#000`，用户消息 `#000` 底白字
6. **次要/选中态用"低透明度的品牌色 tint"而非实色**：ChatGPT 选中态 `rgba(0,0,0,.10)`、hover `rgba(0,0,0,.07)`（`--surface-hover:#00000012`）。

### 1.3 直接给 AiCumi 的建议色板（明亮系，推荐"暖炭 + 单一低饱和强调色"）

```css
:root {
  /* 层次背景（暖白阶梯） */
  --bg-canvas:      #fcfcfc;   /* 主画布（ChatGPT） */
  --bg-secondary:   #f9f9f9;   /* 侧栏（ChatGPT secondary） */
  --bg-tertiary:    #f5f5f5;   /* 面板/悬浮层 */
  --bg-hover:       rgba(0,0,0,.05);
  --bg-active:      rgba(0,0,0,.08);
  --bg-selected:    rgba(0,0,0,.08);

  /* 文字（暖炭） */
  --text-primary:   #0d0d0d;
  --text-secondary: #5c5c5c;
  --text-muted:     #8a8a8a;
  --text-inverse:   #ffffff;

  /* 边框（黑色低透明度） */
  --border-subtle:  rgba(0,0,0,.06);
  --border:         rgba(0,0,0,.10);
  --border-strong:  rgba(0,0,0,.15);

  /* 主色（三选一，饱和度都压住） */
  /* A. 陶土橘（Claude 路线，最有"助理陪伴感"） */
  --primary:        #cc785c;  --primary-hover: #a9583e;  --primary-soft: #f6ede7;
  /* B. 靛蓝（Linear 路线，最"专业克制"） */
  --primary:        #5e6ad2;  --primary-hover: #4a56c4;  --primary-soft: #eef0fb;
  /* C. 暖炭（Perplexity/Vercel 路线，最极简） */
  --primary:        #0d0d0d;  --primary-hover: #000000;  --primary-soft: rgba(0,0,0,.06);

  /* 用户消息气泡：用品牌 tint，不用饱和实色 */
  --bubble-user-bg: #e9e9e9;   /* ChatGPT 用户消息即 #e9e9e9@50% */
  --bubble-user-text: #0d0d0d;
}
```

---

## 二、字体排版

### 2.1 各产品字体

| 产品 | 字体 |
|---|---|
| ChatGPT ✅ | 系统字体栈（`-apple-system-body, ui-sans-serif, system-ui, Segoe UI…`），**非 Inter** |
| Claude ✅ | 系统字体栈（设计文档确认） |
| Gemini ✅ | Google Sans Flex |
| Linear ✅ | 自研 Linear Text（SF Pro Display 回退） |
| Perplexity ✅ | 自研 pplxSans |
| Raycast | 系统字体（macOS SF Pro / 平台原生） |
| Notion ✅ | Notion Sans（Inter 衍生），系统字体栈回退 |
| Cursor ✅ | CursorGothic（展示）+ JetBrains Mono（代码） |
| Vercel ✅ | Geist Sans / Geist Mono |
| Arc ✅ | Marlin Soft SQ（展示）+ InterVariable（正文） |

**结论**：绝大多数产品用**系统字体栈**（原生质感、零加载成本）。需要自选时用 **Inter（UI）+ 可选 Geist Mono（代码/标识）**。

### 2.2 ChatGPT 真实字号/字重/行高/字距（✅ 直接可用）

| token | 字号 | 行高 | 字重 | 备注 |
|---|---|---|---|---|
| caption | 12px (0.75rem) | 16px | 400/600 | 辅助说明 |
| footnote | 13px | 18px | 400/500 | letter-spacing `-0.005rem`（微负） |
| body-small | 14px | 20px | 400/500/600 | 侧栏列表、气泡次要 |
| body | 16px (1rem) | **26px** | 400/600 | **消息正文核心！行高超大** |
| heading-3 | 18px | 26px | 600 | 小节 |
| heading-2 | 24px | 28px | 600 | 区块标题 |
| heading-1 | 36px | 40px | 600 | 大标题 |
| heading-app | 28px | 34px | 400/600 | 页面标题 |

**核心洞察**：正文 16px/行高 26px（1.625）——行高比一般模板（1.5）更松，这是"高级感"的隐形来源。字距整体为 0 或微负（footnote -0.005rem）。

### 2.3 给 AiCumi 的排版规范

```css
--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", monospace;

/* 消息正文 */ font-size:15.5px; line-height:1.65; letter-spacing:0; font-weight:400;
/* 气泡内 agent 名 */ font-size:13px; font-weight:600; letter-spacing:-0.005em;
/* 侧栏标题 */ font-size:14px; font-weight:500;
/* 侧栏预览 */ font-size:13px; line-height:20px; color:var(--text-secondary);
/* 空状态标题 */ font-size:18px; font-weight:600;
/* 顶栏标题 */ font-size:15px; font-weight:600;
```

> 中文字体注意：系统栈里的 PingFang SC 优先；中文无需负字距，中文正文行高建议 1.6~1.7。

---

## 三、布局与留白

### 3.1 实测/惯例数值

| 项 | 数值 |
|---|---|
| 侧边栏宽度 | ChatGPT **260px** ✅；Linear 260px；一般 240~280px，**拒绝 320px+ 的笨重侧栏** |
| 消息区最大内容宽度 | ChatGPT/Claude 约 **760~820px**（居中）；Perplexity 更宽 ~900px；**非全宽贴边** |
| 消息区两侧留白 | 内容区外至少 24px；气泡到内容边界间距 16~24px |
| 元素间距节奏 | **4px / 8px / 12px / 16px / 24px / 32px / 48px**（4px 网格，Perplexity 用 4px 增量 ✅；Linear 用 8px 增量） |
| 消息间距 | 同组连续消息 8~12px；切换角色 24~32px |
| 侧栏列表项 | 每项 padding 8~10px 上下 × 12px 左右；项间 2~4px |
| 顶栏高度 | 48~56px（ChatGPT 用紧凑 48px 感） |
| 输入区底部留白 | 下方 16~24px，输入框到消息区留 16px |

### 3.2 层级法则

1. **宁可空，不可挤**：顶级产品的"空气感"来自大留白。消息行高 1.6+、区块间距 32~48px。
2. **间距靠"留白"而不是"卡片/边框"来分组**（Vercel 原则）：能用 24px 间距分组的，就不要加卡片和边框。
3. **8px 基线的对位**：所有 padding/margin/gap 落在 4 的倍数上，混乱的 5/7/13px 是模板感来源。
4. 侧栏、顶栏、输入区三者的垂直节奏统一（如都用 16px 内边距）。

---

## 四、组件细节

### 4.1 AI 头像（Agent 头像）

- **主流趋势**：ChatGPT 用品牌 orb（径向发光黑底星芒）、Claude 用辐射状星芒、Gemini 用四色星形。核心是**几何图形 + 单一渐变/光晕，不是 emoji、不是照片、不是字母+彩色底**。
- 建议：给 AiCumi 每个 agent 设计**一个 28px 的几何 mark**（如用 agent 主色的 `conic-gradient`/`radial-gradient` 柔和渐变 + 居中白色图形符号），avatar 圆角用 `border-radius: 8px`（Squircle 感）而非正圆 50%。
- 消息流里 AI 头像**只有 AI 消息侧出现**，24~28px，带 1px 微边框或光晕；用户侧**不出现头像**（ChatGPT/Claude 用户消息无头像）。

### 4.2 消息气泡

- **现代做法（ChatGPT/Claude 2025+）**：**取消"气泡化"倾向，改为"行内文本"**——AI 消息无背景（透明），只有文字直接躺在画布上；用户消息用**很浅的 tint**（ChatGPT `#e9e9e9@50%`，Claude 用户消息为淡暖 tint）或**近黑实色+白字**（黑白驱动模式）。
- 若要保留气泡（AiCumi 现状），规则：
  - AI 气泡：**白底 + 1px `rgba(0,0,0,.06~.10)` 边框**，圆角 12~16px，**无阴影或仅 0 1px 2px rgba(0,0,0,.04)**；
  - 用户气泡：用品牌 tint（`--primary-soft`）或近黑实色，**不叠加阴影**；
  - 圆角不对称（尾角更小）：AI `16px 16px 16px 6px`，用户 `16px 16px 6px 16px`（Linear/Notion 风格）；
  - 最大宽度 **75%**（保持现状），行高 1.65；
  - **不要**：大阴影、纯色高饱和用户气泡（如当前 `#6366f1` 全蓝气泡）、彩色渐变气泡。
- Agent 名行：AI 消息顶部 13px/600 暖黑小标题（当前已有，保留但字体改细）。

### 4.3 输入框 Composer

参考 ChatGPT 2025 的 Composer 结构：
- **结构**：一个圆角容器（`border-radius: 16~20px`）包裹整块：`[+ 按钮] [textarea] [上传/工具按钮…] [发送按钮]`；
- **表面**：白底 + 1px `rgba(0,0,0,.10)` 边框，**聚焦时边框变 `rgba(0,0,0,.15)` + 极淡外发光**（如 `box-shadow: 0 0 0 4px rgba(0,0,0,.04)`）；
- **textarea**：无内边框、无背景（透明）、`min-height:24px; max-height:200px`，占满；
- **发送按钮**：右下角 32~36px，近黑/品牌色圆角 10~12px 方块，**有文字时出现/变实色**（禁用态 `rgba(0,0,0,.25)` 或隐藏）；
- **左侧工具按钮**（+、附件、模型选择）：32px 的 ghost 图标按钮，hover 时 `rgba(0,0,0,.06)`；
- 底部 hint：`⌘ Enter` 提示用小字 footnote + 平台 kbd 样式。
- 输入区整体**悬浮在底部**（四周留白 16px），**不是贴边的整条色块**（当前 AiCumi 是贴边色块——需改）。

### 4.4 侧边栏会话列表

- **选中态**：`rgba(0,0,0,.08)` 浅灰底 + 文字近黑（**不用品牌色文字**；Linear/ChatGPT 都这样）；圆角 8~10px；
- **悬停态**：`rgba(0,0,0,.04)` 更浅；
- **会话标题**：14px/500；**预览**：13px/灰；右对齐时间戳 12px 灰；
- **未读徽标**：不用大红点，用 **12px 的实心小圆点（品牌色或黑）** 或加粗标题；或用 1px 品牌色左边条；
- **分组标题**：12px/600 大写或 13px/500 灰色小标题（如"今天 / 最近 / 已归档"），间距 8px；
- 列表项高度 44~48px，项间距 2px。

---

## 五、层次与质感

### 5.1 阴影（ChatGPT 实测 ✅——极其克制）

```css
--shadow-xs: 0 0 15px rgba(0,0,0,.10);          /* 悬浮柔和 */
--shadow-sm: 0 1px 3px rgba(0,0,0,.10), 0 1px 2px -1px rgba(0,0,0,.10);
--shadow-md: 0 4px 6px -1px rgba(0,0,0,.10), 0 2px 4px -2px rgba(0,0,0,.10);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,.10), 0 4px 6px -4px rgba(0,0,0,.10);
```

- 全部是 **10% 黑 + 短距离**。`0 12px 32px rgba(16,24,40,.10)` 这种 Tailwind 默认/当前 Demo 用的阴影（0.10 但更大模糊）都**偏重**，高级产品最多用到 `0 12px 32px rgba(0,0,0,.08)` 于浮层。
- **层级靠"背景亮度阶梯"而非阴影**：canvas → secondary → tertiary（`#fcfcfc`→`#f9f9f9`→`#f5f5f5`）就够了。

### 5.2 边框/背景分层

- 侧栏、顶栏与主区之间用**1px 发丝线**（`rgba(0,0,0,.06~.10)`）而非色块对比；
- 需要更强的面板（输入框、浮层）才用"白底 + 细边框"；
- **拒绝**：每块都描边、卡片套卡片、彩色分割条。

### 5.3 毛玻璃/渐变（2026 的"克制玻璃"）

- Raycast 是玻璃拟态范本：**面板用 backdrop-blur（如 20~40px blur + 白 50~70% 透明度 / 深色 60% 黑）**，让内容透出一点，但**保持高可读性**；
- ChatGPT 顶栏/Composer 边缘也有轻 blur；
- 规则：**玻璃只用在悬浮层/顶部条/输入区，且 blur 后对比度必须达标**；不要在内容区大面积用毛玻璃。
- **渐变**：Vercel 把多色 mesh 渐变**只用于 hero 装饰**；产品 UI 内几乎不用渐变。若要品牌色渐变，只用于 logo/头像，不用在按钮和气泡上。

---

## 六、动效与微交互

### 6.1 ChatGPT 动效参数（✅ 实测）

- **缓动**：spring 系，常用时长 **0.667s**（`--spring-common-duration:.667s`），弹跳类 0.833s~1s；基础 ease-in `cubic-bezier(.4,0,1,1)`；
- 消息流入场：淡入 + 轻微上移（透明度 + `translateY(4~6px)`），时长 150~200ms——当前 AiCumi 已有 `fadeInUp 6px`，方向正确，但建议控制在 200ms 内、用 ease-out；
- **Typing 指示器**：ChatGPT 用三点**淡入淡出呼吸**（每点独立 `opacity` 动画），或流式光标 `▍` 闪烁；**不用彩虹渐变转圈**；Claude 用"思考中"字样的柔和 pulse。

### 6.2 微交互清单

| 元素 | 行为 |
|---|---|
| 侧栏项 hover | `background: rgba(0,0,0,.04)`，120ms ease-out |
| 侧栏项 active | `rgba(0,0,0,.08)`，无位移（或 0.5px） |
| 发送按钮 | 有内容时从 40% 透明度渐变为实色，180ms；点击无缩放或仅 0.97 |
| 气泡入场 | 新消息 opacity 0→1 + y 4px→0，200ms ease-out；**用户消息不重放动画** |
| 流式文本 | 逐 token 追加（不闪整个块）；末尾 `▍` 光标 500ms 呼吸 |
| Typing | 三点 opacity 依次 0.4→1，总周期 1.2s |
| 滚动 | 自动滚到最新，仅在"接近底部"时触发；顶部有历史时不强制跳动 |
| 按钮 hover | 仅背景/边框微变，**不要 translate 上浮 + 大阴影**（模板感） |

- **尊重 `prefers-reduced-motion`**，提供关闭项。
- 原则（Vercel/2026）：**动效只解释状态变化，不为炫而炫**；"quiet motion"（安静的运动）是关键词。

---

## 七、空状态与品牌

### 7.1 空状态（新会话首页）

- 参考 ChatGPT/Claude：**大标题 + 副标题 + 建议卡片/提示**。
  - 标题：24~28px / 600，暖黑；
  - 副标题：15px / `--text-secondary`；
  - 建议：3~4 个**卡片或横向胶囊**，白底 1px 细边框 + hover 提亮；或纯文本建议列表；
  - **不要**：巨大 emoji 居中（当前 `💬` 5xl 就是模板感重灾区）、彩虹渐变欢迎卡。
- 空状态图标若需要：用**线性几何图形 + 单一品牌色**（`--primary-soft` 底 + `--primary` 描边），32~40px。

### 7.2 Logo 与品牌区

- 侧栏顶部 logo：**图形 mark（24px）+ 字标（15~16px/600 暖黑）**，水平排列；不要 emoji；
- 连接状态（在线/连接中）：用**8px 圆点**（绿 `#53b559` / 灰 `#8a8a8a`）+ 12px 灰文字，**不要用 🟢🔴 emoji**（当前代码里就是 emoji——替换为 CSS 圆点）；
- 品牌色渐变只出现在 logo 图形里。

---

## 八、2026 年设计趋势

综合 2026 趋势综述（Midrocket / ideapeel / lummi / alphanotic / sanjaydey 等）：

1. **暖色取代冷蓝灰**：AI 产品从"机器感"转向"被居住的界面"（*interfaces that feel inhabited — warmer palettes, quieter motion*）。Claude 的奶油+陶土、Perplexity/Cursor 的暖白就是代表。
2. **"克制的玻璃拟态"（Responsible Glassmorphism）**：玻璃回归，但只用于浮层/顶栏，且保证可读性（Raycast 范本）。
3. **AI-native 新组件模式**：typing 指示、流式输出、工具调用状态（agent 动作时间线）、上下文面板——这是新产品的机会点。
4. **安静的运动（quiet motion）**：短时长、低幅度、语义化。
5. **黑白驱动（monochrome-first）+ 单一强调色**：Vercel/Perplexity/Gemini 都走向近黑 CTA；色彩作为稀缺资源。
6. **可变字体 / 光学尺寸**：ChatGPT token 里全是 `--optical-size`；标题与正文用不同 optical size。
7. **沉浸式/情感化但克制**：个性来自排版与文案，不来自装饰。
8. **生成式/自适应 UI**：界面随上下文动态重组（对聊天产品即：根据消息类型渲染组件）。

**对我们（AiCumi 个人助理团队）最相关的趋势**：暖调 + 克制 + AI-native 状态表达 + 键盘/快捷操作（Linear 式）。

---

## ★ 特别关注：为什么顶级产品"高级"、我们容易"模板感/廉价感"

逐条对照，都是**细节差**：

| 维度 | 高级产品 | 模板感（我们目前的坑） |
|---|---|---|
| 背景 | 暖白 `#fcfcfc`/`#faf9f5`，有灰度层次 | 深色 `#0f172a` 或纯白，无层次 |
| 文字 | 近黑 `#0d0d0d`，大行高 1.65 | 纯黑/纯白、行高 1.4 挤 |
| 边框 | `rgba(0,0,0,.06~.15)` 发丝线 | Tailwind `gray-300 #d1d5db` 灰边框 |
| 阴影 | 10% 黑、短距离、几乎无感 | 大模糊、有色相阴影（如 `rgba(30,50,100,.14)`） |
| 主色 | 低饱和：coral/indigo/sage/暖黑 | 高饱和 `#6366f1` 全屏使用 |
| 渐变 | 仅 logo/hero 装饰 | 按钮、气泡、输入框全渐变 |
| 头像 | 几何图形/光晕 mark | emoji 🚀🤖💬 |
| 气泡 | AI 透明/极浅 tint，用户 tint | 用户整块高饱和色、AI 深色块 |
| 选中态 | `rgba(0,0,0,.08)` 中性 | 品牌色 20% 透明底 + 品牌色文字 |
| 圆角 | 8/12/16 克制，不对称尾角 | 全 24/32 大圆角 |
| 间距 | 4px 网格、大量留白 | 挤、padding 小、卡片多 |
| 动效 | 200ms 微动 | 无/或过度弹跳 |
| 空状态 | 排版型（标题+建议） | 大 emoji 居中 |
| 字体 | 系统栈/Inter，光学术语 | 随便引入 display 字体 |

**一句话**：把颜色压灰一点、边框淡一点、阴影小一点、留白多一点、渐变收起来、emoji 换掉——"高级感"主要来自**减法**，不是加法。

---

## ✅ 最终 10 条可执行要点

1. **背景换暖白**：主画布 `#fcfcfc`、侧栏 `#f9f9f9`、面板 `#f5f5f5`，禁止纯白/纯深蓝背景。
2. **文字换暖炭**：主文字 `#0d0d0d`，次文字 `#5c5c5c`，不用 `#000`/`#fff` 两极。
3. **边框换发丝线**：全部改用 `rgba(0,0,0,.06/.10/.15)`，删掉所有 `gray-300` 类灰边框。
4. **主色压饱和度**：从 `#6366f1` 换成陶土橘 `#cc785c` 或靛蓝 `#5e6ad2` 或暖黑 `#0d0d0d`，只用于 CTA/选中强调。
5. **气泡重构**：AI 消息白底细边框或透明，用户消息用 `--primary-soft` 或 `#e9e9e9` tint，圆角 12~16px 不对称，去阴影。
6. **删除渐变和 emoji**：渐变只留 logo，头像换成几何 mark，状态点用 CSS 圆点（绿 `#53b559`/灰 `#8a8a8a`）。
7. **排版拉开**：正文 15.5~16px、行高 1.65、字距 0；标题 600；侧栏 14/13px；用系统字体栈。
8. **留白与栅格**：间距统一 4px 网格；消息区 max-width 780px 居中；侧栏 260px；输入框悬浮圆角容器而非贴边色块。
9. **微交互**：hover 仅 `rgba(0,0,0,.04)`、active `.08`；气泡入场 200ms ease-out 淡入上移；typing 用三点呼吸；尊重 reduced-motion。
10. **阴影与层次**：阴影全部 ≤10% 黑、短距；层级靠背景亮度阶梯，靠留白分组，不靠卡片和描边。

---

## 参考来源（本次联网核实）

- chatgpt.com 运行时 CSS 变量（直接提取，2026-08）：`--main-surface-primary #fcfcfc`、`--border-default #0000001a`、阴影/字号/spring 等
- shadcn.io/theme/claude：Claude 奶油 `oklch(.97 .02 70)` + 陶土 `oklch(.70 .14 45)`
- designmd.co：Linear / Perplexity / Claude / Cursor / Vercel / Arc / Notion / Gemini 的 DESIGN.md token 表
- colorfetch.com：linear.app / perplexity.ai 调色板历史
- designpieces.com：ChatGPT 品牌三色 `#74aa9c` / `#ab68ff` / `#ffffff`
- color-hex.com：新版 ChatGPT 品牌色板（低饱和 sage/coral/lavender）
- matthiasfrank.de + paletacolorpro.com：Notion 暖中性色板 `#fff #f7f6f3 #e8e5df #9b9a97 #37352f`
- loftlyy.com / webuiprompt.com：Raycast 品牌色 `#FF6363 #07080A #f9f9f9 #9c9c9d`
- 2026 趋势综述：midrocket.com、ideapeel.com、lummi.ai、alphanotic.com、sanjaydey.com

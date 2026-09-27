# 07 - UI 物理交互引擎、阻尼动效与 Web Audio 音效系统

本文档对《分一下》最具辨识度的皇冠级产品特色——基于数学幂方程构建的卡片轮播物理学、手势惯性动量投影、Web Audio API 整数吸附音效以及 iOS 级果冻抖动交互进行详尽的物理与代码测绘。

---

## 1. `BillCardCarousel` 的三维立体物理学模型

本系统的账单卡片堆叠效果绝非使用现成的 Swiper 或轮播组件，而是由作者手写的纯数学方程驱动。源码核心位于 [`src/components/BillCardCarousel/BillCardCarousel.tsx:39-95`](file:///Users/robin/Desktop/fenyixia/src/components/BillCardCarousel/BillCardCarousel.tsx#L39-L95)。

### 1.1 核心数学参数表 (`CFG`)
参数由 [`src/contexts/DebugContext.tsx:1-45`](file:///Users/robin/Desktop/fenyixia/src/contexts/DebugContext.tsx#L1-L45) 统一注入：
- **`STEP = 148`**：卡片水平基准步长（相邻卡片展开距离 148px）；
- **`SCALE_STEP = 0.13`**：逐级缩放比例衰减基数（每远离中心一级衰减 13%）；
- **`MIN_SCALE = 0.60`**：卡片缩放绝对下限（保证最远端卡片仍保留 60% 尺寸可读）；
- **`Y_STEP = 14`**：景深下沉位移基数（每远离中心一级向下沉降 14px）；
- **`OPACITY_STEP = 0.26`**：景深透明度衰减基数；
- **`curveX = 0.8`**：水平展开指数；
- **`curveScale = 2.4`**：缩放指数；
- **`curveY = 1.7`**：垂直下沉指数；
- **`curveOpacity = 1.7`**：透明度衰减指数。

### 1.2 空间变换公式推导
设当前卡片索引为 $i$，轮播当前浮动聚焦位置为 $\text{frac} = \text{curIdx} + \text{dragOffset}$。
卡片相对于当前焦点的距离为：
$$\Delta = i - \text{frac},\quad \text{absO} = |\Delta|,\quad \text{sign} = \text{sgn}(\Delta)$$

为防止暴力滑动手势导致卡片飞出屏幕边缘崩溃，系统对各维度实施了距离钳位保护（Clamping）：
$$\text{cappedX} = \min(\text{absO}, 2.5)$$
$$\text{cappedY} = \min(\text{absO}, 3.0)$$
$$\text{cappedS} = \min(\text{absO}, 4.0)$$
$$\text{cappedO} = \min(\text{absO}, 4.0)$$

随后将钳位距离代入指数空间求解变换量：
$$cX = (\text{cappedX})^{0.8}$$
$$cS = (\text{cappedS})^{2.4}$$
$$cY = (\text{cappedY})^{1.7}$$
$$cO = (\text{cappedO})^{1.7}$$

最终施加在卡片 DOM 上的四维 CSS 属性为：
- **水平平移 $X$**：
  $$X = \text{sign} \times cX \times 148\text{px} = \text{sign} \times (\min(\text{absO}, 2.5))^{0.8} \times 148\text{px}$$
- **垂直平移 $Y$**：
  $$Y = cY \times 14\text{px} = (\min(\text{absO}, 3.0))^{1.7} \times 14\text{px}$$
- **空间缩放 $\text{scale}$**：
  $$\text{scale} = \max\left(0.60,\, 1 - (\min(\text{absO}, 4.0))^{2.4} \times 0.13\right)$$
- **景深透明度 $\text{opacity}$**：
  $$\text{opacity} = \max\left(0,\, 1 - (\min(\text{absO}, 4.0))^{1.7} \times 0.26\right)$$
- **Z轴层叠索引 $Z$**：
  $$Z = 100 - \text{round}(\text{absO} \times 10)$$

> **数学设计之精妙**：  
> 水平展开指数取 $0.8 < 1$，属于凹函数，使相邻卡片在稍微滑动时即迅速向左右侧拉开距离，产生极度通透的展开感；而缩放指数取 $2.4 > 1$，属于高阶凸函数，使正中聚焦卡片在小范围微动时保持饱满的大卡片状态，一旦远离中轴则呈断崖式加速缩小，营造出震撼的立体透视纵深！

### 1.3 惯性动量释放 (Inertia Momentum)
在 Framer Motion 监听到手势松开瞬间（`onPanEnd`），物理系统根据当前手势速度向量注入动量计算：
```ts
const velocity = -info.velocity.x
const offset = -info.offset.x / CFG.STEP
// 动量投影核心公式
const projectedOffset = offset + (velocity * CFG.INERTIA_RATIO) / CFG.STEP
const target = Math.round(curIdx + projectedOffset)
const clamped = Math.max(0, Math.min(N - 1, target))
```
借助 `velocity * 0.35` 的惯性衰减投影，使得用户在快速轻弹拨动时，卡片不会机械地仅移动一张，而是能顺畅滑过 2~3 张后以极其自然的机械阻尼稳稳吸附在目标卡片上。

### 1.4 超越超调回弹 (Snap Overshoot Spring)
松手吸附阶段，卡片被赋予经过精密调校的三次贝塞尔曲线过渡：
```css
transition: transform 0.42s cubic-bezier(.17, .89, .32, 1.2), opacity 0.42s ease;
```
由于贝塞尔曲线第四参数 $1.2 > 1.0$，卡片在精准到达目标位置时，会产生约 $20\%$ 的轻微“过度冲刺并向回反弹”（Overshoot Bounce），模拟出真实物理世界中弹性钢片的震荡阻尼感。

---

## 2. Web Audio API 整数吸附音效反馈系统

- **底层音频资源**：[`assets/sfx/`](file:///Users/robin/Desktop/fenyixia/assets/sfx/)
  - `滑动音效01.wav`（轻盈清脆机械微卡塔声）
  - `滑动音效02.wav`（沉稳阻尼金属吸附声）
  - `滑动音效03.wav`（高频轻灵反馈声）

### 2.1 整数跨越检测算法 (`checkSfxTrigger`)
为了在无级连续拖拽中产生如同实体滚轮刻度般的“齿轮顿挫感”，系统设计了整数跨越监听器（[`legacy/app.js:146-171`](file:///Users/robin/Desktop/fenyixia/legacy/app.js#L146-L171)）：
```javascript
function checkSfxTrigger(frac) {
  const nearest = Math.round(frac);
  if (nearest !== SFX.lastInt) {
    SFX.lastInt = nearest;
    playSfx(); // 跨越整数卡槽边界瞬间触发
  }
}
```
当卡片在滑动流中被拨过任意两张卡片的中心中点时，系统调用硬件级 `AudioContext` 瞬时建立 `AudioBufferSourceNode` 发声，带来无与伦比的手耳一体化触感。

---

## 3. iOS 级果冻抖动与头像动效体系

### 3.1 成员卡片果冻抖动 (Wiggling Avatars)
- **源码对应**：[`src/components/SplitDetail/BillSheet.tsx:450-461`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L450-L461) 与 [`src/styles/global.css:1936-2020`](file:///Users/robin/Desktop/fenyixia/src/styles/global.css#L1936-L2020)
- **关键帧物理**：
  在明细项编辑底栏中，已分配成员卡片呈现模拟 iOS 桌面长按删除的果冻抖动态：
  ```css
  @keyframes bs-avatar-wiggle {
    0%, 100% { transform: rotate(0deg); }
    20%       { transform: rotate(-6deg); }
    40%       { transform: rotate(6deg); }
    60%       { transform: rotate(-4deg); }
    80%       { transform: rotate(4deg); }
  }
  .bs-member-card {
    animation: bs-avatar-wiggle 0.55s ease-in-out infinite;
  }
  ```
- **智能手势静止规约**：
  当用户手指按下开始拖拽新成员向上移动时，样式自动施加 `.bs-item--droppable .bs-member-card { animation: none; }`，**瞬间静止所有抖动**，防止视觉晃动干扰瞄准，体现出对人机交互细节的极致考究。

---

## 4. 全站底栏统一架构 (`BottomSheet.tsx`)

在早期代码中，`BillSheet`、`DisputeSheet`、`SplitDetail`、`AddBillOverlay` 分别手写了 4 套不同的弹出与滑动抽屉。
在 Commit `558208b`（OpenSpec: `bottom-sheet-unification`）中，系统彻底抽离了底层公用组件 [`src/components/shared/BottomSheet.tsx:1-58`](file:///Users/robin/Desktop/fenyixia/src/components/shared/BottomSheet.tsx#L1-L58)：
- **入场与出场曲线**：
  严格遵循 iOS 原生 ActionSheet 减速曲线：
  `transition: { type: 'tween', duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }`
- **安全边距与头部手柄**：
  统一集成居中灰色物理提手（Handlebar `.sh`），内置移动端底部的 `env(safe-area-inset-bottom)` 保护，使所有二次浮层交互具备统一的工业级质感。

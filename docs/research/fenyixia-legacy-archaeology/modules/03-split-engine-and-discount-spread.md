# 03 - 分账引擎、折扣平摊算法与税则嵌入体系

本文档深入解析《分一下》的核心业务引擎——细粒度条目（Itemized）分摊模型、负数满减折扣平摊算法（`feature/discount-spread`）以及加拿大安大略省 13% HST 税费内嵌规则。

---

## 1. 账单分摊数据模型与计算公式

### 1.1 实体模型拓扑
分账领域由四层实体构成：
- **`Bill`（账单头）**：记录全局信息（总金额、垫付人、发生日期、图标分类）。
- **`BillItem`（消费明细项）**：具体小票上的某一项消费（如“牛肉面”、“啤酒”）。
- **`Member`（参与人视图）**：该项消费的具体分摊对象。
- **`BillItemMember`（分摊合同）**：多对多交叉表，决定单项商品由谁买单。

### 1.2 单人实摊金额（`my_share`）标准计算公式
设账单 $B$ 包含明细项集合 $I = \{i_1, i_2, \dots, i_m\}$。
对于明细项 $i$，其单价为 $\text{price}_i$，数量为 $\text{qty}_i$，承担该项的成员集合为 $M_i$（成员数量为 $|M_i|$）。

若用户 $u \in M_i$，则用户在明细项 $i$ 上的应付金额为：
$$\text{share}(u, i) = \frac{\text{price}_i \times \text{qty}_i}{|M_i|}$$

用户 $u$ 在整笔账单 $B$ 中的应承担总额（`my_share`）为所有其参与项的累加和：
$$\text{my\_share}(u, B) = \sum_{i \in I, u \in M_i} \text{share}(u, i) = \sum_{i \in I, u \in M_i} \frac{\text{price}_i \times \text{qty}_i}{|M_i|}$$

此逻辑在前端由 [`src/lib/types.ts:16-41`](file:///Users/robin/Desktop/fenyixia/src/lib/types.ts#L16-L41) 声明，在数据库端由专用视图 `bill_shares` ([`supabase-schema.sql:74-89`](file:///Users/robin/Desktop/fenyixia/supabase-schema.sql#L74-L89)) 利用 `LATERAL JOIN` 实现精确统计。

---

## 2. 负数折扣平摊算法与分钱守恒定理 (`feature/discount-spread`)

### 2.1 业务痛点与算法目标
在实际消费中，外卖满减红包、超市优惠券通常以**负数行**形式体现在小票上（例如：`-CA$ 10.00`）。若将负数行作为独立条目让全体人平摊，往往会引发归属争议；而人工逐项去扣减每个商品的单价，计算极为繁琐且容易因浮点精度发生几分钱的误差。

`feature/discount-spread` 实现了在保存账单时，将勾选了“分摊到商品”开关的负数折扣项，**按各正数商品金额权重等比折算并抵扣到正数商品单价中**，并在持久化时自动剔除负数项，保障数学总额的严格守恒。

### 2.2 算法公式与美分守恒推导
设明细项集合为 $I$：
1. **勾选平摊的负数折扣集合**：
   $$D = \{ d \in I \mid d.\text{price} < 0 \land d.\text{spreadDiscount} = \text{true} \}$$
2. **正数商品集合**：
   $$P = \{ i \in I \mid i.\text{price} > 0 \land \neg i.\text{spreadDiscount} \}$$
3. **正数商品总金额基数**：
   $$S_{\text{pos}} = \sum_{i \in P} (\text{price}_i \times \text{qty}_i)$$
4. 对每一个折扣项 $d \in D$，其绝对总优惠额为 $T_d = |\text{price}_d \times \text{qty}_d|$。
   正数项 $i \in P$ 应该分摊承担的优惠金额为：
   $$\Delta_{i,d} = T_d \times \frac{\text{price}_i \times \text{qty}_i}{S_{\text{pos}}}$$
5. **折后新单价（保留两位小数）**：
   $$\text{price}'_i = \frac{\text{round}\left( \left(\text{price}_i - \frac{\Delta_{i,d}}{\text{qty}_i}\right) \times 100 \right)}{100}$$

### 2.3 源码实现实录
- **核心算法实现** ([`src/components/SplitDetail/BillSheet.tsx:51-68`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L51-L68))：
  ```ts
  function applyDiscountSpread(items: BillItem[]): BillItem[] {
    const discountItems = items.filter(it => it.price < 0 && it.spreadDiscount)
    if (discountItems.length === 0) return items

    const totalDiscount = discountItems.reduce((s, it) => s + Math.abs(it.price * (it.qty || 1)), 0)
    const posItems = items.filter(it => it.price > 0 && !it.spreadDiscount)
    const posSum = posItems.reduce((s, it) => s + it.price * (it.qty || 1), 0)
    if (posSum <= 0) return items

    return items
      .filter(it => !(it.price < 0 && it.spreadDiscount)) // 关键：剔除已分摊的负数项
      .map(it => {
        if (it.price <= 0 || it.spreadDiscount) return it
        const itemTotal = it.price * (it.qty || 1)
        const ratio = itemTotal / posSum
        const discountForItem = totalDiscount * ratio
        const newUnitPrice = Math.max(0.01, Math.round(((itemTotal - discountForItem) / (it.qty || 1)) * 100) / 100)
        return { ...it, price: newUnitPrice }
      })
  }
  ```
- **实时只读预览计算** ([`BillSheet.tsx:70-89`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L70-L89))：
  在用户编辑界面中，不直接篡改输入框中的原始价格，而是通过 `computePreviewPrices(items)` 计算折后预览价，在单价输入框下方以绿色文字呈现 `折后 ≈ CA$ X.XX`。

---

## 3. 安大略省 13% HST 税则内嵌模型

### 3.1 税费单价内嵌法设计决策
在加拿大餐馆外卖及超市小票中，通常末尾会有 `HST 13%` 税款。在传统记账软件中，税金通常单独列为一行由所有人平分，这在“部分人点生鲜食品（免税）、部分人点堂食或啤酒（应税）”的混合账单中极其不公平。

《分一下》做出了关键工程决策：**“税费内嵌于应税单价法”**。在 AI 识别阶段，强制将税费等比吸收进各应税商品单价中，小票最终条目绝对不出现“税金 (Tax)”这一孤立行！

### 3.2 税则规则工程约束
源码位于 [`src/lib/api/scan.ts:94-117`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L94-L117)：
1. **免税商品（0% HST，保持原价）**：
   - 肉类、生鲜蔬菜、水果、蛋、纯牛奶；
   - 未加工主食：米、生面粉、面包、食用油；
   - 纯茶叶、无糖咖啡豆。
2. **应税商品（13% HST，单价上浮 13%）**：
   - 零食、糖果、碳酸饮料、气泡水、果汁含量低于 25% 的饮品；
   - 单份即饮饮品（容量低于 600mL）；
   - 熟食、堂食、热外卖；
   - 外卖平台配送费、服务费。
3. **计算公式**：
   $$\text{price}_{\text{final}} = \text{round}(\text{price}_{\text{base}} \times 1.13 \times 100) / 100$$
   并在商品名称后自动追加 `(含税)` 标记。小费（Tips）不纳税，保持原样。

---

## 4. 跨容器逃逸拖拽分摊物理学

在 [`src/components/SplitDetail/BillSheet.tsx:162-252`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L162-L252) 中，系统实现了一套高精度的拖拽分配交互：

1. **突破视口裁剪的 Ghost 节点**：
   普通的拖拽容易被模态框底栏的 `overflow-y: auto` 裁剪。系统在监听到手势 `onPointerDown` 时，动态创建 `.bs-drag-ghost` 原生 DOM 节点并直接 `document.body.appendChild`，将其提升至最顶级图层。
2. **矩形碰撞检测命中算法**：
   在手势移动中，实时遍历各商品条目的 DOM 引用 `itemCardRefs.current[idx]`，提取其屏幕绝对包围盒：
   `const rect = el.getBoundingClientRect()`
   判断当前光标坐标是否落在矩形内：
   `e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom`
   命中条目立即触发背景微亮动效，松手瞬间触发 `applyDrop` 将该成员推入分摊数组。

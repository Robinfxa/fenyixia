import { api } from '../apiClient';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
}

export async function recordTokenUsage(_userId: string, _feature: string, _usage: TokenUsage): Promise<void> {
  // Backend automatically records token usage in token_usage table
}

export async function scanReceipt(
  images: { base64: string; mediaType: string }[],
  prompt: string
): Promise<{ result: ScanResult; usage: TokenUsage | null }> {
  const res = await api.post<{ result: ScanResult; usage: TokenUsage | null }>('/api/scan-receipt', {
    images: images.map((img) => ({ base64: img.base64, media_type: img.mediaType })),
    prompt,
  });

  return {
    result: res.result,
    usage: res.usage,
  };
}

export function buildScanPrompt(
  type: 'physical' | 'digital',
  members: string[],
  n: number,
  userHint?: string,
  imageCount = 1
): string {
  const tpl = `{
  "icon": "<最合适的消费类别 emoji>",
  "title": "<商户名+消费类型，如'海底捞外卖'、'Costco采购'，优先用商户名而非泛泛分类>",
  "desc": "<商户名 · 消费描述>",
  "amount": "CA$ {实际TOTAL金额}",
  "per": "CA$ {TOTAL÷${n}的结果}",
  "date": "<消费日期，格式：M月D日>",
  "items": [
    { "name": "<英文全称 (中文翻译)>", "qty": <数量>, "price": <含税单价，折扣为负数> }
  ],
  "category": "<grocery/dining/transport/entertainment/health/shopping/utilities/other>",
  "merchant": "<商户/平台名称>",
  "settled": false,
  "members": ${JSON.stringify(members)},
  "rawTotal": <TOTAL 数字，必须是含税最终金额>
}`;

  if (type === 'physical') {
    return `你是专业的实体小票 OCR 识别助手，处理超市、餐厅等纸质收据照片。

图片可能有透视变形、光线不均、折痕，请仔细识别所有可见文字。

严格按以下 JSON 格式输出，不含任何额外文字或 markdown：

${tpl}

【最重要】金额规则：
- amount 和 rawTotal 必须取小票上的 TOTAL（最终应付总额），绝不能用 SUBTOTAL
- TOTAL = SUBTOTAL + 所有税（HST/GST/PST）

【安省HST (13%) 规则 — 税直接算入商品单价，不单独列税行】：
- 基础食品免税(0%): 生鲜蔬果、肉蛋奶、面包、米面、食用油、咖啡豆/茶叶、调味料/香料、烘焙原料、麦片、罐头蔬菜/水果、冷冻未加工食品、黄油、奶酪
- 需收13%HST: 薯片/零食、糖果巧克力、碳酸饮料(含气泡水)、果汁含量<25%的饮料、单份饮料(<600mL)、能量棒/蛋白棒/格兰诺拉棒、爆米花(已爆)、咸味坚果、冰淇淋(单份<500mL)、甜点烘焙品(少于6个单份)、所有热食/外卖/堂食、非冷冻三明治/沙拉/熟食拼盘
- 小票上通常用 H 或 * 标记应税商品，请注意识别
- 对于应税商品：price = 原价 × 1.13（含税），name 末尾加 " (含税)"
- 对于免税商品：price = 原价，不加标注
- items 数组中【不要】单独列 HST/TAX 行，税已分摊到各应税商品的 price 里
- 所有 items 的 price×qty 之和应等于 rawTotal

【商品名称规则】：
- 北美超市小票的商品名通常是大写英文缩写，你必须猜出完整英文名并附上中文翻译
- name 格式固定为："英文全称 (中文翻译)"，应税商品额外加 "(含税)"
- 常见缩写示例：
  NN = No Name, PC = President's Choice, CH = Club House, GV = Great Value
  KD = Kraft Dinner, BN = Brand Name, SC = Selection, IRR = Irregular
  HOMO MK = Homo Milk, GRN PEP = Green Pepper, BBy CRT = Baby Carrot
  ENGL MFFN = English Muffin, STRW BRRY = Strawberry, BL BRRY = Blueberry
  CHK BRST = Chicken Breast, GRD BEEF = Ground Beef, BK BEANS = Baked Beans
- 如果缩写无法确认，保留原文并在括号里给出最佳猜测的中文

【其他要点】：
- 日期统一转为"M月D日"
- 提取所有商品行，一条不漏，包括折扣行（price 为负数）
- 返回纯 JSON，不要有任何其他文字${imageCount > 1 ? `\n\n【注意】：共有 ${imageCount} 张图片，是同一张小票的不同部分，请合并识别所有内容，items 汇总所有图片中的商品` : ''}${userHint ? `\n\n【用户补充说明】：${userHint}` : ''}`;
  }

  return `你是专业的 App 订单截图识别助手，处理打车、外卖等数字收据截图。

严格按以下 JSON 格式输出，不含任何额外文字或 markdown：

${tpl}

【最重要】金额规则：
- amount 和 rawTotal 必须取最终支付总额 TOTAL，不能用 SUBTOTAL
- TOTAL = 所有费用 + 税 + 小费（如有）

【安省HST (13%) — 税直接算入商品单价】：
- 对于应税的服务费、配送费、食品：price = 原价 × 1.13，name 末尾加 " (含税)"
- 小费不收税，保留原价
- items 数组中【不要】单独列 HST/TAX 行，税分摊到各应税项的 price 里

【识别要点】：
- 打车类（Uber/Lyft）：title 用具体名称如"Uber打车"，desc="平台·起点→终点"，items 分解各费用（车费、服务费、税→含入price、小费），折扣负数，category=transport
- 外卖类（DoorDash/Uber Eats）：title 用"餐厅名+外卖"如"海底捞外卖"，desc="平台·餐厅名"，每道菜名写"英文全称 (中文翻译)"+配送费+服务费（税含入各项price），小费单列，折扣负数，category=dining
- 所有英文菜名/商品名都附上中文翻译，格式："English Name (中文)"
- 返回纯 JSON，不要有任何其他文字${imageCount > 1 ? `\n\n【注意】：共有 ${imageCount} 张截图，请合并识别所有内容，items 汇总所有图片中的商品和费用` : ''}${userHint ? `\n\n【用户补充说明】：${userHint}` : ''}`;
}

export function buildQuickBillPrompt(text: string, currentDate: string, members: string[]): string {
  return `你是一个智能账单生成助手。用户会用一句自然语言描述一次消费，你需要解析出账单信息。

用户输入：「${text}」

当前日期：${currentDate}
参与成员：${JSON.stringify(members)}

严格按以下 JSON 格式输出，不含任何额外文字或 markdown：

{
  "icon": "<最合适的消费类别 emoji>",
  "title": "<账单标题，如'海底捞聚餐'、'打车去机场'>",
  "desc": "<简短描述>",
  "date": "<YYYY-MM-DD 格式，从用户描述推断，如'昨天'则计算实际日期>",
  "color": "<主题色，如 '#FF6B6B' 暖色系用于餐饮，'#4ECDC4' 冷色系用于交通>",
  "items": [
    { "name": "<商品/服务名>", "qty": <数量>, "price": <单价数字> }
  ],
  "members": ${JSON.stringify(members)},
  "rawTotal": <总金额数字>
}

【规则】：
- 如果用户没说具体商品明细，就根据消费场景合理拆分（如"吃火锅320"可以拆成"锅底"、"菜品"、"饮料"等）
- 如果用户提到了人名，对应到 members 列表中的成员
- 如果没提到具体人，默认所有 members 参与
- date 必须是 YYYY-MM-DD 格式，根据"昨天""上周五"等相对描述计算出实际日期
- 返回纯 JSON，不要有任何其他文字`;
}

export async function uploadReceiptImage(_userId: string, blob: Blob, ext: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, `receipt.${ext}`);
  const res = await api.post<{ url: string }>('/api/upload/receipt', formData);
  return res.url;
}

export async function insertReceiptScan(
  _userId: string,
  _imagePath: string,
  _scanResult: ScanResult,
  _billId: string
): Promise<void> {
  // Scans can be stored locally or linked
}

export interface DisputeItemInput {
  name: string;
  price: number;
  qty: number;
  member_names: string[];
}

export interface DisputeSuggestionResult {
  items: { name: string; price: number; qty: number; member_names: string[] }[];
  explanation: string;
}

export function buildDisputePrompt(
  items: DisputeItemInput[],
  allMembers: string[],
  challengerName: string,
  reason: string
): string {
  return `你是一个公平的账单裁决助手。一位成员对账单的分摊方式提出了质疑，你需要根据其理由重新分配各商品的分摊成员。

【原账单明细】：
${JSON.stringify(items, null, 2)}

【所有成员】：${JSON.stringify(allMembers)}

【质疑人】：${challengerName}

【质疑理由】：${reason}

请根据质疑理由，合理调整每个商品的 member_names（分摊成员）。规则：
- 只调整 member_names，不要修改 name、price、qty
- 每个商品至少保留一个分摊成员
- member_names 中的名字必须来自【所有成员】列表
- 如果质疑理由合理（如"这道菜我没吃"），就将该成员从对应商品中移除
- 如果质疑理由不合理或无法判断，保持原样

严格按以下 JSON 格式输出，不含任何额外文字或 markdown：

{
  "items": [
    { "name": "<商品名>", "price": <单价>, "qty": <数量>, "member_names": ["<成员名>", ...] }
  ],
  "explanation": "<简短解释你为什么这样调整，1-2句话>"
}`;
}

export interface ScanResultItem {
  name: string;
  qty: number;
  price: number;
}

export interface ScanResult {
  icon?: string;
  title?: string;
  desc?: string;
  amount?: string;
  per?: string;
  date?: string;
  items?: ScanResultItem[];
  category?: string;
  merchant?: string;
  rawTotal?: number;
  color?: string;
  members?: string[];
}

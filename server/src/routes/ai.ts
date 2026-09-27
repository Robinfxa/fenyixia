import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';
import { callLuna, LunaMessage, LunaContentPart } from '../ai/openai.js';
import { AppEnv } from '../types.js';

export const aiRoute = new Hono<AppEnv>();
aiRoute.use('*', optionalAuthMiddleware);

function cleanJsonResponse(txt: string): any {
  let cleaned = txt.trim();
  // Strip Markdown code block wrappers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

// POST /api/scan-receipt
aiRoute.post('/scan-receipt', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const { prompt } = body;
    type ImageEntry = { base64: string; media_type?: string; mediaType?: string };
    let imageList: ImageEntry[] = [];
    if (Array.isArray(body.images) && body.images.length > 0) {
      imageList = body.images;
    } else if (body.image_base64) {
      imageList = [{ base64: body.image_base64, media_type: body.media_type || 'image/jpeg' }];
    }

    if (imageList.length === 0 && !prompt) {
      return c.json({ error: 'Images or prompt required' }, 400);
    }

    // Build multi-modal message parts
    const contentParts: LunaContentPart[] = [];
    for (const img of imageList) {
      const mediaType = img.media_type || img.mediaType || 'image/jpeg';
      const base64Data = img.base64.startsWith('data:')
        ? img.base64
        : `data:${mediaType};base64,${img.base64}`;

      contentParts.push({
        type: 'image_url',
        image_url: { url: base64Data },
      });
    }

    const defaultPrompt = `你是专业的实体小票 OCR 识别助手，处理超市、餐厅等纸质收据照片。
严格按以下 JSON 格式输出，不含任何额外文字或 markdown：
{
  "icon": "🛒",
  "title": "<商户名+消费类型>",
  "desc": "<商户名 · 消费描述>",
  "amount": "CA$ {实际TOTAL金额}",
  "per": "CA$ {分摊金额}",
  "date": "<消费日期，格式：M月D日>",
  "items": [
    { "name": "<英文全称 (中文翻译)>", "qty": 1, "price": 0.00 }
  ],
  "category": "grocery",
  "merchant": "<商户名称>",
  "settled": false,
  "rawTotal": 0.00
}

【金额规则】：amount 和 rawTotal 必须取小票上的 TOTAL（最终应付总额），TOTAL = SUBTOTAL + 所有税（HST/GST/PST）。
【安省HST (13%) 规则】：税直接算入商品单价，不单独列税行。应税商品(零食/熟食/含糖饮料/生活用品)价格乘1.13并在名称末尾标注 "(含税)"；生鲜蔬果肉蛋奶免税(0%)。
【北美超市缩写】：NN=No Name, PC=President's Choice, GV=Great Value, HOMO MK=Homo Milk, CHK BRST=Chicken Breast。`;

    contentParts.push({
      type: 'text',
      text: prompt || defaultPrompt,
    });

    const messages: LunaMessage[] = [
      {
        role: 'user',
        content: contentParts,
      },
    ];

    const lunaRes = await callLuna(messages, undefined, undefined, { jsonMode: true });
    const parsedResult = cleanJsonResponse(lunaRes.content);

    // Record token usage if user is authenticated
    if (user) {
      await db.run(
        `INSERT INTO token_usage (id, user_id, model, input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        user.id,
        lunaRes.model,
        lunaRes.usage.prompt_tokens,
        lunaRes.usage.completion_tokens
      );
    }

    return c.json({
      result: parsedResult,
      usage: {
        input_tokens: lunaRes.usage.prompt_tokens,
        output_tokens: lunaRes.usage.completion_tokens,
        model: lunaRes.model,
      },
      _model: lunaRes.model,
    });
  } catch (err: any) {
    console.error('Scan receipt error:', err);
    return c.json({ error: err.message || 'Scan receipt failed' }, 500);
  }
});

// POST /api/dispute-arbitration
aiRoute.post('/dispute-arbitration', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const { bill_id, reason, challenger_id, items = [], members = [] } = body;

    const systemPrompt = `你是一名公正专业的账单争议仲裁助手。
用户提交了对当前账单分摊方案的异议。
你的任务是：根据异议人给出的理由（如“我没喝啤酒”、“蛋糕是寿星请客”），对账单中的商品参与人进行合理差分调整。

【严格不变量守恒法则】：
1. 原始条目守恒：你绝不能修改、删除或新增任何商品！每个条目的 name, price, qty 必须与原账单 100% 保持完全一致！
2. 只允许调整每个商品的 member_ids 列表。
3. 严格按 JSON 格式返回：
{
  "reason_analysis": "<一句话分析异议与调整逻辑>",
  "suggested_items": [
    { "name": "...", "price": 0.00, "qty": 1, "member_ids": ["uuid1", "uuid2"] }
  ]
}`;

    const userPrompt = `
账单明细：
${JSON.stringify(items, null, 2)}

参与成员名单：
${JSON.stringify(members, null, 2)}

异议人 ID: ${challenger_id || user?.id}
异议人提出的理由：
"${reason}"

请给出合理的 suggested_items 方案。`;

    const messages: LunaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const lunaRes = await callLuna(messages, undefined, undefined, { jsonMode: true });
    const parsed = cleanJsonResponse(lunaRes.content);

    // Verify items conservation
    if (Array.isArray(parsed.suggested_items)) {
      // Ensure prices and names match originals if length is identical
      for (let i = 0; i < Math.min(items.length, parsed.suggested_items.length); i++) {
        parsed.suggested_items[i].name = items[i].name;
        parsed.suggested_items[i].price = items[i].price;
        parsed.suggested_items[i].qty = items[i].qty;
      }
    }

    if (user) {
      await db.run(
        `INSERT INTO token_usage (id, user_id, model, input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        user.id,
        lunaRes.model,
        lunaRes.usage.prompt_tokens,
        lunaRes.usage.completion_tokens
      );
    }

    return c.json({
      success: true,
      reason_analysis: parsed.reason_analysis,
      suggested_items: parsed.suggested_items,
      model: lunaRes.model,
    });
  } catch (err: any) {
    console.error('Dispute arbitration error:', err);
    return c.json({ error: err.message || 'Arbitration failed' }, 500);
  }
});

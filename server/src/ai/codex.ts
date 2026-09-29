import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { LunaMessage, LunaResponse, CallLunaOptions } from './openai.js';

export function getCodexDir(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  }
  return codexHome;
}

export function isCodexCliAvailable(): boolean {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = spawn(whichCmd, ['codex'], { stdio: 'pipe' });
    return new Promise<boolean>((resolve) => {
      result.on('close', (code) => resolve(code === 0));
      result.on('error', () => resolve(false));
    }) as any;
  } catch {
    return false;
  }
}

/**
 * Sync ChatGPT Codex OAuth token from DuckDB into ~/.codex/auth.json
 * so official `codex` CLI runtime can execute seamlessly using subscription quota.
 */
export async function syncCodexAuthFromDb(): Promise<boolean> {
  try {
    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('openai_token', 'openai_refresh_token', 'openai_account_email', 'openai_auth_mode')"
    );
    let token = '';
    let refreshToken = '';
    let email = '';
    let authMode = '';
    for (const r of rows) {
      if (r.key === 'openai_token') token = r.value;
      if (r.key === 'openai_refresh_token') refreshToken = r.value;
      if (r.key === 'openai_account_email') email = r.value;
      if (r.key === 'openai_auth_mode') authMode = r.value;
    }

    if (!token || authMode !== 'codex_oauth') {
      return false;
    }

    let accountId = '';
    try {
      const parts = token.split('.');
      if (parts[1]) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        accountId = payload['https://api.openai.com/auth']?.chatgpt_account_id || '';
      }
    } catch {}

    const codexDir = getCodexDir();
    const authPath = path.join(codexDir, 'auth.json');
    const authData = {
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      last_refresh: new Date().toISOString(),
      tokens: {
        access_token: token,
        account_id: accountId || undefined,
        refresh_token: refreshToken || undefined,
      },
    };

    fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), { mode: 0o600 });
    return true;
  } catch (err) {
    console.warn('[Codex] Failed to sync auth from DB:', err);
    return false;
  }
}

/**
 * Execute prompt via official OpenAI Codex CLI runtime
 */
export async function callCodex(
  messages: LunaMessage[],
  model?: string,
  options?: CallLunaOptions
): Promise<LunaResponse> {
  await syncCodexAuthFromDb();

  // Validate that the authorized account has Codex subscription entitlement
  const rows = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM system_settings WHERE key IN ('openai_token', 'openai_account_email')"
  );
  let currentToken = '';
  let accountEmail = '';
  for (const r of rows) {
    if (r.key === 'openai_token') currentToken = r.value;
    if (r.key === 'openai_account_email') accountEmail = r.value;
  }
  if (currentToken) {
    try {
      const parts = currentToken.split('.');
      if (parts[1]) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const planType = payload['https://api.openai.com/auth']?.chatgpt_plan_type || '';
        if (planType === 'free') {
          throw new Error(
            `当前授权的 ChatGPT 账号 (${accountEmail || '未识别邮箱'}) 为【免费版账号 (Free)】。OpenAI 规定 Codex 订阅额度仅对 ChatGPT Plus / Pro / Team 等付费订阅用户开放。请在管理面板使用具有 Plus 或 Pro 订阅的账号重新进行「Codex 设备代码授权」，或在 API Key 模式下配置第三方兼容 Base URL。`
          );
        }
      }
    } catch (e: any) {
      if (e.message.includes('免费版账号')) throw e;
    }
  }

  const tempFiles: string[] = [];
  const imageFiles: string[] = [];
  let promptText = '';

  for (const m of messages) {
    if (typeof m.content === 'string') {
      promptText += `\n[${m.role.toUpperCase()}]:\n${m.content}\n`;
    } else if (Array.isArray(m.content)) {
      promptText += `\n[${m.role.toUpperCase()}]:\n`;
      for (const part of m.content) {
        if (part.type === 'text') {
          promptText += `${part.text}\n`;
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const rawUrl = part.image_url.url;
          if (rawUrl.startsWith('data:image/')) {
            const matches = rawUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
              const base64Data = matches[2];
              const tempImg = path.join(os.tmpdir(), `codex_img_${crypto.randomUUID()}.${ext}`);
              fs.writeFileSync(tempImg, Buffer.from(base64Data, 'base64'));
              tempFiles.push(tempImg);
              imageFiles.push(tempImg);
            }
          }
        }
      }
    }
  }

  if (options?.jsonMode) {
    promptText += '\n\n【重要要求】：请严格直接输出纯 JSON 数据，禁止包含任何 markdown 标记、代码块 ```json 或额外说明文字。';
  }

  const outputFile = path.join(os.tmpdir(), `codex_out_${crypto.randomUUID()}.txt`);
  tempFiles.push(outputFile);

  const targetModel = model || 'gpt-5.6-luna';
  const args = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--ignore-user-config',
    '--ignore-rules',
    '-s',
    'read-only',
    '-m',
    targetModel,
    '-o',
    outputFile,
  ];

  for (const img of imageFiles) {
    args.push('-i', img);
  }
  // Read prompt from stdin
  args.push('-');

  return new Promise<LunaResponse>((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';

    const proc = spawn('codex', args, {
      env: {
        ...process.env,
        CODEX_HOME: getCodexDir(),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Codex CLI 执行超时 (120s)'));
    }, 120_000);

    proc.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    proc.on('error', (err: any) => {
      clearTimeout(timeout);
      cleanupTempFiles(tempFiles);
      if (err.code === 'ENOENT') {
        reject(new Error('服务器未找到 codex 命令，请先运行: npm install -g @openai/codex'));
      } else {
        reject(new Error(`启动 Codex 进程失败: ${err.message}`));
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      let content = '';

      if (fs.existsSync(outputFile)) {
        try {
          content = fs.readFileSync(outputFile, 'utf8').trim();
        } catch {}
      }

      cleanupTempFiles(tempFiles);

      if (content) {
        resolve({
          content,
          usage: {
            prompt_tokens: Math.ceil(promptText.length / 4),
            completion_tokens: Math.ceil(content.length / 4),
            total_tokens: Math.ceil((promptText.length + content.length) / 4),
          },
          model: targetModel,
        });
        return;
      }

      const combinedErr = (stderrData + '\n' + stdoutData).trim();
      if (combinedErr.includes("You've hit your usage limit") || combinedErr.includes('usage limit')) {
        reject(new Error('当前 ChatGPT Codex 配额已达上限，请稍后再试或在 ChatGPT 检查订阅状态'));
      } else if (combinedErr.includes('not supported when using Codex with a ChatGPT account')) {
        reject(new Error(`模型 ${targetModel} 在 ChatGPT 账户模式下不支持，建议使用 gpt-5.6-luna`));
      } else {
        reject(new Error(`Codex 执行失败 (退出码 ${code}): ${combinedErr || '未获取到模型输出'}`));
      }
    });

    proc.stdin.write(promptText);
    proc.stdin.end();
  });
}

function cleanupTempFiles(files: string[]) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  }
}

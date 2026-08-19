// AiCumi — 渠道管理（P2：渠道向导）
// 管理 OpenClaw 的外部 IM 通道（飞书/Telegram/WhatsApp 等）
// 读写 openclaw.json 的 channels 配置

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { OPENCLAW_LOCAL_DIR } from './staff.js';

const execAsync = promisify(exec);
const OPENCLAW_CONFIG = join(OPENCLAW_LOCAL_DIR, 'openclaw/openclaw.json');
const GATEWAY_CONTAINER = process.env.OPENCLAW_GATEWAY_CONTAINER || 'openclaw-gateway-local';

// ============ 类型 ============

export interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  accountCount: number;
  accounts: ChannelAccount[];
}

export interface ChannelAccount {
  id: string;
  name: string;
  botName?: string;
  enabled: boolean;
}

export interface ChannelConfig {
  enabled: boolean;
  dmPolicy?: string;
  allowFrom?: string[];
  accounts: Record<string, any>;
}

// ============ 预置通道模板 ============

export const CHANNEL_TEMPLATES: Record<string, { name: string; description: string; fields: { key: string; label: string; type: string; required: boolean }[] }> = {
  feishu: {
    name: '飞书',
    description: '连接飞书机器人，支持私聊和群聊',
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
      { key: 'name', label: '机器人名称', type: 'text', required: true },
      { key: 'botName', label: '显示名称', type: 'text', required: false },
    ],
  },
  telegram: {
    name: 'Telegram',
    description: '连接 Telegram Bot，支持私聊和群组',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
      { key: 'name', label: '机器人名称', type: 'text', required: true },
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    description: '连接 WhatsApp Business API',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true },
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
      { key: 'name', label: '机器人名称', type: 'text', required: true },
    ],
  },
  slack: {
    name: 'Slack',
    description: '连接 Slack Bot，支持私聊和频道',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
      { key: 'appToken', label: 'App Token', type: 'password', required: true },
      { key: 'name', label: '机器人名称', type: 'text', required: true },
    ],
  },
  discord: {
    name: 'Discord',
    description: '连接 Discord Bot，支持私聊和服务器',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
      { key: 'name', label: '机器人名称', type: 'text', required: true },
    ],
  },
};

// ============ 操作函数 ============

/** 读取 openclaw.json */
function readConfig(): any {
  if (!existsSync(OPENCLAW_CONFIG)) return {};
  return JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
}

/** 写入 openclaw.json */
function writeConfig(cfg: any): void {
  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
}

/** 获取所有通道状态 */
export function getChannels(): ChannelInfo[] {
  const cfg = readConfig();
  const channels = cfg.channels || {};

  return Object.entries(channels).map(([id, config]: [string, any]) => ({
    id,
    name: CHANNEL_TEMPLATES[id]?.name || id,
    description: CHANNEL_TEMPLATES[id]?.description || '',
    enabled: config.enabled !== false,
    accountCount: Object.keys(config.accounts || {}).length,
    accounts: Object.entries(config.accounts || {}).map(([accountId, account]: [string, any]) => ({
      id: accountId,
      name: account.name || accountId,
      botName: account.botName,
      enabled: config.enabled !== false,
    })),
  }));
}

/** 获取通道配置详情 */
export function getChannelConfig(channelId: string): ChannelConfig | null {
  const cfg = readConfig();
  return cfg.channels?.[channelId] || null;
}

/** 启用/禁用通道 */
export function toggleChannel(channelId: string, enabled: boolean): { ok: boolean; error?: string } {
  try {
    const cfg = readConfig();
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels[channelId]) {
      return { ok: false, error: `通道 ${channelId} 不存在` };
    }
    cfg.channels[channelId].enabled = enabled;
    writeConfig(cfg);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** 添加通道账号 */
export function addChannelAccount(
  channelId: string,
  accountId: string,
  accountConfig: Record<string, any>,
): { ok: boolean; error?: string } {
  try {
    const cfg = readConfig();
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels[channelId]) {
      // 创建新通道
      cfg.channels[channelId] = {
        enabled: true,
        dmPolicy: 'open',
        allowFrom: ['*'],
        accounts: {},
      };
    }
    cfg.channels[channelId].accounts[accountId] = accountConfig;
    writeConfig(cfg);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** 删除通道账号 */
export function removeChannelAccount(
  channelId: string,
  accountId: string,
): { ok: boolean; error?: string } {
  try {
    const cfg = readConfig();
    if (!cfg.channels?.[channelId]?.accounts?.[accountId]) {
      return { ok: false, error: '账号不存在' };
    }
    delete cfg.channels[channelId].accounts[accountId];
    // 如果没有账号了，删除整个通道
    if (Object.keys(cfg.channels[channelId].accounts).length === 0) {
      delete cfg.channels[channelId];
    }
    writeConfig(cfg);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** 获取可用通道模板 */
export function getChannelTemplates(): Record<string, any> {
  return CHANNEL_TEMPLATES;
}

/** 重启 gateway 使配置生效 */
export async function restartGateway(): Promise<{ ok: boolean; error?: string }> {
  try {
    await execAsync(`docker restart ${GATEWAY_CONTAINER}`, { timeout: 30000 });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
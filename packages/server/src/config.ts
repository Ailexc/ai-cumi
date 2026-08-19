// AiCumi Chat Server — 配置
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载项目根目录 .env
config({ path: resolve(process.cwd(), '../../.env') });

export const cfg = {
  /** OpenClaw Gateway HTTP 地址（用于 /v1/chat/completions） */
  gatewayHttpUrl: process.env.OPENCLAW_GATEWAY_HTTP_URL || 'http://127.0.0.1:18789',
  /** OpenClaw Gateway WebSocket 地址（用于 RPC） */
  gatewayWsUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
  /** Gateway 认证 token */
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  /** 聊天服务器端口 */
  chatPort: parseInt(process.env.CHAT_PORT || '3100', 10),
  /** 聊天服务器绑定地址 */
  chatHost: process.env.CHAT_HOST || '0.0.0.0',
  /** 默认 agent ID */
  defaultAgentId: process.env.DEFAULT_AGENT_ID || 'keling',
};

// AiCumi Chat Server — 入口
// Express HTTP API + WebSocket 实时通信

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { cfg } from './config.js';
import { createWsServer } from './ws-server.js';
import { initGatewayWs, isGatewayWsConnected } from './gateway-ws.js';
import * as rooms from './rooms.js';
import { listRoles, addStaff, previewPersona } from './staff.js';
import { listPersonaTemplates } from './persona-templates.js';
import {
  listMemberSummaries,
  getMemberProfile,
  getPersona,
  getSkills,
  getMemory,
  getFiles,
  getHistory,
} from './member-profile.js';
import {
  listModels,
  updatePersona,
  refinePersona,
  updateIdentity,
  reindexMemory,
  switchModel,
  deleteMember,
  logAudit,
  getAudit,
} from './member-admin.js';
import type { Agent } from './types.js';

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

// ============ HTTP API ============

/** 健康检查 */
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    gateway: isGatewayWsConnected() ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

/** Agent 列表 */
app.get('/api/agents', (_req, res) => {
  const agents: Agent[] = [
    { id: 'keling', name: '可灵', status: 'running' },
    { id: 'xiaoyan', name: '小研', status: 'running' },
    { id: 'staff-dde57f', name: '小文', status: 'running' },
  ];
  res.json({ ok: true, agents });
});

/** 房间列表 */
app.get('/api/rooms', (_req, res) => {
  res.json({ ok: true, rooms: rooms.listRooms() });
});

/** 创建房间 */
app.post('/api/rooms', (req, res) => {
  const { name, agentId } = req.body || {};
  if (!name || !agentId) {
    return res.status(400).json({ ok: false, error: 'name 和 agentId 必填' });
  }
  const room = rooms.createRoom(name, agentId);
  res.json({ ok: true, room });
});

/** 房间消息历史 */
app.get('/api/rooms/:id/messages', (req, res) => {
  const msgs = rooms.getMessages(req.params.id);
  res.json({ ok: true, messages: msgs });
});

// ============ 群聊管理（P2：阶段二） ============

/** 创建群聊 */
app.post('/api/groups', (req, res) => {
  const { name, memberAgentIds, ownerAgentId } = req.body || {};
  if (!name || !Array.isArray(memberAgentIds) || memberAgentIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'name 和 memberAgentIds 必填' });
  }
  const room = rooms.createGroupRoom(name, memberAgentIds, ownerAgentId);
  res.json({ ok: true, room });
});

/** 群聊添加成员 */
app.post('/api/groups/:id/members', (req, res) => {
  const { agentId } = req.body || {};
  if (!agentId) {
    return res.status(400).json({ ok: false, error: 'agentId 必填' });
  }
  const ok = rooms.addGroupMember(req.params.id, agentId);
  if (!ok) {
    return res.status(404).json({ ok: false, error: '群聊不存在' });
  }
  const room = rooms.getRoom(req.params.id);
  res.json({ ok: true, room });
});

/** 列出所有群聊 */
app.get('/api/groups', (_req, res) => {
  res.json({ ok: true, groups: rooms.listGroupRooms() });
});

// ============ 员工管理（P0：添加员工向导） ============

/** 可用角色模板列表（供员工向导选择） */
app.get('/api/roles', (_req, res) => {
  res.json({ ok: true, roles: listRoles() });
});

/** 人设模板库（供精修向导"从模板快速开始"） */
app.get('/api/persona-templates', (_req, res) => {
  res.json({ ok: true, templates: listPersonaTemplates() });
});

/** 添加员工预览（不落盘不创建，只生成人设文本供确认）——阶段一收尾：预览+迭代闭环 */
app.post('/api/staff/preview', (req, res) => {
  const { name, role, duty } = req.body || {};
  try {
    const preview = previewPersona({ name, role, duty });
    res.json({ ok: true, ...preview });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || '生成预览失败' });
  }
});

/** 添加员工（招同事）：创建 agent + 固定房间 */
app.post('/api/staff', async (req, res) => {
  const { name, agentId, role, duty } = req.body || {};
  try {
    const staff = await addStaff({ name, agentId, role, duty });
    logAudit({
      agentId: staff.agentId,
      memberName: staff.name,
      action: 'staff_add',
      summary: `招新：${staff.name}（角色 ${staff.role}）加入团队`,
    });
    res.json({ ok: true, staff });
  } catch (err: any) {
    console.error('[api/staff] 添加员工失败:', err.message);
    res.status(400).json({ ok: false, error: err.message || '添加员工失败' });
  }
});

// ============ 成员档案（P1：档案中心，只读） ============

/** 成员列表摘要 */
app.get('/api/members', (_req, res) => {
  try {
    res.json({ ok: true, members: listMemberSummaries() });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 成员档案概览 */
app.get('/api/members/:id', (req, res) => {
  try {
    res.json({ ok: true, profile: getMemberProfile(req.params.id) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/** 人设全文 */
app.get('/api/members/:id/persona', (req, res) => {
  try {
    res.json({ ok: true, data: getPersona(req.params.id) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/** 技能清单 */
app.get('/api/members/:id/skills', (req, res) => {
  try {
    res.json({ ok: true, skills: getSkills(req.params.id) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/** 记忆 */
app.get('/api/members/:id/memory', (req, res) => {
  try {
    res.json({ ok: true, data: getMemory(req.params.id) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/** 工作目录文件树 */
app.get('/api/members/:id/files', (req, res) => {
  try {
    res.json({ ok: true, files: getFiles(req.params.id) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

/** 对话历史 */
app.get('/api/members/:id/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 200);
    res.json({ ok: true, messages: await getHistory(req.params.id, limit) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// ============ 成员管理写操作（P2：编辑/删除/模型/索引） ============

/** 可用模型列表 */
app.get('/api/models', (_req, res) => {
  try {
    res.json({ ok: true, models: listModels() });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 编辑人设（写 AGENTS.md，自动备份） */
app.put('/api/members/:id/persona', (req, res) => {
  try {
    const { content } = req.body || {};
    res.json({ ok: true, data: updatePersona(req.params.id, content) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 人设精修向导（增量写入精修设定章节） */
app.post('/api/members/:id/persona/refine', (req, res) => {
  try {
    const { duty, tone, style, boundary } = req.body || {};
    res.json({ ok: true, result: refinePersona(req.params.id, { duty, tone, style, boundary }) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 更新身份（名字/emoji/主题/部门） */
app.put('/api/members/:id/identity', async (req, res) => {
  try {
    const { name, emoji, theme, department } = req.body || {};
    res.json({
      ok: true,
      result: await updateIdentity(req.params.id, { name, emoji, theme, department }),
    });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 重建记忆索引 */
app.post('/api/members/:id/reindex', async (req, res) => {
  try {
    res.json({ ok: true, result: await reindexMemory(req.params.id) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 切换模型 */
app.post('/api/members/:id/model', async (req, res) => {
  try {
    const { modelId } = req.body || {};
    if (!modelId) return res.status(400).json({ ok: false, error: 'modelId 必填' });
    res.json({ ok: true, result: await switchModel(req.params.id, modelId) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 删除员工（离职，自动备份） */
app.delete('/api/members/:id', async (req, res) => {
  try {
    res.json({ ok: true, result: await deleteMember(req.params.id) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ============ 审计日志（P3） ============

/** 全部操作日志（可按 agentId 过滤） */
app.get('/api/audit', (req, res) => {
  try {
    const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    res.json({ ok: true, entries: getAudit(agentId, limit) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** 单个成员的操作日志 */
app.get('/api/members/:id/audit', (req, res) => {
  try {
    const room = rooms.getRoom(req.params.id);
    if (!room) throw new Error('成员不存在');
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    res.json({ ok: true, entries: getAudit(room.agentId, limit) });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// ============ WebSocket ============

createWsServer(server);

// ============ 启动 ============

rooms.initDefaultRooms();
// 初始化 Gateway WS 连接（长连接，断线自动重连）
initGatewayWs();

server.listen(cfg.chatPort, cfg.chatHost, () => {
  console.log(`
╔══════════════════════════════════════════╗
║       🤖 AiCumi Chat Server v0.1       ║
╠══════════════════════════════════════════╣
║  HTTP API:  http://localhost:${cfg.chatPort}      ║
║  WebSocket: ws://localhost:${cfg.chatPort}/ws     ║
║  Gateway:   ${cfg.gatewayHttpUrl.padEnd(26)}║
╚══════════════════════════════════════════╝
  `);
});

// AiCumi 探索脚本：实测 Gateway WebSocket 协议
// 用法: node scripts/probe-gateway-ws.mjs
// 连 gateway → connect 握手 → chat.history → chat.send
import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:18789';
const TOKEN = '2b2f5a07ccf7e378856b3422ea8750c36b164761ce382e50';
const AGENT = 'keling';

const ws = new WebSocket(WS_URL);
let msgId = 0;
const pending = new Map();
const events = [];

function req(method, params) {
  const id = `req_${++msgId}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'event') {
    events.push(msg);
    console.log('[event]', msg.event, JSON.stringify(msg.payload).slice(0, 200));
    return;
  }
  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.payload);
      else p.reject(new Error(`RPC ${p.method} failed: ${JSON.stringify(msg.error || msg)}`));
    }
  }
});

ws.on('open', async () => {
  try {
    console.log('=== 已连接，开始握手 ===');
    // 1. connect 握手
    const hello = await req('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'aicumi-probe', version: '0.1.0', platform: 'web', mode: 'operator' },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      caps: [],
      commands: [],
      permissions: {},
      auth: { token: TOKEN },
      locale: 'zh-CN',
      userAgent: 'aicumi-probe/0.1.0',
    });
    console.log('=== hello-ok ===');
    console.log(JSON.stringify(hello).slice(0, 300));

    // 2. chat.history 查 keling main session
    console.log('\n=== chat.history (keling) ===');
    try {
      const hist = await req('chat.history', { sessionKey: `agent:${AGENT}:main`, limit: 20 });
      console.log(JSON.stringify(hist).slice(0, 800));
    } catch (e) { console.error('chat.history 失败:', e.message); }

    // 3. 试试 sessions.list
    console.log('\n=== sessions.list ===');
    try {
      const sessions = await req('sessions.list', {});
      console.log(JSON.stringify(sessions).slice(0, 500));
    } catch (e) { console.error('sessions.list 失败:', e.message); }

    // 4. chat.send 发一条测试消息
    console.log('\n=== chat.send ===');
    try {
      const send = await req('chat.send', {
        sessionKey: `agent:${AGENT}:main`,
        text: '你好，这是 AiCumi 协议探测消息，只回复 OK',
      });
      console.log(JSON.stringify(send).slice(0, 500));
    } catch (e) { console.error('chat.send 失败:', e.message); }

    console.log('\n=== 探测完成，等待事件... (3秒) ===');
    setTimeout(() => { ws.close(); process.exit(0); }, 3000);
  } catch (e) {
    console.error('握手失败:', e.message);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (e) => console.error('[ws error]', e.message));

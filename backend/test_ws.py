"""
WebSocket protocol integration tests for AiCumi backend.

Run inside the chat-server container (server already running on :8000):
    docker compose exec -T chat-server python test_ws.py

Covers: connect handshake, DM streaming (chat.chunk + chat.done), group
creation, group @ routing, group add-member, history loading.
"""
import asyncio
import json
import sys
import websockets

WS_URL = "ws://localhost:8000/ws"
passed = 0
failed = 0
failures = []


def check(name: str, ok: bool, detail: str = ""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        failures.append((name, detail))
        print(f"  ❌ {name} — {detail}")


async def recv_next(ws, timeout=5):
    try:
        return json.loads(await asyncio.wait_for(ws.recv(), timeout))
    except asyncio.TimeoutError:
        return None


async def recv_until(ws, mtype, timeout=5):
    while True:
        m = await recv_next(ws, timeout)
        if m is None:
            return None
        if m.get("type") == mtype:
            return m


async def drain_chunks(ws, idle=1.0, max_msgs=100):
    """Collect chat.chunk messages until idle; returns {agentId: {mid, n, text}}."""
    got = {}
    for _ in range(max_msgs):
        m = await recv_next(ws, idle)
        if m is None:
            break
        if m.get("type") == "chat.chunk":
            got.setdefault(m["agentId"], {"mid": m["messageId"], "n": 0, "text": ""})
            got[m["agentId"]]["n"] += 1
            got[m["agentId"]]["text"] += m["content"]
    return got


async def test_handshake():
    print("\n# Handshake")
    async with websockets.connect(WS_URL) as ws:
        a = await recv_until(ws, "agent.list")
        check("agent.list on connect", a is not None and len(a.get("agents", [])) >= 3, str(a)[:100])
        r = await recv_until(ws, "room.list")
        check("room.list on connect", r is not None and len(r.get("rooms", [])) >= 3, str(r)[:100])


async def test_dm_streaming():
    print("\n# DM streaming")
    async with websockets.connect(WS_URL) as ws:
        await recv_until(ws, "agent.list"); await recv_until(ws, "room.list")
        await ws.send(json.dumps({"type": "chat.send", "roomId": "keling", "content": "流式测试"}))
        chunks = []
        done = None
        for _ in range(100):
            m = await recv_next(ws, 3)
            if m is None:
                break
            if m["type"] == "chat.chunk":
                chunks.append(m["content"])
            elif m["type"] == "chat.done":
                done = m
                break
        full = "".join(chunks)
        check("chat.chunk received", len(chunks) > 0, f"chunks={len(chunks)}")
        check("chat.done received", done is not None, str(done)[:100])
        check("done fullContent matches chunks", done is not None and done.get("fullContent") == full, f"{full[:30]!r} vs {done.get('fullContent','')[:30]!r}")


async def test_group():
    print("\n# Group")
    async with websockets.connect(WS_URL) as ws:
        await recv_until(ws, "agent.list"); await recv_until(ws, "room.list")
        await ws.send(json.dumps({"type": "group.create", "name": "测试组", "memberAgentIds": ["keling", "xiaoyan"], "ownerAgentId": "keling"}))
        created = await recv_until(ws, "room.created")
        check("group.create → room.created", created is not None, str(created)[:100])
        if not created:
            return
        gid = created["room"]["id"]
        check("group room shape", created["room"].get("type") == "group" and "keling" in created["room"].get("memberAgentIds", []), str(created["room"])[:120])

        # no mention → owner only
        await ws.send(json.dumps({"type": "chat.send", "roomId": gid, "content": "群聊测试"}))
        r1 = await drain_chunks(ws)
        check("no mention → owner(keling) responds", set(r1.keys()) == {"keling"}, f"responders={list(r1.keys())}")

        # mention → only mentioned
        await ws.send(json.dumps({"type": "chat.send", "roomId": gid, "content": "小研来一下", "mentions": ["xiaoyan"]}))
        r2 = await drain_chunks(ws)
        check("mention → only xiaoyan responds", set(r2.keys()) == {"xiaoyan"}, f"responders={list(r2.keys())}")

        # add member
        await ws.send(json.dumps({"type": "group.add-member", "roomId": gid, "agentId": "xiaoma"}))
        rooms = await recv_until(ws, "room.list")
        grp = next((r for r in rooms["rooms"] if r["id"] == gid), None)
        check("add-member updates room", grp is not None and "xiaoma" in grp.get("memberAgentIds", []), str(grp)[:120])


async def test_history():
    print("\n# History")
    async with websockets.connect(WS_URL) as ws:
        await recv_until(ws, "agent.list"); await recv_until(ws, "room.list")
        await ws.send(json.dumps({"type": "chat.history", "roomId": "keling"}))
        h = await recv_until(ws, "chat.history")
        check("chat.history returns list", h is not None and isinstance(h.get("messages"), list), str(h)[:100])


async def main():
    print("🧪 AiCumi WebSocket protocol test suite")
    print("=" * 50)
    await test_handshake()
    await test_dm_streaming()
    await test_group()
    await test_history()
    print("\n" + "=" * 50)
    print(f"📊 Result: {passed} passed, {failed} failed")
    if failures:
        for name, detail in failures:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    print("🎉 All WS tests passed!")


if __name__ == "__main__":
    asyncio.run(main())

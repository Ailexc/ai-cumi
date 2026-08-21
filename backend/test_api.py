"""
AiCumi AG2 Backend — full API test suite.

Run inside the chat-server container (server already running on :8000):
    docker compose exec -T chat-server python test_api.py
"""
import asyncio
import json
import sys
import httpx

BASE_URL = "http://localhost:8000"

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


async def api(method: str, path: str, **kw):
    async with httpx.AsyncClient() as c:
        r = await c.request(method, f"{BASE_URL}{path}", timeout=30, **kw)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text


async def test_health():
    print("\n# Health")
    code, data = await api("GET", "/health")
    check("GET /health", code == 200 and data.get("status") == "healthy", str(data))


async def test_agents():
    print("\n# Agents")
    code, data = await api("GET", "/api/agents")
    check("GET /api/agents", code == 200 and isinstance(data, list) and len(data) >= 3, str(data)[:100])
    code, data = await api("POST", "/api/agents", json={
        "agent_id": "test_agent", "name": "测试Agent", "persona": "测试人设", "role": "tester"})
    check("POST /api/agents", code == 200 and data.get("status") == "created", str(data))
    code, data = await api("DELETE", "/api/agents/test_agent")
    check("DELETE /api/agents/test_agent", code == 200, str(data))


async def test_chat():
    print("\n# Chat")
    code, data = await api("POST", "/api/chat/send", json={
        "content": "你好", "room_id": "keling", "room_type": "dm"})
    check("POST /api/chat/send (dm)", code == 200 and data.get("status") == "sent", str(data)[:100])


async def test_members():
    print("\n# Members")
    code, data = await api("GET", "/api/members")
    check("GET /api/members", code == 200 and data.get("ok") is True and len(data.get("members", [])) >= 3, str(data)[:100])

    code, data = await api("GET", "/api/members/keling")
    check("GET /api/members/keling", code == 200 and data.get("ok") is True and data["profile"]["name"] == "可灵", str(data)[:100])

    code, data = await api("GET", "/api/members/keling/persona")
    check("GET persona", code == 200 and data.get("ok") and data["data"]["content"], str(data)[:100])

    code, data = await api("PUT", "/api/members/keling/persona", json={"content": "你是可灵，测试人设。"})
    check("PUT persona", code == 200 and data.get("ok") is True, str(data))
    # restore-ish (append refine instead of clobber in real use; keep minimal here)
    code, data = await api("GET", "/api/members/keling/persona")
    check("persona persisted", "测试人设" in data["data"]["content"], str(data)[:100])

    code, data = await api("POST", "/api/members/keling/persona/refine", json={
        "duty": "测试职责", "tone": "沉稳可靠", "style": "混合", "boundary": "测试边界"})
    check("POST persona/refine", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("GET", "/api/members/keling/persona")
    check("refine appended", "精修设定" in data["data"]["content"], str(data)[:100])

    code, data = await api("PUT", "/api/members/keling/identity", json={
        "name": "可灵", "emoji": "🦊", "theme": "蓝", "department": "测试部"})
    check("PUT identity", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("GET", "/api/members/keling")
    check("department persisted", data["profile"]["department"] == "测试部", str(data)[:100])

    code, data = await api("GET", "/api/members/keling/memory")
    check("GET memory", code == 200 and data.get("ok") is True, str(data)[:100])
    code, data = await api("POST", "/api/members/keling/reindex")
    check("POST reindex", code == 200 and data.get("ok") is True, str(data))

    code, data = await api("GET", "/api/members/keling/history?limit=10")
    check("GET history", code == 200 and data.get("ok") is True and isinstance(data.get("messages"), list), str(data)[:100])

    code, data = await api("GET", "/api/members/keling/files")
    check("GET files", code == 200 and data.get("ok") is True and isinstance(data.get("files"), list), str(data)[:100])

    code, data = await api("GET", "/api/members/keling/audit?limit=5")
    check("GET audit", code == 200 and data.get("ok") is True and len(data.get("entries", [])) > 0, str(data)[:100])

    # skills
    code, data = await api("POST", "/api/members/keling/skills/web_search/bind")
    check("bind skill", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("GET", "/api/members/keling/skills/bound")
    check("bound list", code == 200 and "web_search" in data.get("skills", []), str(data)[:100])
    code, data = await api("GET", "/api/members/keling/skills")
    check("skills with doc", code == 200 and len(data.get("skills", [])) > 0, str(data)[:100])
    code, data = await api("POST", "/api/members/keling/skills/web_search/unbind")
    check("unbind skill", code == 200 and data.get("ok") is True, str(data))


async def test_skills():
    print("\n# Skills")
    code, data = await api("GET", "/api/skills/catalog")
    check("GET /api/skills/catalog", code == 200 and data.get("ok") and len(data.get("catalog", [])) > 0, str(data)[:100])


async def test_staff():
    print("\n# Staff / roles / templates")
    code, data = await api("GET", "/api/roles")
    check("GET /api/roles", code == 200 and data.get("ok") and len(data.get("roles", [])) > 0, str(data)[:100])
    code, data = await api("GET", "/api/persona-templates")
    check("GET /api/persona-templates", code == 200 and data.get("ok") and len(data.get("templates", [])) > 0, str(data)[:100])
    code, data = await api("POST", "/api/staff/preview", json={"name": "小测", "role": "advisor", "duty": "测试"})
    check("POST /api/staff/preview", code == 200 and data.get("ok") and data.get("persona"), str(data)[:100])
    code, data = await api("POST", "/api/staff", json={"name": "小测", "agentId": "test_staff", "role": "advisor", "duty": "测试"})
    check("POST /api/staff", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("GET", "/api/members")
    check("new staff in members", any(m["agentId"] == "test_staff" for m in data.get("members", [])), str(data)[:100])
    code, data = await api("DELETE", "/api/members/test_staff")
    check("delete staff", code == 200 and data.get("ok") is True, str(data))


async def test_channels():
    print("\n# Channels")
    code, data = await api("GET", "/api/channels")
    check("GET /api/channels", code == 200 and data.get("ok") is True, str(data)[:100])
    code, data = await api("GET", "/api/channels/templates")
    check("GET templates", code == 200 and data.get("ok") and "feishu" in data.get("templates", {}), str(data)[:100])
    code, data = await api("POST", "/api/channels/feishu/accounts", json={"accountId": "test_bot", "name": "测试Bot"})
    check("add account", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("POST", "/api/channels/feishu/toggle", json={"enabled": True})
    check("toggle channel", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("DELETE", "/api/channels/feishu/accounts/test_bot")
    check("remove account", code == 200 and data.get("ok") is True, str(data))
    code, data = await api("POST", "/api/channels/restart")
    check("restart", code == 200, str(data))


async def test_models():
    print("\n# Models")
    code, data = await api("POST", "/api/models", json={
        "provider": "custom", "model_name": "test-model", "api_key": "sk-test", "base_url": "http://127.0.0.1:1/v1"})
    check("POST /api/models", code == 200 and data.get("id"), str(data)[:100])
    mid = data.get("id")
    code, data = await api("GET", "/api/models")
    check("GET /api/models", code == 200 and data.get("ok") and any(m["id"] == mid for m in data.get("models", [])), str(data)[:150])
    code, data = await api("GET", f"/api/models/{mid}")
    check("GET model by id", code == 200 and data.get("id") == mid, str(data)[:100])
    code, data = await api("PUT", f"/api/models/{mid}", json={"description": "updated"})
    check("PUT model", code == 200 and data.get("description") == "updated", str(data)[:100])
    code, data = await api("DELETE", f"/api/models/{mid}")
    check("DELETE model", code == 200, str(data))


async def test_rooms():
    print("\n# Rooms")
    code, data = await api("GET", "/api/rooms")
    check("GET /api/rooms", code == 200 and isinstance(data.get("rooms"), list), str(data)[:100])


async def main():
    print("🧪 AiCumi Backend API test suite")
    print("=" * 50)
    await test_health()
    await test_agents()
    await test_chat()
    await test_members()
    await test_skills()
    await test_staff()
    await test_channels()
    await test_models()
    await test_rooms()
    print("\n" + "=" * 50)
    print(f"📊 Result: {passed} passed, {failed} failed")
    if failures:
        print("Failures:")
        for name, detail in failures:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    print("🎉 All tests passed!")


if __name__ == "__main__":
    asyncio.run(main())

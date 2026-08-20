"""
Test script for AiCumi AG2 Backend API.
"""

import asyncio
import httpx
import json


BASE_URL = "http://localhost:8000"


async def test_health_check():
    """Test health check endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        print(f"Health check: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_list_agents():
    """Test list agents endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/agents")
        print(f"List agents: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_create_agent():
    """Test create agent endpoint."""
    agent_data = {
        "agent_id": "test_agent",
        "name": "测试Agent",
        "persona": "你是一个测试Agent，用于验证API功能。",
        "role": "tester",
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/agents",
            json=agent_data,
        )
        print(f"Create agent: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_send_message():
    """Test send message endpoint."""
    message_data = {
        "content": "你好，请介绍一下你自己。",
        "room_id": "keling",
        "room_type": "dm",
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/chat/send",
            json=message_data,
        )
        print(f"Send message: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_list_rooms():
    """Test list rooms endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/rooms")
        print(f"List rooms: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_list_members():
    """Test list members endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/members")
        print(f"List members: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_list_skills():
    """Test list skills endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/skills")
        print(f"List skills: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def run_all_tests():
    """Run all tests."""
    print("🧪 Starting API tests...")
    print("=" * 50)
    
    tests = [
        ("Health Check", test_health_check),
        ("List Agents", test_list_agents),
        ("Create Agent", test_create_agent),
        ("Send Message", test_send_message),
        ("List Rooms", test_list_rooms),
        ("List Members", test_list_members),
        ("List Skills", test_list_skills),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔍 Testing: {test_name}")
        print("-" * 30)
        try:
            result = await test_func()
            results.append((test_name, result))
            print(f"✅ {test_name}: {'PASS' if result else 'FAIL'}")
        except Exception as e:
            print(f"❌ {test_name}: ERROR - {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 Test Results:")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n🎯 Summary: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed!")
    else:
        print("⚠️ Some tests failed. Check the server logs for details.")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
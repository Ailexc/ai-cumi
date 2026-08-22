"""
Distributed Agent Manager — AG2 gRPC Worker Runtime integration.

Implements a manager that runs a GrpcWorkerAgentRuntimeHost (the coordinator)
and a pool of GrpcWorkerAgentRuntime workers, registers team agents onto the
workers, and exposes remote invocation with:

- distribution: agents spread across workers (round-robin)
- load balancing: optional replica alias types (``<id>__r1``) on a second worker,
  with round-robin dispatch across replicas
- health checks: per-worker probe agent pinged on a background loop
- failure recovery: dead workers' agents are re-registered on healthy workers and
  dispatch automatically retries on the new location

The whole runtime is self-hosted in-process (the standard AG2 demo deployment
for a single machine), which makes it fully testable/demonstrable while still
using the real gRPC distributed protocol under the hood.
"""

import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from autogen_core import AgentId, BaseAgent, MessageContext
from autogen_core._serialization import try_get_known_serializers_for_type
from autogen_ext.runtimes.grpc import GrpcWorkerAgentRuntime, GrpcWorkerAgentRuntimeHost
from autogen_agentchat.messages import TextMessage

# ---------------------------------------------------------------------------
# Small mock agent used when no real model client is available (mock mode).
# ---------------------------------------------------------------------------


class MockDistributedAgent(BaseAgent):
    """A lightweight agent that returns a canned reply (no model client needed)."""

    def __init__(self, name: str, agent_id: str):
        super().__init__(name)
        self._agent_id = agent_id

    async def on_message_impl(self, msg: TextMessage, ctx: MessageContext) -> TextMessage:
        content = getattr(msg, "content", "") or ""
        return TextMessage(
            content=f"[分布式 Worker] 已收到『{content}』（{self._agent_id} 的模拟回复）",
            source=self.id.key,
        )


class DistributedProxyAgent(BaseAgent):
    """A worker-side agent that executes by delegating to the shared agent manager.

    This is the "worker executor" pattern: the distributed runtime (host +
    workers + routing + health + failover) is 100% real gRPC, and each worker
    hosts a proxy agent that calls the shared model-backed agent manager to
    produce the reply. The proxy carries the agent's identity so the topology
    is accurate; execution reuses the proven in-process agent path.
    """

    def __init__(self, name: str, agent_id: str, executor: Callable[[str, str], Any]):
        super().__init__(name)
        self._agent_id = agent_id
        self._executor = executor  # async callable (agent_id, message) -> reply str

    async def on_message_impl(self, msg: TextMessage, ctx: MessageContext) -> TextMessage:
        content = getattr(msg, "content", "") or ""
        reply = await self._executor(self._agent_id, content)
        return TextMessage(content=str(reply), source=self.id.key)


# ---------------------------------------------------------------------------
# Worker wrapper
# ---------------------------------------------------------------------------


class DistributedWorker:
    """A single gRPC worker runtime hosting a subset of team agents."""

    def __init__(self, worker_id: str, host_port: int):
        self.id = worker_id
        self.host_port = host_port
        self.runtime: Optional[GrpcWorkerAgentRuntime] = None
        self.status = "starting"  # starting | healthy | down
        self.agents: List[str] = []  # route types hosted by this worker
        self.dispatch_count = 0
        self.error_count = 0
        self.last_heartbeat: Optional[str] = None
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.stopped_at: Optional[str] = None

    async def start(self, health_type: str, agent_types: List[str], factory_map: Dict[str, Callable[[], BaseAgent]],
                    register_fn: Optional[Callable] = None):
        """Connect this worker to the host and register its agents.

        The host's gRPC server only *starts listening* a moment after
        ``GrpcWorkerAgentRuntimeHost.start()`` returns, so connection attempts
        are retried with a fresh runtime instance until the host is ready.

        ``register_fn(runtime, route_type, factory)`` is how each agent class is
        registered — AgentChat agents (AssistantAgent) need ``cls.register`` to
        set up the direct-message subscriptions, plain BaseAgents work with the
        low-level ``register_factory``.
        """
        register = register_fn or (lambda rt, t, f: rt.register_factory(t, f))

        last_err: Optional[Exception] = None
        for attempt in range(1, 16):
            runtime = GrpcWorkerAgentRuntime(f"127.0.0.1:{self.host_port}")
            try:
                await runtime.start()
                last_err = None
                break
            except Exception as e:
                last_err = e
                try:
                    await runtime.stop()
                except Exception:
                    pass
                await asyncio.sleep(0.5)
        if last_err is not None:
            raise RuntimeError(f"worker {self.id} could not connect to host: {last_err}")

        for s in try_get_known_serializers_for_type(TextMessage):
            runtime.add_message_serializer(s)

        # Health probe agent (unique type per worker — the host forbids duplicate types).
        await register(
            runtime,
            health_type,
            lambda: MockDistributedAgent(health_type, "health"),
        )

        # Team agents
        for t in agent_types:
            factory = factory_map.get(t)
            if factory is None:
                continue
            await register(runtime, t, factory)
            self.agents.append(t)

        self.runtime = runtime
        self.status = "healthy"
        self.last_heartbeat = datetime.now(timezone.utc).isoformat()
        return self

    async def stop(self):
        """Stop the worker (simulates a crash / graceful shutdown)."""
        self.status = "down"
        self.stopped_at = datetime.now(timezone.utc).isoformat()
        if self.runtime:
            try:
                await self.runtime.stop()
            except Exception as e:
                print(f"⚠️ worker {self.id} stop error: {e}")
            self.runtime = None
        print(f"💀 Worker {self.id} is DOWN (agents: {self.agents})")

    async def send_message(self, route_type: str, message: str) -> str:
        """Invoke an agent hosted on this worker over gRPC and return the reply."""
        if self.runtime is None or self.status != "healthy":
            raise RuntimeError(f"Worker {self.id} is not healthy")
        resp = await self.runtime.send_message(
            TextMessage(content=message, source="ai-cumi"),
            AgentId(route_type, "default"),
            sender=AgentId("ai-cumi-client", "default"),
        )
        content = getattr(resp, "content", None)
        if content is None:
            content = str(resp)
        self.dispatch_count += 1
        self.last_heartbeat = datetime.now(timezone.utc).isoformat()
        return str(content)

    async def ping(self) -> bool:
        """Health probe: invoke this worker's own probe agent."""
        if self.runtime is None or self.status != "healthy":
            return False
        health_type = f"health__{self.id}"
        try:
            await asyncio.wait_for(
                self.runtime.send_message(
                    TextMessage(content="ping", source="ai-cumi"),
                    AgentId(health_type, "default"),
                    sender=AgentId("health-check", "default"),
                ),
                timeout=5,
            )
            self.last_heartbeat = datetime.now(timezone.utc).isoformat()
            return True
        except Exception:
            return False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "agents": list(self.agents),
            "dispatch_count": self.dispatch_count,
            "error_count": self.error_count,
            "last_heartbeat": self.last_heartbeat,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
        }


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------


class DistributedAgentManager:
    """Coordinates the host, the worker pool and agent distribution/LB/failover."""

    def __init__(
        self,
        host_port: int = 50051,
        worker_count: int = 2,
        replicate_agents: Optional[List[str]] = None,
        health_interval: float = 10.0,
    ):
        self.host_port = int(os.getenv("DISTRIBUTED_PORT", str(host_port)))
        self.worker_count = int(os.getenv("DISTRIBUTED_WORKERS", str(worker_count)))
        self.replicate_agents = set(replicate_agents or [])
        self.health_interval = float(os.getenv("DISTRIBUTED_HEALTH_INTERVAL", str(health_interval)))

        self.enabled = False
        self._host: Optional[GrpcWorkerAgentRuntimeHost] = None
        self._workers: List[DistributedWorker] = []
        self._factory_builder: Optional[Callable[[str, str], Optional[BaseAgent]]] = None
        self._register_class_fn: Optional[Callable[[str], Optional[type]]] = None
        self._agent_entries: Dict[str, List[Dict[str, Any]]] = {}  # agent_id -> [{worker, route}]
        self._rr_index: Dict[str, int] = {}
        self._health_task: Optional[asyncio.Task] = None
        self._stats = {"total_dispatches": 0, "failovers": 0, "lb_round_robins": 0}
        self.started_at: Optional[str] = None

    # ---- factory injection ----

    def set_agent_factory(self, factory_builder: Callable[[str, str], Optional[BaseAgent]]):
        """Set a builder that produces an agent instance for (route_type, worker_id).

        main.py provides this so workers create REAL AssistantAgents with the
        shared model client (or a mock fallback when no model is available).
        The manager wraps it into a zero-arg factory for ``register_factory``.
        """
        self._factory_builder = factory_builder

    def _make_factory(self, route_type: str, worker_id: str) -> Callable[[], BaseAgent]:
        """Wrap the injected builder into a zero-arg factory for register_factory.

        NOTE: AG2 validates that the agent produced by the factory carries the
        same *type* as the registered route, so the instance must be named after
        ``route_type`` (replica routes are alias types like ``keling__r1``).
        """
        builder = self._factory_builder

        def factory():
            instance = builder(route_type, worker_id)
            if instance is None:
                return MockDistributedAgent(route_type, route_type.split("__")[0])
            return instance

        return factory

    def set_register_class_fn(self, register_class_fn: Callable[[str], Optional[type]]):
        """(Reserved) Set a function that returns the agent class to register.

        Kept for future AG2 versions where AgentChat agents can be registered
        via ``cls.register``; this AG2 version only supports plain ``BaseAgent``
        factories on the gRPC worker runtime.
        """
        self._register_class_fn = register_class_fn

    def _register_route(self, runtime, route_type: str, factory: Callable[[], BaseAgent]):
        """Register a route. Workers host BaseAgent proxies, so the low-level
        ``register_factory`` (with class subscription handled by the runtime)
        is sufficient in this AG2 version."""
        cls = self._register_class_fn(route_type) if self._register_class_fn else None
        if cls is not None:
            return cls.register(runtime, route_type, factory)
        return runtime.register_factory(route_type, factory)

    # ---- lifecycle ----

    async def start(self, agent_ids: List[str]):
        """Start host + workers and register the given agents."""
        if not agent_ids:
            print("⚠️ Distributed: no agents to register")
            return False
        try:
            # Bind the host on all interfaces; workers connect via loopback.
            self._host = GrpcWorkerAgentRuntimeHost(f"0.0.0.0:{self.host_port}")
            self._host.start()
            print(f"🌐 Distributed host starting on :{self.host_port}")
            await self._wait_for_host()

            await self._sync_workers(agent_ids)
            self.enabled = True
            self.started_at = datetime.now(timezone.utc).isoformat()
            self._health_task = asyncio.create_task(self._health_loop())
            print(f"✅ Distributed runtime ready: {len(self._workers)} workers, "
                  f"{len(self._agent_entries)} agent types")
            return True
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"⚠️ Distributed runtime failed to start: {e}")
            await self._shutdown_runtimes()
            return False

    async def _wait_for_host(self, timeout: float = 10.0):
        """Wait until the gRPC host is actually accepting connections.

        `GrpcWorkerAgentRuntimeHost.start()` only *schedules* the serve task, so
        workers connecting immediately race ahead of the listener. Poll the port
        until it accepts a TCP connection.
        """
        import socket
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                await asyncio.wait_for(
                    asyncio.open_connection("127.0.0.1", self.host_port),
                    timeout=1,
                )
                return
            except Exception:
                await asyncio.sleep(0.2)
        raise RuntimeError(f"gRPC host did not become ready on :{self.host_port}")

    async def stop(self):
        """Stop health loop, workers and host."""
        if self._health_task:
            self._health_task.cancel()
            self._health_task = None
        await self._shutdown_runtimes()
        self.enabled = False

    async def _stop_workers(self):
        """Stop only the worker runtimes (keeps the host alive)."""
        for w in list(self._workers):
            await w.stop()
        self._workers.clear()
        self._agent_entries = {}

    async def _shutdown_runtimes(self):
        """Stop workers AND the host (full teardown)."""
        await self._stop_workers()
        if self._host:
            try:
                await self._host.stop()
            except Exception as e:
                print(f"⚠️ host stop error: {e}")
            self._host = None

    # ---- worker pool ----

    async def _spawn_worker(self, worker_id: str, agent_types: List[str]) -> DistributedWorker:
        factory_map = {
            t: self._make_factory(t, worker_id) for t in agent_types
        }
        worker = DistributedWorker(worker_id, self.host_port)
        await worker.start(
            health_type=f"health__{worker_id}",
            agent_types=agent_types,
            factory_map=factory_map,
            register_fn=self._register_route,
        )
        self._workers.append(worker)
        return worker

    def _build_route_plan(self, agent_ids: List[str]):
        """Compute the distribution + replication plan.

        Returns:
            (agent_routes, worker_routes)
              agent_routes: Dict[agent_id, List[route_type]]  (primary + replicas)
              worker_routes: Dict[worker_id, List[route_type]]
        """
        agent_routes: Dict[str, List[str]] = {}
        primary_worker: Dict[str, str] = {}
        for idx, aid in enumerate(agent_ids):
            wid = f"worker-{(idx % self.worker_count) + 1}"
            agent_routes.setdefault(aid, []).append(aid)  # primary route = agent id
            primary_worker[aid] = wid
        # Replica routes (load balancing) on a different worker
        for aid in agent_ids:
            if aid not in self.replicate_agents:
                continue
            primary_wid = primary_worker[aid]
            other_wid = f"worker-{(int(primary_wid.rsplit('-', 1)[1]) % self.worker_count) + 1}"
            agent_routes.setdefault(aid, []).append(f"{aid}__r1")
            primary_worker[f"{aid}__r1"] = other_wid
        worker_routes: Dict[str, List[str]] = {}
        for aid, routes in agent_routes.items():
            for r in routes:
                wid = primary_worker[aid]
                worker_routes.setdefault(wid, []).append(r)
        return agent_routes, worker_routes

    async def _sync_workers(self, agent_ids: List[str]):
        """(Re)build the worker pool and register all agents per the route plan.

        Stops only the existing workers (the host must stay alive — it is
        started separately and reused across rebuilds).
        """
        await self._stop_workers()
        self._workers = []

        agent_routes, worker_routes = self._build_route_plan(agent_ids)
        # ensure every worker slot exists (even if it hosts nothing)
        for n in range(1, self.worker_count + 1):
            wid = f"worker-{n}"
            routes = worker_routes.get(wid, [])
            await self._spawn_worker(wid, routes)

        # build agent -> entries index (for dispatch + load balancing)
        self._agent_entries = {}
        for aid, routes in agent_routes.items():
            for r in routes:
                wid = None
                for w in self._workers:
                    if r in w.agents:
                        wid = w.id
                        break
                if wid:
                    self._agent_entries.setdefault(aid, []).append({"worker": wid, "route": r})

        # reset rr pointers
        self._rr_index = {aid: 0 for aid in agent_ids}

    # ---- invocation with LB + failover ----

    def _healthy_worker(self, worker_id: str) -> Optional[DistributedWorker]:
        for w in self._workers:
            if w.id == worker_id and w.status == "healthy":
                return w
        return None

    async def send_message(self, agent_id: str, message: str) -> str:
        """Dispatch a message to an agent through the distributed runtime.

        Round-robins across the agent's routes (replicas = load balancing);
        retries on another route/worker on failure; triggers failover when every
        route is exhausted.
        """
        if not self.enabled:
            raise RuntimeError("Distributed runtime is not enabled")
        entries = self._agent_entries.get(agent_id, [])
        if not entries:
            raise ValueError(f"Agent '{agent_id}' is not registered on any worker")

        start = time.time()
        errors: List[str] = []
        n = len(entries)
        idx = self._rr_index.get(agent_id, 0)
        for attempt in range(n + 1):
            entry = entries[(idx + attempt) % n]
            worker = self._healthy_worker(entry["worker"])
            if worker is None:
                errors.append(f"worker {entry['worker']} down")
                continue
            try:
                reply = await worker.send_message(entry["route"], message)
                self._rr_index[agent_id] = (idx + attempt + 1) % n
                self._stats["total_dispatches"] += 1
                if n > 1:
                    self._stats["lb_round_robins"] += 1
                return reply
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                errors.append(f"{entry['worker']}:{type(e).__name__}:{e}\n{tb}")
                print(f"⚠️ distributed dispatch error on {entry['worker']}/{entry['route']}:\n{tb}")
                worker.error_count += 1

        # All routes failed → failover
        self._stats["failovers"] += 1
        await self._failover_agent(agent_id)
        # Retry once on the new location
        entries = self._agent_entries.get(agent_id, [])
        for entry in entries:
            worker = self._healthy_worker(entry["worker"])
            if worker is None:
                continue
            try:
                reply = await worker.send_message(entry["route"], message)
                self._stats["total_dispatches"] += 1
                return reply
            except Exception as e:
                errors.append(f"{entry['worker']}:{type(e).__name__}")
        raise RuntimeError(f"Distributed dispatch failed for {agent_id}: {'; '.join(errors)} "
                           f"({(time.time() - start) * 1000:.0f}ms)")

    async def _failover_agent(self, agent_id: str):
        """Re-register an agent's routes on healthy workers (drop dead ones)."""
        target = self._agent_entries.get(agent_id, [])
        # figure out current worker ids
        dead_workers = {w.id for w in self._workers if w.status != "healthy"}
        healthy_workers = [w for w in self._workers if w.status == "healthy"]
        if not healthy_workers:
            print(f"⚠️ No healthy workers for failover of {agent_id}")
            return

        new_entries: List[Dict[str, Any]] = []
        # Preserve routes hosted on healthy workers
        for entry in target:
            if entry["worker"] in dead_workers:
                continue
            new_entries.append(entry)
        # Re-register the primary route on a healthy worker if it was lost
        primary_route = agent_id
        if not any(e["route"] == primary_route and e["worker"] not in dead_workers for e in target):
            worker = healthy_workers[len(self._workers) % len(healthy_workers)]
            try:
                factory = self._make_factory(primary_route, worker.id)
                await self._register_route(worker.runtime, primary_route, factory)
                worker.agents.append(primary_route)
                new_entries.append({"worker": worker.id, "route": primary_route})
                print(f"🔁 Failover: {agent_id} re-registered on {worker.id}")
            except Exception as e:
                print(f"⚠️ Failover register {agent_id} on {worker.id} failed: {e}")

        if new_entries:
            self._agent_entries[agent_id] = new_entries
            self._rr_index[agent_id] = 0

    # ---- health loop ----

    async def _health_loop(self):
        while True:
            await asyncio.sleep(self.health_interval)
            try:
                await self.health_check()
            except Exception as e:
                print(f"⚠️ distributed health loop error: {e}")

    async def health_check(self):
        """Ping every worker; for dead workers, fail over their agents."""
        dead = []
        for w in self._workers:
            ok = await w.ping()
            if not ok:
                dead.append(w)
        for w in dead:
            print(f"💥 Health check: worker {w.id} unreachable")
            w.status = "down"
            # fail over every agent this worker hosted
            affected = [aid for aid, entries in self._agent_entries.items()
                        if any(e["worker"] == w.id for e in entries)]
            for aid in affected:
                await self._failover_agent(aid)

    # ---- control (simulation) ----

    async def mark_worker_down(self, worker_id: str) -> bool:
        """Simulate a worker crash: stop it and fail over its agents."""
        for w in self._workers:
            if w.id == worker_id:
                await w.stop()
                affected = [aid for aid, entries in self._agent_entries.items()
                            if any(e["worker"] == worker_id for e in entries)]
                for aid in affected:
                    await self._failover_agent(aid)
                return True
        return False

    async def recover_worker(self, worker_id: str) -> bool:
        """Restart a stopped worker and re-register agents assigned to it."""
        for i, w in enumerate(self._workers):
            if w.id != worker_id:
                continue
            if w.status == "healthy":
                return True
            # recompute what this worker should host from the route plan
            routes: List[str] = []
            for aid, entries in self._agent_entries.items():
                for e in entries:
                    if e["worker"] == worker_id:
                        routes.append(e["route"])
            worker = DistributedWorker(worker_id, self.host_port)
            try:
                await worker.start(
                    health_type=f"health__{worker_id}",
                    agent_types=routes,
                    factory_map={t: self._make_factory(t, worker_id) for t in routes},
                    register_fn=self._register_route,
                )
            except Exception as e:
                print(f"⚠️ recover worker {worker_id} failed: {e}")
                return False
            self._workers[i] = worker
            print(f"🔄 Worker {worker_id} recovered with agents {routes}")
            return True
        return False

    async def rebuild(self, agent_ids: List[str]):
        """Full resync: rebuild worker pool + re-register all agents."""
        await self._sync_workers(agent_ids)
        self._stats["failovers"] = 0
        return True

    # ---- status ----

    def get_status(self) -> Dict[str, Any]:
        agent_locations = {}
        for aid, entries in self._agent_entries.items():
            agent_locations[aid] = [
                {"worker": e["worker"], "route": e["route"]} for e in entries
            ]
        return {
            "enabled": self.enabled,
            "host": f"localhost:{self.host_port}",
            "worker_count": self.worker_count,
            "started_at": self.started_at,
            "stats": dict(self._stats),
            "workers": [w.to_dict() for w in self._workers],
            "agents": agent_locations,
        }

    def is_agent_registered(self, agent_id: str) -> bool:
        return agent_id in self._agent_entries

"""
AiCumi Distributed Agent Runtime (P2)

Distributed agent execution on top of AG2's GrpcWorkerAgentRuntime.

Topology (single-process demo deployment of the distributed model):

    ┌──────────────────────────── GrpcWorkerAgentRuntimeHost ────────────────────────────┐
    │  coordinator :50051  (routes messages to the worker that hosts each agent type)    │
    └───────▲──────────────────────────▲──────────────────────────▲─────────────────────┘
            │                          │                          │
      ┌─────┴─────┐             ┌──────┴──────┐            ┌──────┴──────┐
      │ worker-1  │             │  worker-2   │            │  worker-N   │
      │ keling    │             │  xiaoyan    │            │  xiaoma     │
      │ (replica) │             │  keling__r1 │            │  ...        │
      └───────────┘             └─────────────┘            └─────────────┘

Capabilities:
- **Worker runtime**: each worker is a real AG2 GrpcWorkerAgentRuntime connected to
  the host; agents are registered remotely via gRPC and invoked remotely.
- **Agent distribution**: agents are spread across workers (round-robin).
- **Load balancing**: an agent can be replicated under an alias type (``<id>__r1``)
  on a second worker; requests are round-robin'd across replicas.
- **Health checks**: each worker hosts a ``health__<worker>`` probe agent; the
  manager pings it periodically.
- **Failure recovery**: if a worker is down, its agents are re-registered on a
  healthy worker and requests automatically fail over there.
"""

from .manager import (
    DistributedAgentManager,
    DistributedWorker,
    MockDistributedAgent,
    DistributedProxyAgent,
)

__all__ = [
    "DistributedAgentManager",
    "DistributedWorker",
    "MockDistributedAgent",
    "DistributedProxyAgent",
]

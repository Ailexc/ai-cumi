"""
Agent Execution Tracing System for AiCumi

Provides observability into agent execution, tool calls, and model interactions.
"""

import uuid
import time
import json
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime
from dataclasses import dataclass, field, asdict
from enum import Enum
from contextlib import asynccontextmanager


class TraceEventType(str, Enum):
    """Types of trace events."""
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    MODEL_CALL = "model_call"
    MODEL_RESPONSE = "model_response"
    MEMORY_QUERY = "memory_query"
    MEMORY_ADD = "memory_add"
    APPROVAL_REQUEST = "approval_request"
    APPROVAL_RESOLVED = "approval_resolved"
    ERROR = "error"
    CUSTOM = "custom"


@dataclass
class TraceEvent:
    """A single trace event."""
    id: str
    trace_id: str
    event_type: TraceEventType
    agent_id: str
    timestamp: str
    data: Dict[str, Any] = field(default_factory=dict)
    parent_id: Optional[str] = None
    duration_ms: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "event_type": self.event_type.value,
            "agent_id": self.agent_id,
            "timestamp": self.timestamp,
            "data": self.data,
            "parent_id": self.parent_id,
            "duration_ms": self.duration_ms,
        }


@dataclass
class Trace:
    """A complete trace of an agent interaction."""
    id: str
    agent_id: str
    started_at: str
    ended_at: Optional[str] = None
    events: List[TraceEvent] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "event_count": len(self.events),
            "events": [e.to_dict() for e in self.events],
            "metadata": self.metadata,
            "duration_ms": self._calculate_duration(),
        }
    
    def _calculate_duration(self) -> Optional[float]:
        if not self.ended_at:
            return None
        start = datetime.fromisoformat(self.started_at)
        end = datetime.fromisoformat(self.ended_at)
        return (end - start).total_seconds() * 1000


class TracingSystem:
    """Manages execution traces for agents."""
    
    def __init__(self, max_traces: int = 100, max_events_per_trace: int = 1000):
        self._traces: Dict[str, Trace] = {}
        self._completed_traces: List[Trace] = []
        self._max_traces = max_traces
        self._max_events_per_trace = max_events_per_trace
        self._ws_notifier: Optional[Callable] = None
    
    def set_ws_notifier(self, notifier: Callable):
        """Set WebSocket notifier for real-time updates."""
        self._ws_notifier = notifier
    
    def start_trace(self, agent_id: str, metadata: Optional[Dict[str, Any]] = None) -> Trace:
        """Start a new trace."""
        trace = Trace(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            started_at=datetime.now().isoformat(),
            metadata=metadata or {},
        )
        self._traces[trace.id] = trace
        return trace
    
    def end_trace(self, trace_id: str) -> Optional[Trace]:
        """End a trace."""
        trace = self._traces.pop(trace_id, None)
        if trace:
            trace.ended_at = datetime.now().isoformat()
            self._completed_traces.append(trace)
            
            # Trim history
            if len(self._completed_traces) > self._max_traces:
                self._completed_traces = self._completed_traces[-self._max_traces:]
        
        return trace
    
    async def add_event(
        self,
        trace_id: str,
        event_type: TraceEventType,
        agent_id: str,
        data: Optional[Dict[str, Any]] = None,
        parent_id: Optional[str] = None,
        duration_ms: Optional[float] = None,
    ) -> Optional[TraceEvent]:
        """Add an event to a trace."""
        trace = self._traces.get(trace_id)
        if not trace:
            return None
        
        event = TraceEvent(
            id=str(uuid.uuid4()),
            trace_id=trace_id,
            event_type=event_type,
            agent_id=agent_id,
            timestamp=datetime.now().isoformat(),
            data=data or {},
            parent_id=parent_id,
            duration_ms=duration_ms,
        )
        
        trace.events.append(event)
        
        # Trim events
        if len(trace.events) > self._max_events_per_trace:
            trace.events = trace.events[-self._max_events_per_trace:]
        
        # Notify via WebSocket
        if self._ws_notifier:
            await self._ws_notifier({
                "type": "trace.event",
                "trace_id": trace_id,
                "event": event.to_dict(),
            })
        
        return event
    
    @asynccontextmanager
    async def trace_tool_call(self, trace_id: str, agent_id: str, tool_name: str, params: Dict[str, Any]):
        """Context manager for tracing a tool call."""
        start_time = time.time()
        event = await self.add_event(
            trace_id=trace_id,
            event_type=TraceEventType.TOOL_CALL,
            agent_id=agent_id,
            data={"tool": tool_name, "params": params},
        )
        
        try:
            yield event
        except Exception as e:
            await self.add_event(
                trace_id=trace_id,
                event_type=TraceEventType.ERROR,
                agent_id=agent_id,
                data={"error": str(e), "tool": tool_name},
                parent_id=event.id if event else None,
            )
            raise
        finally:
            duration = (time.time() - start_time) * 1000
            if event:
                event.duration_ms = duration
    
    def get_trace(self, trace_id: str) -> Optional[Trace]:
        """Get a trace by ID."""
        return self._traces.get(trace_id) or next(
            (t for t in self._completed_traces if t.id == trace_id), None
        )
    
    def get_traces(
        self,
        agent_id: Optional[str] = None,
        limit: int = 50,
        include_active: bool = True,
    ) -> List[Trace]:
        """Get traces, optionally filtered by agent."""
        traces = []
        
        if include_active:
            traces.extend(self._traces.values())
        
        traces.extend(self._completed_traces)
        
        if agent_id:
            traces = [t for t in traces if t.agent_id == agent_id]
        
        return sorted(traces, key=lambda t: t.started_at, reverse=True)[:limit]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get tracing statistics."""
        return {
            "active_traces": len(self._traces),
            "completed_traces": len(self._completed_traces),
            "total_events": sum(len(t.events) for t in self._traces.values()) +
                           sum(len(t.events) for t in self._completed_traces),
        }


# Global tracing system instance
tracing_system = TracingSystem()

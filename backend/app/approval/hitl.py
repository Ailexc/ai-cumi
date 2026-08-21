"""
Human-in-the-Loop System for AiCumi

Enables agents to request human approval before executing sensitive operations.
"""

import uuid
import asyncio
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass, field, asdict
from enum import Enum


class ApprovalStatus(str, Enum):
    """Approval request status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass
class ApprovalRequest:
    """A request for human approval."""
    id: str
    agent_id: str
    action: str  # "tool_call", "send_message", "file_operation", etc.
    description: str  # Human-readable description of what will happen
    params: Dict[str, Any] = field(default_factory=dict)
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: str = ""
    resolved_at: Optional[str] = None
    response: Optional[str] = None  # Human's response message
    auto_approve_after: Optional[int] = None  # Seconds before auto-approve
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "action": self.action,
            "description": self.description,
            "params": self.params,
            "status": self.status.value,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
            "response": self.response,
            "auto_approve_after": self.auto_approve_after,
        }


class HumanApprovalManager:
    """Manages human-in-the-loop approval requests."""
    
    def __init__(self):
        self._pending_requests: Dict[str, ApprovalRequest] = {}
        self._history: List[ApprovalRequest] = []
        self._waiters: Dict[str, asyncio.Future] = {}
        self._ws_notifier: Optional[Callable] = None
        self._max_history = 1000
    
    def set_ws_notifier(self, notifier: Callable):
        """Set WebSocket notifier for real-time updates."""
        self._ws_notifier = notifier
    
    async def request_approval(
        self,
        agent_id: str,
        action: str,
        description: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: int = 60,
        auto_approve: bool = False,
    ) -> ApprovalRequest:
        """Request human approval for an action."""
        request = ApprovalRequest(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            action=action,
            description=description,
            params=params or {},
            created_at=datetime.now().isoformat(),
            auto_approve_after=timeout if auto_approve else None,
        )
        
        self._pending_requests[request.id] = request
        
        # Notify frontend via WebSocket
        if self._ws_notifier:
            await self._ws_notifier({
                "type": "approval.request",
                "request": request.to_dict(),
            })
        
        # If auto_approve, set up timeout
        if auto_approve:
            asyncio.create_task(self._auto_approve_after(request.id, timeout))
        
        return request
    
    async def _auto_approve_after(self, request_id: str, seconds: int):
        """Auto-approve a request after timeout."""
        await asyncio.sleep(seconds)
        
        request = self._pending_requests.get(request_id)
        if request and request.status == ApprovalStatus.PENDING:
            await self.resolve_request(
                request_id=request_id,
                status=ApprovalStatus.APPROVED,
                response=f"Auto-approved after {seconds}s timeout",
            )
    
    async def resolve_request(
        self,
        request_id: str,
        status: ApprovalStatus,
        response: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """Resolve an approval request."""
        request = self._pending_requests.pop(request_id, None)
        if not request:
            return None
        
        request.status = status
        request.resolved_at = datetime.now().isoformat()
        request.response = response
        
        # Add to history
        self._history.append(request)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]
        
        # Resolve waiter if exists
        waiter = self._waiters.pop(request_id, None)
        if waiter and not waiter.done():
            waiter.set_result(request)
        
        # Notify frontend
        if self._ws_notifier:
            await self._ws_notifier({
                "type": "approval.resolved",
                "request": request.to_dict(),
            })
        
        return request
    
    async def wait_for_approval(
        self,
        request_id: str,
        timeout: int = 60,
    ) -> ApprovalRequest:
        """Wait for an approval request to be resolved."""
        # Check if already resolved
        if request_id not in self._pending_requests:
            # Check history
            for req in self._history:
                if req.id == request_id:
                    return req
            raise ValueError(f"Request {request_id} not found")
        
        # Create waiter
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._waiters[request_id] = future
        
        try:
            # Wait with timeout
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            # Auto-approve on timeout
            return await self.resolve_request(
                request_id=request_id,
                status=ApprovalStatus.TIMEOUT,
                response=f"Timed out after {timeout}s",
            )
    
    def get_pending_requests(self, agent_id: Optional[str] = None) -> List[ApprovalRequest]:
        """Get all pending approval requests."""
        requests = list(self._pending_requests.values())
        if agent_id:
            requests = [r for r in requests if r.agent_id == agent_id]
        return sorted(requests, key=lambda r: r.created_at, reverse=True)
    
    def get_history(
        self,
        agent_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[ApprovalRequest]:
        """Get approval history."""
        history = self._history
        if agent_id:
            history = [r for r in history if r.agent_id == agent_id]
        return sorted(history, key=lambda r: r.created_at, reverse=True)[:limit]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get approval statistics."""
        return {
            "pending_count": len(self._pending_requests),
            "history_count": len(self._history),
            "pending_requests": [r.to_dict() for r in self._pending_requests.values()],
        }


# Global approval manager instance
approval_manager = HumanApprovalManager()


# ---- Approval-aware tool wrapper ----

class ApprovalRequiredTool:
    """Wrapper that requires human approval before executing a tool."""
    
    def __init__(
        self,
        tool_name: str,
        tool_func: Callable,
        description: str = "",
        auto_approve: bool = False,
        timeout: int = 60,
    ):
        self.tool_name = tool_name
        self.tool_func = tool_func
        self.description = description or f"Execute {tool_name}"
        self.auto_approve = auto_approve
        self.timeout = timeout
    
    async def execute(self, agent_id: str, **kwargs) -> Any:
        """Execute tool with human approval."""
        # Request approval
        request = await approval_manager.request_approval(
            agent_id=agent_id,
            action=f"tool_call:{self.tool_name}",
            description=self.description,
            params=kwargs,
            timeout=self.timeout,
            auto_approve=self.auto_approve,
        )
        
        # Wait for approval
        resolved = await approval_manager.wait_for_approval(
            request_id=request.id,
            timeout=self.timeout,
        )
        
        if resolved.status != ApprovalStatus.APPROVED:
            return {
                "error": "Action rejected by human",
                "status": resolved.status.value,
                "response": resolved.response,
            }
        
        # Execute the tool
        try:
            result = self.tool_func(**kwargs)
            return {
                "success": True,
                "result": result,
                "approval_id": request.id,
            }
        except Exception as e:
            return {
                "error": str(e),
                "approval_id": request.id,
            }

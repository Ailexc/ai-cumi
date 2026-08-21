"""
AiCumi Human-in-the-Loop System

Enables agents to request human approval before executing sensitive operations.
"""

from .hitl import (
    ApprovalStatus,
    ApprovalRequest,
    HumanApprovalManager,
    ApprovalRequiredTool,
    approval_manager,
)

__all__ = [
    "ApprovalStatus",
    "ApprovalRequest",
    "HumanApprovalManager",
    "ApprovalRequiredTool",
    "approval_manager",
]

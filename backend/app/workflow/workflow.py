"""
AiCumi Workflow Engine (compat shim)

The DAG-based engine lives in `.engine`. This module re-exports the public API
so existing imports like `from .workflow import workflow_engine` keep working.
"""

from .engine import (  # noqa: F401
    Workflow,
    WorkflowNode,
    WorkflowEdge,
    WorkflowRun,
    StepType,
    StepStatus,
    WorkflowStatus,
    WorkflowEngine,
    evaluate_condition,
    render_template,
    resolve_path,
    _stringify,
    workflow_engine,
)

__all__ = [
    "Workflow",
    "WorkflowNode",
    "WorkflowEdge",
    "WorkflowRun",
    "StepType",
    "StepStatus",
    "WorkflowStatus",
    "WorkflowEngine",
    "evaluate_condition",
    "render_template",
    "resolve_path",
    "workflow_engine",
]

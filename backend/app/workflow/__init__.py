"""
AiCumi Workflow Engine

Supports DAG modeling (nodes + edges), sequential/parallel/conditional/review
execution, real agent & tool handlers, conditional expressions, and SQLite
persistence for definitions and run history.
"""

from .engine import (
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
    "_stringify",
    "workflow_engine",
]

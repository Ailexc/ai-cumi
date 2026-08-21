"""
Workflow Engine for AiCumi (DAG-based)

Replaces the old chain-based demo engine with a real, usable orchestration layer:

- **DAG modeling**: workflows are nodes + edges. Branching is expressed via
  edge-level conditions (and success/failure handles), so there is a single
  way to wire any topology (sequential / parallel / conditional / review).
- **Real execution**: step handlers are injected from main.py to call the real
  AG2 agents, the tool registry, and the human-approval manager. A `mock` flag
  per node falls back to the built-in mock handler (learning-friendly).
- **Persistence**: definitions and run history are persisted to SQLite so a
  restart no longer wipes everything.
- **Conditional expressions**: safe AST-validated evaluator (no builtins),
  e.g. `data["score"] > 0.5`.
- **Template transform**: `{{ data.field }}` / `{{ input["k"] }}` rendering.

Execution semantics (trigger model):
- Nodes with no incoming edges are the seeds, run with `initial_input`.
- After a node finishes, every outgoing edge whose condition/handle is satisfied
  triggers its target node (multiple outgoing edges run in parallel).
- A node reached via a single edge receives the source output directly; via
  multiple edges it receives `{source_id: output, ...}`.
"""

import uuid
import ast
import asyncio
import json
import time
import re
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, field
from enum import Enum


# ============================================================================
# Types / enums
# ============================================================================

class StepType(str, Enum):
    """Types of workflow nodes."""
    AGENT_CALL = "agent_call"      # Call a team agent (AG2)
    TOOL_CALL = "tool_call"        # Call a registered built-in tool
    CONDITION = "condition"        # Evaluate an expression -> {"result": bool}
    TRANSFORM = "transform"        # Map/transform data (template / mapping)
    HUMAN_REVIEW = "human_review"  # Pause for human approval (HITL)
    PARALLEL = "parallel"          # Compatibility: parallel fan-out (DAG does this natively)
    SEQUENTIAL = "sequential"      # Compatibility: sequential grouping (DAG does this natively)


class StepStatus(str, Enum):
    """Status of a workflow node during/after a run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING = "waiting"  # waiting for human approval


class WorkflowStatus(str, Enum):
    """Status of a workflow definition or a run."""
    DRAFT = "draft"
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ============================================================================
# Data model
# ============================================================================

@dataclass
class WorkflowNode:
    """A single node in a workflow DAG."""
    id: str
    name: str
    node_type: StepType
    config: Dict[str, Any] = field(default_factory=dict)
    position: Dict[str, float] = field(default_factory=lambda: {"x": 0, "y": 0})
    # --- runtime (reset per run) ---
    status: StepStatus = StepStatus.PENDING
    input_data: Any = None
    output_data: Any = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[float] = None

    def reset(self):
        self.status = StepStatus.PENDING
        self.input_data = None
        self.output_data = None
        self.error = None
        self.started_at = None
        self.completed_at = None
        self.duration_ms = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "node_type": self.node_type.value,
            "config": self.config,
            "position": self.position,
            "status": self.status.value,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_ms": self.duration_ms,
        }


@dataclass
class WorkflowEdge:
    """A directed connection between two nodes."""
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None  # "success" | "failure" | "always"
    condition: Optional[str] = None       # expression evaluated against source output
    label: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "source_handle": self.source_handle,
            "condition": self.condition,
            "label": self.label,
        }


@dataclass
class Workflow:
    """A workflow definition (DAG of nodes + edges)."""
    id: str
    name: str
    description: str = ""
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    status: WorkflowStatus = WorkflowStatus.DRAFT
    created_at: str = ""
    updated_at: str = ""
    # --- runtime bookkeeping ---
    run_count: int = 0
    last_run_status: Optional[str] = None
    last_run_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[float] = None
    completed_count: int = 0
    failed_count: int = 0

    def get_node(self, node_id: str) -> Optional[WorkflowNode]:
        return next((n for n in self.nodes if n.id == node_id), None)

    def reset_run_state(self):
        for n in self.nodes:
            n.reset()
        self.started_at = None
        self.completed_at = None
        self.duration_ms = None
        self.completed_count = 0
        self.failed_count = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "run_count": self.run_count,
            "last_run_status": self.last_run_status,
            "last_run_at": self.last_run_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_ms": self.duration_ms,
            "step_count": len(self.nodes),
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
        }


@dataclass
class WorkflowRun:
    """Runtime record of a single execution."""
    id: str
    workflow_id: str
    workflow_name: str = ""
    status: str = "pending"
    input_data: Any = None
    output_data: Any = None
    steps: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    started_at: str = ""
    completed_at: Optional[str] = None
    duration_ms: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "workflow_name": self.workflow_name,
            "status": self.status,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "steps": self.steps,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_ms": self.duration_ms,
        }


# ============================================================================
# Safe expression evaluator (for conditions)
# ============================================================================

_ALLOWED_AST = (
    ast.Expression, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare, ast.Call,
    ast.Name, ast.Load, ast.Constant, ast.Attribute, ast.Subscript, ast.Tuple,
    ast.List, ast.Dict, ast.Set, ast.Slice, ast.Starred, ast.keyword, ast.IfExp,
    ast.And, ast.Or, ast.Not, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv,
    ast.Mod, ast.Pow, ast.USub, ast.UAdd, ast.Eq, ast.NotEq, ast.Lt, ast.LtE,
    ast.Gt, ast.GtE, ast.Is, ast.IsNot, ast.In, ast.NotIn,
)

_ALLOWED_NAMES = {"data", "input", "ctx", "True", "False", "None",
                  "true", "false", "null"}


def evaluate_condition(expr: str, data: Any, ctx: Optional[Dict] = None) -> bool:
    """Safely evaluate a boolean expression against data.

    Supports: comparison, boolean/logic ops, arithmetic, membership, indexing,
    attribute access. Blocks builtins, private attrs (`__`), and unknown names.
    Examples: `data["score"] > 0.5`, `len(data["items"]) > 0`, `"err" in data`.
    """
    if expr is None or not str(expr).strip():
        return True
    try:
        tree = ast.parse(str(expr), mode="eval")
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_AST):
            return False
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return False
        if isinstance(node, ast.Name) and node.id not in _ALLOWED_NAMES:
            return False
    env = {
        "__builtins__": {},
        "data": data,
        "input": data,
        "ctx": ctx or {},
        "True": True,
        "False": False,
        "None": None,
        "true": True,
        "false": False,
        "null": None,
    }
    try:
        return bool(eval(compile(tree, "<condition>", "eval"), env))
    except Exception:
        return False


# ============================================================================
# Template rendering (for transform nodes / prompts)
# ============================================================================

def _resolve_remaining(root: Any, path: str) -> Any:
    """Resolve `.field` / `["key"]` / `[index]` segments against root."""
    cur = root
    if path and path[0] not in ".[":
        # bare field name, e.g. resolve_path("input.response") -> "response"
        if isinstance(cur, dict):
            return cur.get(path)
        return getattr(cur, path, None)
    i = 0
    n = len(path)
    while i < n:
        c = path[i]
        if c == ".":
            j = i + 1
            while j < n and (path[j].isalnum() or path[j] == "_"):
                j += 1
            key = path[i + 1:j]
            if key == "":
                raise ValueError("empty field")
            if isinstance(cur, dict):
                cur = cur.get(key)
            else:
                cur = getattr(cur, key, None)
            i = j
        elif c == "[":
            j = path.find("]", i)
            if j == -1:
                raise ValueError("unterminated index")
            seg = path[i + 1:j].strip()
            if seg.startswith('"') or seg.startswith("'"):
                key = seg[1:-1]
                cur = cur.get(key) if isinstance(cur, dict) else None
            else:
                try:
                    idx = int(seg)
                except ValueError:
                    raise ValueError(f"bad index: {seg}")
                if isinstance(cur, (list, tuple)):
                    cur = cur[idx] if -len(cur) <= idx < len(cur) else None
                elif isinstance(cur, dict):
                    cur = cur.get(seg)
                else:
                    cur = None
            i = j + 1
        else:
            raise ValueError(f"unexpected char: {c}")
    return cur


def resolve_path(path: str, data: Any, ctx: Optional[Dict] = None) -> Any:
    """Resolve `data.x.y` / `input["k"]` / `ctx.z` style paths."""
    path = path.strip()
    if not path:
        return data
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            pass
    if path == "data" or path == "input":
        return data
    if path.startswith("data."):
        return _resolve_remaining(data, path[len("data."):])
    if path.startswith("data["):
        return _resolve_remaining(data, path[len("data"):])
    if path.startswith("input."):
        return _resolve_remaining(data, path[len("input."):])
    if path.startswith("input["):
        return _resolve_remaining(data, path[len("input"):])
    if path.startswith("ctx."):
        return _resolve_remaining(ctx or {}, path[len("ctx."):])
    if path.startswith("ctx["):
        return _resolve_remaining(ctx or {}, path[len("ctx"):])
    return _resolve_remaining(data, path)


def render_template(template: str, data: Any, ctx: Optional[Dict] = None) -> str:
    """Render `{{ data.field }}` placeholders inside a string."""
    if template is None:
        return ""
    pattern = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")

    def _repl(m: "re.Match") -> str:
        try:
            return str(resolve_path(m.group(1), data, ctx))
        except Exception:
            return ""

    return pattern.sub(_repl, template)


def _stringify(value: Any) -> str:
    """Best-effort conversion of arbitrary input into a string for prompts/tools."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return str(value)


# ============================================================================
# Engine
# ============================================================================

class WorkflowEngine:
    """Executes DAG workflows with real injected handlers + SQLite persistence."""

    def __init__(self):
        self._workflows: Dict[str, Workflow] = {}
        self._step_handlers: Dict[StepType, Callable] = {}
        self._ws_notifier: Optional[Callable] = None
        self._db_factory: Optional[Callable] = None

    # ---- wiring ----

    def set_db(self, db_factory: Callable):
        """Provide a SQLAlchemy session factory for persistence."""
        self._db_factory = db_factory

    def _get_session(self):
        """Return a live SQLAlchemy session from the configured factory.

        Supports both plain factories and generator-style factories such as
        FastAPI's `get_db` (which yields a single session).
        """
        if self._db_factory is None:
            raise RuntimeError("Workflow engine has no DB session factory")
        session = self._db_factory()
        if hasattr(session, "__next__"):
            session = next(session)
        return session

    def set_ws_notifier(self, notifier: Callable):
        self._ws_notifier = notifier

    def register_handler(self, step_type: StepType, handler: Callable):
        self._step_handlers[step_type] = handler

    def register_handlers(self, handlers: Dict[StepType, Callable]):
        self._step_handlers.update(handlers)

    # ---- persistence helpers ----

    def _persist_workflow(self, workflow: Workflow):
        if not self._db_factory:
            return
        from ..models import WorkflowDef
        db = self._get_session()
        try:
            row = db.get(WorkflowDef, workflow.id)
            definition = json.dumps(
                {"nodes": [n.to_dict() for n in workflow.nodes],
                 "edges": [e.to_dict() for e in workflow.edges]},
                ensure_ascii=False,
            )
            if row is None:
                row = WorkflowDef(
                    id=workflow.id,
                    name=workflow.name,
                    description=workflow.description,
                    definition_json=definition,
                )
                db.add(row)
            else:
                row.name = workflow.name
                row.description = workflow.description
                row.definition_json = definition
            db.commit()
        except Exception as e:
            print(f"⚠️ Failed to persist workflow {workflow.id}: {e}")
            db.rollback()
        finally:
            db.close()

    def _persist_run(self, run: WorkflowRun):
        if not self._db_factory:
            return
        from ..models import WorkflowRun as WorkflowRunORM
        db = self._get_session()
        try:
            row = WorkflowRunORM(
                id=run.id,
                workflow_id=run.workflow_id,
                workflow_name=run.workflow_name,
                definition_json=json.dumps({"nodes": run.steps}, ensure_ascii=False, default=str),
                status=run.status,
                input_data=json.dumps(run.input_data, ensure_ascii=False, default=str),
                output_data=json.dumps(run.output_data, ensure_ascii=False, default=str),
                steps_json=json.dumps(run.steps, ensure_ascii=False, default=str),
                error=run.error,
                started_at=self._to_dt(run.started_at),
                completed_at=self._to_dt(run.completed_at),
                duration_ms=run.duration_ms,
            )
            db.add(row)
            db.commit()
        except Exception as e:
            print(f"⚠️ Failed to persist run {run.id}: {e}")
            db.rollback()
        finally:
            db.close()

    @staticmethod
    def _to_dt(iso: Optional[str]):
        if not iso:
            return None
        try:
            return datetime.fromisoformat(iso)
        except Exception:
            return None

    @staticmethod
    def _to_iso(dt: Optional[datetime]) -> Optional[str]:
        return dt.isoformat() if dt else None

    def load_from_db(self):
        """Load all persisted workflow definitions into memory."""
        if not self._db_factory:
            return
        from ..models import WorkflowDef, WorkflowRun as WorkflowRunORM
        db = self._get_session()
        try:
            for row in db.query(WorkflowDef).all():
                try:
                    definition = json.loads(row.definition_json or "{}")
                    wf = self._from_dict(
                        wf_id=row.id,
                        name=row.name or "未命名",
                        description=row.description or "",
                        nodes_data=definition.get("nodes", []),
                        edges_data=definition.get("edges", []),
                        created_at=self._to_iso(row.created_at),
                        updated_at=self._to_iso(row.updated_at),
                    )
                    last_run = (
                        db.query(WorkflowRunORM)
                        .filter(WorkflowRunORM.workflow_id == row.id)
                        .order_by(WorkflowRunORM.created_at.desc())
                        .first()
                    )
                    if last_run:
                        wf.run_count = db.query(WorkflowRunORM).filter(
                            WorkflowRunORM.workflow_id == row.id).count()
                        wf.last_run_status = last_run.status
                        wf.last_run_at = self._to_iso(last_run.completed_at)
                    self._workflows[wf.id] = wf
                except Exception as e:
                    print(f"⚠️ Skipped bad workflow {row.id}: {e}")
            print(f"✅ Loaded {len(self._workflows)} workflows from DB")
        finally:
            db.close()

    # ---- CRUD ----

    @staticmethod
    def _from_dict(wf_id: str, name: str, description: str,
                   nodes_data: List[Dict], edges_data: List[Dict],
                   created_at: str = "", updated_at: str = "") -> Workflow:
        nodes = WorkflowEngine._build_nodes(nodes_data)
        edges = []
        for ed in edges_data or []:
            edges.append(WorkflowEdge(
                id=ed.get("id", str(uuid.uuid4())),
                source=ed.get("source", ""),
                target=ed.get("target", ""),
                source_handle=ed.get("source_handle"),
                condition=ed.get("condition"),
                label=ed.get("label"),
            ))
        return Workflow(
            id=wf_id,
            name=name,
            description=description,
            nodes=nodes,
            edges=edges,
            status=WorkflowStatus.DRAFT,
            created_at=created_at or datetime.now(timezone.utc).isoformat(),
            updated_at=updated_at or datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _build_nodes(nodes_data: List[Dict]) -> List[WorkflowNode]:
        out = []
        for nd in nodes_data or []:
            try:
                node_type = StepType(nd.get("node_type", "agent_call"))
            except ValueError:
                node_type = StepType.AGENT_CALL
            out.append(WorkflowNode(
                id=nd.get("id", str(uuid.uuid4())),
                name=nd.get("name", "未命名节点"),
                node_type=node_type,
                config=nd.get("config") or {},
                position=nd.get("position") or {"x": 0, "y": 0},
            ))
        return out

    def create_workflow(self, name: str, description: str = "",
                        nodes: Optional[List[Dict]] = None,
                        edges: Optional[List[Dict]] = None) -> Workflow:
        wf = self._from_dict(
            wf_id=str(uuid.uuid4()),
            name=name,
            description=description,
            nodes_data=nodes or [],
            edges_data=edges or [],
        )
        self._workflows[wf.id] = wf
        self._persist_workflow(wf)
        return wf

    def update_workflow(self, workflow_id: str, name: Optional[str] = None,
                        description: Optional[str] = None,
                        nodes: Optional[List[Dict]] = None,
                        edges: Optional[List[Dict]] = None) -> Optional[Workflow]:
        wf = self._workflows.get(workflow_id)
        if not wf:
            return None
        if name is not None:
            wf.name = name
        if description is not None:
            wf.description = description
        if nodes is not None:
            wf.nodes = self._build_nodes(nodes)
        if edges is not None:
            wf.edges = [
                WorkflowEdge(
                    id=ed.get("id", str(uuid.uuid4())),
                    source=ed.get("source", ""),
                    target=ed.get("target", ""),
                    source_handle=ed.get("source_handle"),
                    condition=ed.get("condition"),
                    label=ed.get("label"),
                ) for ed in edges
            ]
        wf.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_workflow(wf)
        return wf

    def delete_workflow(self, workflow_id: str) -> bool:
        wf = self._workflows.pop(workflow_id, None)
        if not wf:
            return False
        if self._db_factory:
            from ..models import WorkflowDef, WorkflowRun as WorkflowRunORM
            db = self._get_session()
            try:
                row = db.get(WorkflowDef, workflow_id)
                if row:
                    db.delete(row)
                db.query(WorkflowRunORM).filter(
                    WorkflowRunORM.workflow_id == workflow_id).delete()
                db.commit()
            finally:
                db.close()
        return True

    def duplicate_workflow(self, workflow_id: str) -> Optional[Workflow]:
        src = self._workflows.get(workflow_id)
        if not src:
            return None
        id_map = {n.id: str(uuid.uuid4()) for n in src.nodes}
        nodes = []
        for n in src.nodes:
            nd = n.to_dict()
            nd["id"] = id_map[n.id]
            nodes.append(nd)
        edges = []
        for e in src.edges:
            ed = e.to_dict()
            ed["source"] = id_map.get(ed["source"], ed["source"])
            ed["target"] = id_map.get(ed["target"], ed["target"])
            edges.append(ed)
        return self.create_workflow(
            name=f"{src.name}（副本）",
            description=src.description,
            nodes=nodes,
            edges=edges,
        )

    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        return self._workflows.get(workflow_id)

    def get_workflows(self, limit: int = 100) -> List[Workflow]:
        return sorted(
            self._workflows.values(),
            key=lambda w: w.updated_at or w.created_at or "",
            reverse=True,
        )[:limit]

    def get_runs(self, workflow_id: str, limit: int = 50) -> List[WorkflowRun]:
        if not self._db_factory:
            return []
        from ..models import WorkflowRun as WorkflowRunORM
        db = self._get_session()
        try:
            rows = (
                db.query(WorkflowRunORM)
                .filter(WorkflowRunORM.workflow_id == workflow_id)
                .order_by(WorkflowRunORM.created_at.desc())
                .limit(limit)
                .all()
            )
            runs = []
            for r in rows:
                try:
                    steps = json.loads(r.steps_json or "[]")
                except Exception:
                    steps = []
                runs.append(WorkflowRun(
                    id=r.id,
                    workflow_id=r.workflow_id,
                    workflow_name=r.workflow_name or "",
                    status=r.status,
                    input_data=self._safe_load(r.input_data),
                    output_data=self._safe_load(r.output_data),
                    steps=steps,
                    error=r.error,
                    started_at=self._to_iso(r.started_at),
                    completed_at=self._to_iso(r.completed_at),
                    duration_ms=r.duration_ms,
                ))
            return runs
        finally:
            db.close()

    @staticmethod
    def _safe_load(text: Optional[str]):
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            return text

    # ---- execution ----

    async def execute_workflow(self, workflow_id: str,
                               initial_input: Any = None) -> Workflow:
        """Execute a workflow (optionally running in a background task)."""
        workflow = self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"工作流不存在: {workflow_id}")
        if workflow.status == WorkflowStatus.RUNNING:
            raise ValueError("工作流正在运行中，请稍后再试")

        workflow.reset_run_state()
        workflow.status = WorkflowStatus.RUNNING
        workflow.started_at = datetime.now(timezone.utc).isoformat()
        start = time.monotonic()

        run = WorkflowRun(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            status="running",
            input_data=initial_input,
            started_at=workflow.started_at,
        )
        await self._notify(workflow, "workflow.started")

        try:
            await self._run_dag(workflow, initial_input)
            # Mark unreached branch nodes as skipped (e.g. the non-taken
            # branch of a conditional), so a successful partial DAG is not
            # misclassified as failed.
            for n in workflow.nodes:
                if n.status == StepStatus.PENDING:
                    n.status = StepStatus.SKIPPED
            failed = [n for n in workflow.nodes if n.status == StepStatus.FAILED]
            if failed:
                workflow.status = WorkflowStatus.FAILED
            else:
                workflow.status = WorkflowStatus.COMPLETED
        except Exception as e:
            workflow.status = WorkflowStatus.FAILED
            run.error = str(e)
            print(f"⚠️ Workflow execution failed: {e}")

        workflow.completed_at = datetime.now(timezone.utc).isoformat()
        workflow.duration_ms = (time.monotonic() - start) * 1000
        workflow.run_count += 1
        workflow.last_run_status = workflow.status.value
        workflow.last_run_at = workflow.completed_at

        run.status = workflow.status.value
        run.completed_at = workflow.completed_at
        run.duration_ms = workflow.duration_ms
        run.steps = [n.to_dict() for n in workflow.nodes]
        run.output_data = {
            n.id: n.output_data for n in workflow.nodes
            if n.status in (StepStatus.COMPLETED, StepStatus.WAITING)
        }
        self._persist_run(run)
        self._persist_workflow(workflow)
        await self._notify(workflow, "workflow.completed")

        return workflow

    async def _run_dag(self, workflow: Workflow, initial_input: Any):
        incoming: Dict[str, List[WorkflowEdge]] = {
            n.id: [e for e in workflow.edges if e.target == n.id]
            for n in workflow.nodes
        }
        outgoing: Dict[str, List[WorkflowEdge]] = {
            n.id: [e for e in workflow.edges if e.source == n.id]
            for n in workflow.nodes
        }
        seeds = [n for n in workflow.nodes if not incoming.get(n.id)]
        if not seeds:
            raise ValueError("工作流没有可执行起点（所有节点都有前置依赖）")

        async def run_node(node: WorkflowNode, input_data: Any):
            if node.status == StepStatus.RUNNING:
                return  # already triggered by another path
            node.input_data = input_data
            await self._execute_node(workflow, node)
            pending = []
            for edge in outgoing.get(node.id, []):
                if not self._edge_satisfied(edge, node):
                    continue
                target = workflow.get_node(edge.target)
                if target and target.status == StepStatus.PENDING:
                    pending.append(run_node(target, self._collect_input(workflow, target, incoming)))
            if pending:
                await asyncio.gather(*pending)

        await asyncio.gather(*[run_node(n, initial_input) for n in seeds])

    @staticmethod
    def _collect_input(workflow: Workflow, node: WorkflowNode,
                       incoming: Dict[str, List[WorkflowEdge]]) -> Any:
        sources = [workflow.get_node(e.source) for e in incoming.get(node.id, [])]
        sources = [s for s in sources if s is not None]
        if len(sources) == 1:
            return sources[0].output_data
        if len(sources) > 1:
            return {s.id: s.output_data for s in sources}
        return None

    def _edge_satisfied(self, edge: WorkflowEdge, source: WorkflowNode) -> bool:
        if edge.source_handle in ("success",) and source.status != StepStatus.COMPLETED:
            return False
        if edge.source_handle in ("failure",) and source.status == StepStatus.COMPLETED:
            return False
        if edge.condition:
            try:
                return evaluate_condition(edge.condition, source.output_data, {})
            except Exception:
                return False
        return True

    async def _execute_node(self, workflow: Workflow, node: WorkflowNode):
        node.status = StepStatus.RUNNING
        node.started_at = datetime.now(timezone.utc).isoformat()
        node.error = None
        start = time.monotonic()
        await self._notify(workflow, "step.started", node)
        try:
            handler = self._step_handlers.get(node.node_type)
            if handler:
                node.output_data = await handler(node.input_data, node.config)
            else:
                node.output_data = await self._default_handler(node)
            node.status = StepStatus.COMPLETED
            workflow.completed_count += 1
        except Exception as e:
            node.status = StepStatus.FAILED
            node.error = str(e)
            workflow.failed_count += 1
            print(f"⚠️ Node '{node.name}' failed: {e}")
        finally:
            node.completed_at = datetime.now(timezone.utc).isoformat()
            node.duration_ms = (time.monotonic() - start) * 1000
            await self._notify(workflow, "step.completed", node)

    async def _default_handler(self, node: WorkflowNode) -> Any:
        """Built-in mock handler (learning/debug friendly)."""
        if node.node_type == StepType.AGENT_CALL:
            return {"response": f"（模拟）Agent {node.config.get('agent_id', '?')} 处理：{_stringify(node.input_data)}"}
        if node.node_type == StepType.TOOL_CALL:
            return {"result": f"（模拟）工具 {node.config.get('tool_name', '?')} 执行：{_stringify(node.input_data)}"}
        if node.node_type == StepType.CONDITION:
            expr = node.config.get("expression", "data")
            return {"result": evaluate_condition(expr, node.input_data, {})}
        if node.node_type == StepType.TRANSFORM:
            template = node.config.get("template")
            if template:
                return render_template(template, node.input_data, {})
            return node.input_data
        if node.node_type == StepType.HUMAN_REVIEW:
            node.status = StepStatus.WAITING
            return {"status": "waiting_for_human", "input": node.input_data}
        return node.input_data

    def cancel_workflow(self, workflow_id: str) -> bool:
        """Best-effort cancel (works when execution runs as a background task)."""
        wf = self._workflows.get(workflow_id)
        if wf and wf.status == WorkflowStatus.RUNNING:
            wf.status = WorkflowStatus.CANCELLED
            wf.completed_at = datetime.now(timezone.utc).isoformat()
            return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        active = len([w for w in self._workflows.values()
                      if w.status == WorkflowStatus.RUNNING])
        total_steps = sum(len(w.nodes) for w in self._workflows.values())
        total_runs = sum(w.run_count for w in self._workflows.values())
        if self._db_factory:
            from ..models import WorkflowRun as WorkflowRunORM
            db = self._get_session()
            try:
                total_runs = db.query(WorkflowRunORM).count()
            finally:
                db.close()
        return {
            "active_workflows": active,
            "completed_workflows": len(self._workflows),
            "total_steps": total_steps,
            "total_runs": total_runs,
        }

    async def _notify(self, workflow: Workflow, event: str, node: Optional[WorkflowNode] = None):
        if self._ws_notifier:
            try:
                await self._ws_notifier({
                    "type": f"workflow.{event}",
                    "workflow_id": workflow.id,
                    "workflow_status": workflow.status.value,
                    "node": node.to_dict() if node else None,
                })
            except Exception:
                pass


# Global workflow engine instance
workflow_engine = WorkflowEngine()

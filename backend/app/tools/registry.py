"""
Tool Registry for AiCumi

Manages tool registration, metadata, and AG2 FunctionTool integration.
"""

import json
import inspect
from typing import Any, Callable, Dict, List, Optional, Type
from dataclasses import dataclass, field, asdict
from pydantic import BaseModel, Field


@dataclass
class ToolParameter:
    """Tool parameter definition."""
    name: str
    type: str  # "string", "integer", "float", "boolean", "array", "object"
    description: str
    required: bool = True
    default: Any = None
    enum: Optional[List[str]] = None


@dataclass
class ToolDefinition:
    """Tool metadata and definition."""
    name: str
    description: str
    category: str = "general"  # "general", "search", "code", "file", "api"
    parameters: List[ToolParameter] = field(default_factory=list)
    func: Optional[Callable] = None
    enabled: bool = True
    version: str = "1.0.0"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "parameters": [asdict(p) for p in self.parameters],
            "enabled": self.enabled,
            "version": self.version,
        }
    
    def to_openai_schema(self) -> Dict[str, Any]:
        """Convert to OpenAI function calling schema."""
        properties = {}
        required = []
        
        for param in self.parameters:
            prop = {
                "type": param.type,
                "description": param.description,
            }
            if param.enum:
                prop["enum"] = param.enum
            properties[param.name] = prop
            
            if param.required:
                required.append(param.name)
        
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            }
        }


class ToolRegistry:
    """Registry for managing tools."""
    
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
    
    def register(
        self,
        name: str,
        description: str,
        category: str = "general",
        parameters: Optional[List[ToolParameter]] = None,
    ) -> Callable:
        """Decorator to register a tool function."""
        def decorator(func: Callable) -> Callable:
            # Auto-generate parameters from function signature if not provided
            tool_params = parameters or self._infer_parameters(func)
            # 一致性校验：ToolParameter 声明的参数必须存在于函数签名中（防 schema 漂移）
            self._validate_tool_schema(tool_params, func, name)
            
            tool_def = ToolDefinition(
                name=name,
                description=description,
                category=category,
                parameters=tool_params,
                func=func,
            )
            self._tools[name] = tool_def
            return func
        return decorator

    def _validate_tool_schema(
        self, tool_params: List[ToolParameter], func: Callable, tool_name: str
    ) -> None:
        """Guard against schema drift: every ToolParameter must exist in the
        function signature (so the AG2-generated runtime schema stays aligned
        with the management-side metadata)."""
        if not tool_params or func is None:
            return
        try:
            sig = inspect.signature(func)
            param_names = set(sig.parameters.keys())
            for p in tool_params:
                if p.name not in param_names:
                    print(
                        f"⚠️ Tool schema drift: {tool_name}.{p.name} "
                        f"不在函数签名 {sorted(param_names)} 中"
                    )
        except (TypeError, ValueError):
            pass
    
    def register_tool(self, tool_def: ToolDefinition) -> None:
        """Register a tool from a ToolDefinition object."""
        self._tools[tool_def.name] = tool_def
    
    def get(self, name: str) -> Optional[ToolDefinition]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def list_tools(self, category: Optional[str] = None) -> List[ToolDefinition]:
        """List all tools, optionally filtered by category."""
        tools = list(self._tools.values())
        if category:
            tools = [t for t in tools if t.category == category]
        return tools
    
    def list_tool_names(self) -> List[str]:
        """List all tool names."""
        return list(self._tools.keys())
    
    def get_enabled_tools(self) -> List[ToolDefinition]:
        """Get all enabled tools."""
        return [t for t in self._tools.values() if t.enabled]
    
    def enable(self, name: str) -> bool:
        """Enable a tool."""
        if name in self._tools:
            self._tools[name].enabled = True
            return True
        return False
    
    def disable(self, name: str) -> bool:
        """Disable a tool."""
        if name in self._tools:
            self._tools[name].enabled = False
            return True
        return False
    
    def execute(self, name: str, **kwargs) -> Any:
        """Execute a tool by name."""
        tool = self._tools.get(name)
        if not tool:
            raise ValueError(f"Tool '{name}' not found")
        if not tool.enabled:
            raise ValueError(f"Tool '{name}' is disabled")
        if not tool.func:
            raise ValueError(f"Tool '{name}' has no implementation")
        
        return tool.func(**kwargs)
    
    def get_ag2_tools(self, names: Optional[List[str]] = None) -> List[Any]:
        """Get tools as AG2 FunctionTool objects."""
        try:
            from autogen_core.tools import FunctionTool
        except ImportError:
            # AG2 not available, return empty list
            return []
        
        tools = []
        target_tools = self._tools.values() if names is None else [
            self._tools[n] for n in names if n in self._tools
        ]
        
        for tool_def in target_tools:
            if not tool_def.enabled or not tool_def.func:
                continue
            
            # Create AG2 FunctionTool
            ag2_tool = FunctionTool(
                func=tool_def.func,
                name=tool_def.name,
                description=tool_def.description,
            )
            tools.append(ag2_tool)
        
        return tools
    
    def _infer_parameters(self, func: Callable) -> List[ToolParameter]:
        """Infer parameters from function signature."""
        sig = inspect.signature(func)
        params = []
        
        for name, param in sig.parameters.items():
            if name == "self":
                continue
            
            # Determine type
            param_type = "string"
            if param.annotation != inspect.Parameter.empty:
                type_map = {
                    str: "string",
                    int: "integer",
                    float: "float",
                    bool: "boolean",
                    list: "array",
                    dict: "object",
                }
                param_type = type_map.get(param.annotation, "string")
            
            # Determine if required
            required = param.default == inspect.Parameter.empty
            default = None if required else param.default
            
            params.append(ToolParameter(
                name=name,
                type=param_type,
                description=f"Parameter: {name}",
                required=required,
                default=default,
            ))
        
        return params
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert registry to dictionary for API response."""
        return {
            "tools": [t.to_dict() for t in self._tools.values()],
            "count": len(self._tools),
            "enabled_count": len(self.get_enabled_tools()),
        }


# Global tool registry instance
tool_registry = ToolRegistry()

"""
Built-in Tools for AiCumi

Provides common tools that agents can use out of the box.
"""

import os
import json
import subprocess
import tempfile
from typing import Any, Dict, List, Optional
from datetime import datetime

from .registry import tool_registry, ToolParameter


# ============================================================================
# Web Search Tool
# ============================================================================

@tool_registry.register(
    name="web_search",
    description="Search the web for information. Returns search results with titles, URLs, and snippets.",
    category="search",
    parameters=[
        ToolParameter(
            name="query",
            type="string",
            description="The search query",
            required=True,
        ),
        ToolParameter(
            name="num_results",
            type="integer",
            description="Number of results to return (default: 5)",
            required=False,
            default=5,
        ),
    ],
)
def web_search(query: str, num_results: int = 5) -> str:
    """Search the web using a search API."""
    # Try to use Serper API if available
    api_key = os.getenv("SERPER_API_KEY")
    if api_key:
        return _search_with_serper(query, num_results, api_key)
    
    # Fallback to a simple mock for demo purposes
    return json.dumps({
        "query": query,
        "results": [
            {
                "title": f"Search result {i+1} for: {query}",
                "url": f"https://example.com/result-{i+1}",
                "snippet": f"This is a sample search result for '{query}'. In production, this would contain real search results from a search API like Serper, Bing, or Google."
            }
            for i in range(min(num_results, 3))
        ],
        "note": "Configure SERPER_API_KEY environment variable for real search results"
    }, ensure_ascii=False, indent=2)


def _search_with_serper(query: str, num_results: int, api_key: str) -> str:
    """Search using Serper API."""
    import httpx
    
    try:
        response = httpx.post(
            "https://google.serper.dev/search",
            json={"q": query, "num": num_results},
            headers={"X-API-KEY": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        
        results = []
        for item in data.get("organic", [])[:num_results]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            })
        
        return json.dumps({
            "query": query,
            "results": results,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "error": f"Search failed: {str(e)}",
            "query": query,
        })


# ============================================================================
# Code Execution Tool
# ============================================================================

@tool_registry.register(
    name="code_execute",
    description="Execute Python code and return the output. Use this for calculations, data processing, or any Python task.",
    category="code",
    parameters=[
        ToolParameter(
            name="code",
            type="string",
            description="The Python code to execute",
            required=True,
        ),
        ToolParameter(
            name="timeout",
            type="integer",
            description="Execution timeout in seconds (default: 30)",
            required=False,
            default=30,
        ),
    ],
)
def code_execute(code: str, timeout: int = 30) -> str:
    """Execute Python code in a subprocess."""
    try:
        # Create a temporary file for the code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_file = f.name
        
        # Execute the code
        result = subprocess.run(
            ["python3", temp_file],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=tempfile.gettempdir(),
        )
        
        # Clean up
        os.unlink(temp_file)
        
        output = {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "return_code": result.returncode,
        }
        
        return json.dumps(output, ensure_ascii=False, indent=2)
    
    except subprocess.TimeoutExpired:
        return json.dumps({
            "success": False,
            "error": f"Code execution timed out after {timeout} seconds",
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Execution failed: {str(e)}",
        })


# ============================================================================
# File Tools
# ============================================================================

@tool_registry.register(
    name="file_read",
    description="Read the contents of a file.",
    category="file",
    parameters=[
        ToolParameter(
            name="file_path",
            type="string",
            description="Path to the file to read",
            required=True,
        ),
        ToolParameter(
            name="encoding",
            type="string",
            description="File encoding (default: utf-8)",
            required=False,
            default="utf-8",
        ),
    ],
)
def file_read(file_path: str, encoding: str = "utf-8") -> str:
    """Read file contents."""
    try:
        # Security: Only allow reading from workspace directory
        workspace = os.getenv("WORKSPACE_DIR", os.getcwd())
        abs_path = os.path.abspath(file_path)
        
        if not abs_path.startswith(os.path.abspath(workspace)):
            return json.dumps({
                "error": "Access denied: File must be within workspace directory",
                "file_path": file_path,
            })
        
        with open(abs_path, 'r', encoding=encoding) as f:
            content = f.read()
        
        return json.dumps({
            "success": True,
            "file_path": file_path,
            "content": content,
            "size": len(content),
        }, ensure_ascii=False)
    
    except FileNotFoundError:
        return json.dumps({
            "error": f"File not found: {file_path}",
        })
    except Exception as e:
        return json.dumps({
            "error": f"Failed to read file: {str(e)}",
        })


@tool_registry.register(
    name="file_write",
    description="Write content to a file.",
    category="file",
    parameters=[
        ToolParameter(
            name="file_path",
            type="string",
            description="Path to the file to write",
            required=True,
        ),
        ToolParameter(
            name="content",
            type="string",
            description="Content to write to the file",
            required=True,
        ),
        ToolParameter(
            name="encoding",
            type="string",
            description="File encoding (default: utf-8)",
            required=False,
            default="utf-8",
        ),
    ],
)
def file_write(file_path: str, content: str, encoding: str = "utf-8") -> str:
    """Write content to a file."""
    try:
        # Security: Only allow writing to workspace directory
        workspace = os.getenv("WORKSPACE_DIR", os.getcwd())
        abs_path = os.path.abspath(file_path)
        
        if not abs_path.startswith(os.path.abspath(workspace)):
            return json.dumps({
                "error": "Access denied: File must be within workspace directory",
                "file_path": file_path,
            })
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        
        with open(abs_path, 'w', encoding=encoding) as f:
            f.write(content)
        
        return json.dumps({
            "success": True,
            "file_path": file_path,
            "size": len(content),
        }, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "error": f"Failed to write file: {str(e)}",
        })


# ============================================================================
# Data Processing Tools
# ============================================================================

@tool_registry.register(
    name="json_parse",
    description="Parse and validate JSON data. Returns formatted JSON or error details.",
    category="data",
    parameters=[
        ToolParameter(
            name="data",
            type="string",
            description="The JSON string to parse",
            required=True,
        ),
    ],
)
def json_parse(data: str) -> str:
    """Parse JSON data."""
    try:
        parsed = json.loads(data)
        return json.dumps({
            "success": True,
            "parsed": parsed,
            "formatted": json.dumps(parsed, ensure_ascii=False, indent=2),
        }, ensure_ascii=False, indent=2)
    except json.JSONDecodeError as e:
        return json.dumps({
            "success": False,
            "error": f"Invalid JSON: {str(e)}",
        })


@tool_registry.register(
    name="datetime_utils",
    description="Get current date/time or format timestamps.",
    category="utility",
    parameters=[
        ToolParameter(
            name="action",
            type="string",
            description="Action: 'now' (current time), 'format' (format timestamp), 'parse' (parse date string)",
            required=True,
            enum=["now", "format", "parse"],
        ),
        ToolParameter(
            name="value",
            type="string",
            description="Timestamp to format or date string to parse (required for format/parse actions)",
            required=False,
        ),
        ToolParameter(
            name="format",
            type="string",
            description="Date format string (default: %Y-%m-%d %H:%M:%S)",
            required=False,
            default="%Y-%m-%d %H:%M:%S",
        ),
    ],
)
def datetime_utils(action: str, value: Optional[str] = None, format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Date/time utility functions."""
    try:
        if action == "now":
            return json.dumps({
                "success": True,
                "datetime": datetime.now().strftime(format),
                "timestamp": datetime.now().timestamp(),
                "iso": datetime.now().isoformat(),
            })
        elif action == "format":
            if not value:
                return json.dumps({"error": "value is required for format action"})
            ts = float(value)
            dt = datetime.fromtimestamp(ts)
            return json.dumps({
                "success": True,
                "formatted": dt.strftime(format),
                "iso": dt.isoformat(),
            })
        elif action == "parse":
            if not value:
                return json.dumps({"error": "value is required for parse action"})
            dt = datetime.strptime(value, format)
            return json.dumps({
                "success": True,
                "timestamp": dt.timestamp(),
                "iso": dt.isoformat(),
            })
        else:
            return json.dumps({"error": f"Unknown action: {action}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ============================================================================
# Registration Function
# ============================================================================

def register_builtin_tools() -> None:
    """Register all built-in tools."""
    # Tools are auto-registered via decorators
    # This function exists to be called explicitly if needed
    print(f"✅ Registered {len(tool_registry.list_tools())} built-in tools")
    for tool in tool_registry.list_tools():
        print(f"   - {tool.name}: {tool.description[:50]}...")

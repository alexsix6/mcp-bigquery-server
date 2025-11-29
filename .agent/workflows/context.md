---
description: Interact with Context Agent MCP (Universal Client)
---

# Context Agent Interface

This workflow allows Antigravity to access the Context Agent system to understand project context and log improvements.

## Usage

**Get Project Context:**
```bash
python3 /mnt/d/Dev/context-agent-mcp/src/antigravity_client.py --command get_project_context --project "current-project" --topic "general"
```

**Log Improvement:**
```bash
python3 /mnt/d/Dev/context-agent-mcp/src/antigravity_client.py --command add_improvement --project "current-project" --content "Description of improvement"
```

**Get Status:**
```bash
python3 /mnt/d/Dev/context-agent-mcp/src/antigravity_client.py --command get_project_status --project "current-project"
```

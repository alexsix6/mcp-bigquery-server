---
description: Interact with Enterprise Memory MCP (Universal Client)
---

# Enterprise Memory Interface

This workflow allows Antigravity to access the global Enterprise Memory system to store and retrieve knowledge across projects.

## Usage

**Store Memory:**
```bash
python3 /mnt/d/Dev/Enterprise-Memoria-MCP/src/enterprise_memory_client.py --tool store_memory --content "Your content here" --summary "Brief summary"
```

**Search Memory:**
```bash
python3 /mnt/d/Dev/Enterprise-Memoria-MCP/src/enterprise_memory_client.py --tool search_memories --query "search term"
```

**Graph Query:**
```bash
python3 /mnt/d/Dev/Enterprise-Memoria-MCP/src/enterprise_memory_client.py --tool graph_query --query "cypher query or natural language"
```

**List Tools:**
```bash
python3 /mnt/d/Dev/Enterprise-Memoria-MCP/src/enterprise_memory_client.py --list-tools
```

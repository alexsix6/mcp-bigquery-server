---
description: Cómo habilitar la "Memoria Global" (Antigravity) en cualquier proyecto nuevo
---

# Configuración de Memoria Global

Para que Antigravity tenga acceso a `context-agent` y `enterprise_memory` en un nuevo proyecto, sigue estos pasos:

## 1. Copiar la Carpeta .agent
Copia la carpeta `.agent` de este proyecto a la raíz de tu nuevo proyecto.
Asegúrate de incluir:
*   `.agent/workflows/context.md`
*   `.agent/workflows/memory.md`

## 2. Uso
Una vez copiados, Antigravity reconocerá automáticamente los comandos:

*   `/context` -> Para leer/escribir contexto del proyecto.
*   `/memory` -> Para buscar/guardar conocimiento global.

## 3. Verificación
En el nuevo proyecto, pídele a Antigravity:
> "Revisa el contexto de este proyecto usando /context"
> "Busca en mi memoria global cómo configurar X usando /memory"

---
**Nota Técnica:**
Estos workflows utilizan scripts universales ubicados en:
*   `D:\Dev\context-agent-mcp\src\antigravity_client.py`
*   `D:\Dev\Enterprise-Memoria-MCP\src\enterprise_memory_client.py`

Mientras esos archivos existan en tu disco, la memoria funcionará en cualquier proyecto donde copies la carpeta `.agent`.

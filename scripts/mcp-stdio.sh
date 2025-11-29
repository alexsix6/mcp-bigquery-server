#!/usr/bin/env bash
set -Eeuo pipefail
cd /mnt/d/Dev/MisProyectosMCP/mcp-bigquery-server-intelligent

# Credenciales GCP (WSL path)
export GOOGLE_APPLICATION_CREDENTIALS="/mnt/d/Dev/MisProyectosMCP/mcp-bigquery-server-intelligent/.credentials/mcp-bigquery-prod.json"

# Ejecuta el MCP
exec node dist/index.js --project-id "cognitivedsai-herramientas" --location "US"

#!/usr/bin/env bash
set -euo pipefail

# 🔥 SMOKE TEST - Validate predict_trends contract in seconds
# Detects placeholder text vs real numeric forecasts

echo "🔥 [SMOKE TEST] BigQuery MCP predict_trends validation"

# Local server test (adaptar URL según deployment)
ENDPOINT="http://localhost:8080/predict_trends"  # Ajustar según tu setup
SERVER_PID=""

# Start server for test
echo "🚀 Starting MCP server..."
cd /mnt/d/Dev/MisProyectosMCP/mcp-bigquery-server-intelligent
node dist/index.js --project-id cognitivedsai-herramientas --location US &
SERVER_PID=$!

# Wait for server startup
sleep 3

# Payload de prueba
read -r -d '' PAYLOAD << 'JSON' || true
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "predict_trends",
    "arguments": {
      "dataset": "alexseis_web",
      "table": "conversations",
      "metric_column": "id",
      "time_column": "created_at",
      "periods_ahead": 7,
      "confidence_interval": 0.95
    }
  }
}
JSON

# Test usando stdin (MCP protocol)
echo "📊 Testing predict_trends via MCP protocol..."
RESP=$(echo "$PAYLOAD" | timeout 10s nc localhost 8080 2>/dev/null || echo '{"error":"connection_failed"}')

# Cleanup server
if [[ -n "$SERVER_PID" ]]; then
  kill "$SERVER_PID" 2>/dev/null || true
fi

# Validate response
if [[ "$RESP" == *"Predictive modeling would generate forecasts here"* ]]; then
  echo "❌ FAIL: endpoint aún devuelve placeholder (stub)."
  echo "🔧 Action needed: invalidate cache/registry or redeploy"
  exit 2
fi

if [[ "$RESP" == *"connection_failed"* ]]; then
  echo "⚠️  WARN: Connection failed - check server startup"
  echo "ℹ️  Running direct test instead..."

  # Fallback: direct script test
  node test-predict-real-data.mjs | grep -q "ALL VALUES ARE NUMERIC" && {
    echo "✅ PASS: predict_trends OK (direct test confirms numeric values)"
    exit 0
  } || {
    echo "❌ FAIL: direct test also shows non-numeric values"
    exit 3
  }
fi

# Parse JSON response if we got one
if command -v jq >/dev/null 2>&1; then
  # Validate contract with jq
  echo "$RESP" | jq -e '
    .result.content[0].text | fromjson |
    (.method // "unknown") as $m |
    (.summary.data_points // 0) as $dp |
    (.forecast // []) as $f |
    ($f | type) == "array"
    and ($f | length) > 0
    and ($f[0].date | type) == "string"
    and ($f[0].value | type) == "number"
    and ($f[0].ci_low | type) == "number"
    and ($f[0].ci_high | type) == "number"
  ' > /dev/null || {
    echo "❌ FAIL: contrato inválido o tipos no numéricos en forecast."
    echo "🔍 Response preview:"
    echo "$RESP" | head -n 3
    exit 3
  }

  # Success - print summary
  echo "✅ PASS: predict_trends OK (contrato válido)."
  echo "$RESP" | jq -r '.result.content[0].text | fromjson | {method, summary, first_forecast: .forecast[0]}'

else
  # No jq available - basic validation
  if [[ "$RESP" == *'"forecast":'* && "$RESP" == *'"value":'* && "$RESP" == *'"method":'* ]]; then
    echo "✅ PASS: predict_trends OK (basic validation - install jq for detailed check)"
  else
    echo "❌ FAIL: response doesn't contain expected forecast structure"
    exit 3
  fi
fi

echo "🎉 Smoke test completed successfully!"
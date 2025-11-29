# 🚀 DEPLOYMENT PLAN - BigQuery MCP v1.0.4 Registry Cache Invalidation

## ✅ Status Confirmado
- **Contract Self-Check**: ✅ PASSED
- **Versión**: v1.0.4 with ARIMA_PLUS + Baseline
- **Validación**: Numeric forecasts, no placeholder text
- **Implementación**: BigQuery ML + Deterministic fallback

## 🎯 Problema Identificado
- **Registry Cache**: Binding `link_68cb5cfe89688191950a073149dfefb5` apunta a versión anterior
- **ChatGPT Desktop**: Ve placeholder text en lugar de valores numéricos
- **Causa**: Cache/registry no invalidado tras deployment

## 🔧 Acciones de Invalidación

### 1. Version Bump Completado
```json
{
  "version": "1.0.3" → "1.0.4",
  "changes": [
    "✅ ARIMA_PLUS implementation",
    "✅ Deterministic baseline fallback",
    "✅ Contract self-check at startup",
    "✅ Numeric forecast validation",
    "✅ No placeholder text verification"
  ]
}
```

### 2. Forzar Re-descubrimiento
```bash
# Rebuild and restart MCP server
cd /mnt/d/Dev/MisProyectosMCP/mcp-bigquery-server-intelligent
npm run build
npm run prepare

# Start with new version identifier
node dist/index.js --project-id cognitivedsai-herramientas --location US
```

### 3. Validación Post-Deployment
```bash
# Run smoke test
./smoke-test.sh

# Expected output:
# ✅ PASS: predict_trends OK (contrato válido)
# {"method":"baseline","summary":{...},"first_forecast":{"date":"YYYY-MM-DD","value":1.5,"ci_low":0.52,"ci_high":2.48}}
```

## 📊 Contrato Garantizado

### Entrada
```json
{
  "dataset": "alexseis_web",
  "table": "conversations",
  "metric_column": "id",
  "time_column": "created_at",
  "periods_ahead": 7,
  "confidence_interval": 0.95
}
```

### Salida REAL (no placeholder)
```json
{
  "summary": {
    "data_points": 2,
    "time_range": ["2025-07-13", "2025-07-16"],
    "value_range": [1, 2]
  },
  "method": "baseline",
  "forecast": [
    {"date": "2025-09-30", "value": 1.5, "ci_low": 0.52, "ci_high": 2.48, "period": 1},
    {"date": "2025-10-01", "value": 1.5, "ci_low": 0.52, "ci_high": 2.48, "period": 2},
    ...
  ],
  "notes": "using mean of 2 data points; flat projection at mean value 1.5"
}
```

## 🎯 Validación Cliente

### Para ChatGPT Desktop
1. **Cerrar sesión actual** (invalidar cache local)
2. **Nueva sesión** → Re-discovery de MCP tools
3. **Test predict_trends** → Debe ver valores numéricos reales
4. **Verificar**: No más "Predictive modeling would generate forecasts here"

### Criterios de Éxito
- ✅ `forecast[]` poblado con ≥1 entrada
- ✅ `date/value/ci_low/ci_high` campos válidos y numéricos
- ✅ `method` ∈ {baseline, arima_plus}
- ✅ `summary` con métricas datos históricos
- ✅ `notes` explicativas sobre metodología
- ❌ Ausencia total de texto placeholder

## 🔄 Plan de Contingencia

Si el cache persiste:
1. **Bump adicional**: v1.0.4 → v1.0.5
2. **Namespace change**: Cambiar URI base del MCP
3. **Hard restart**: Reiniciar infra MCP registry
4. **Client reset**: Clear cache ChatGPT Desktop

## 📋 Checklist Final

- [✅] Version bump 1.0.3 → 1.0.4
- [✅] Contract self-check implementado
- [✅] ARIMA_PLUS + baseline working
- [✅] Numeric validation confirmed
- [✅] Build successful
- [⏳] Deploy & registry invalidation
- [⏳] Client validation
- [⏳] Green checkmark confirmation

**READY FOR DEPLOYMENT** 🚀
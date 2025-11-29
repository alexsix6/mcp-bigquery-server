# BigQuery MCP - Client Setup Template

## Deployment Checklist

### Pre-Deployment

- [ ] Obtain GCP Project ID from client
- [ ] Request Service Account JSON with BigQuery permissions
- [ ] Identify main datasets and tables
- [ ] Understand business terminology and metrics

### Configuration

- [ ] Run `./scripts/setup-client.sh <client-name>`
- [ ] Edit `business-context.json` with correct settings
- [ ] Copy `.env.template` to `.env` and configure
- [ ] Test connection locally

### Integration

- [ ] Configure Claude Desktop config
- [ ] Test all query templates
- [ ] Verify semantic search works

## Testing Checklist

1. Connection Test: "Que tablas hay disponibles?"
2. Query Template: Use each configured term
3. Table Alias: "Muestrame las ventas"
4. Date Filter: "Ventas de este mes"

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection failed | Verify Service Account permissions |
| Template not found | Check term matches in business-context.json |
| Query timeout | Add LIMIT clause |


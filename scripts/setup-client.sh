#!/bin/bash
# ============================================================================
# BigQuery MCP - Client Setup Script
# Creates standardized client configuration folder
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          BigQuery MCP - Client Setup Script                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"

# Get client name
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: ./setup-client.sh <client-name>${NC}"
    echo -e "Example: ./setup-client.sh acme-corp"
    exit 1
fi

CLIENT_NAME="$1"
CLIENT_DIR="clients/${CLIENT_NAME}"

echo -e "\n${GREEN}Creating client folder: ${CLIENT_DIR}${NC}"

# Create directory structure
mkdir -p "${CLIENT_DIR}"

# Create business-context.json
cat > "${CLIENT_DIR}/business-context.json" << 'EOF'
{
  "clientName": "CLIENT_NAME_PLACEHOLDER",
  "projectId": "YOUR_GCP_PROJECT_ID",
  "industry": "analytics",
  "language": "es",
  
  "queryTemplates": {
    "ejemplo query": {
      "description": "Descripción de la consulta",
      "sql": "SELECT * FROM `project.dataset.table` LIMIT 100",
      "tags": ["ejemplo"]
    }
  },
  
  "tableAliases": {
    "ventas": "dataset.sales",
    "productos": "dataset.products",
    "clientes": "dataset.customers"
  },
  
  "columnAliases": {},
  "keyColumns": {},
  
  "commonFilters": {
    "hoy": "_PARTITIONTIME >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)",
    "este mes": "_PARTITIONTIME >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)",
    "últimos 30 días": "_PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)"
  },
  
  "dateColumns": {}
}
EOF

# Replace placeholder with actual client name
sed -i "s/CLIENT_NAME_PLACEHOLDER/${CLIENT_NAME}/g" "${CLIENT_DIR}/business-context.json"

# Create .env template
cat > "${CLIENT_DIR}/.env.template" << 'EOF'
# ============================================================================
# BigQuery MCP Configuration - CLIENT_NAME
# ============================================================================

# GCP Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# BigQuery Configuration
BQ_LOCATION=US
BQ_MAX_BYTES_BILLED=10737418240

# MCP Configuration
BUSINESS_CONTEXT_PATH=./clients/CLIENT_DIR/business-context.json

# Optional: ML Forecasting (requires Vertex AI)
ENABLE_FORECASTING=false
EOF

sed -i "s/CLIENT_NAME/${CLIENT_NAME}/g" "${CLIENT_DIR}/.env.template"
sed -i "s/CLIENT_DIR/${CLIENT_NAME}/g" "${CLIENT_DIR}/.env.template"

# Create Claude Desktop config snippet
cat > "${CLIENT_DIR}/claude-desktop-config.json" << EOF
{
  "mcpServers": {
    "bigquery-${CLIENT_NAME}": {
      "command": "node",
      "args": ["/path/to/mcp-bigquery-server-intelligent/dist/index.js"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json",
        "BUSINESS_CONTEXT_PATH": "./clients/${CLIENT_NAME}/business-context.json"
      }
    }
  }
}
EOF

# Create README for this client
cat > "${CLIENT_DIR}/README.md" << EOF
# ${CLIENT_NAME} - BigQuery MCP Configuration

## Setup Steps

1. **Edit business-context.json**
   - Replace \`YOUR_GCP_PROJECT_ID\` with actual project ID
   - Add your query templates
   - Configure table aliases
   - Set up common filters

2. **Configure Environment**
   - Copy \`.env.template\` to \`.env\`
   - Update all values

3. **Update Claude Desktop**
   - Add the contents of \`claude-desktop-config.json\` to your Claude config
   - Restart Claude Desktop

## Query Templates

Add query templates in \`business-context.json\`:

\`\`\`json
{
  "queryTemplates": {
    "ventas del mes": {
      "description": "Ventas totales del mes actual",
      "sql": "SELECT SUM(amount) FROM \\\`project.dataset.sales\\\` WHERE date >= DATE_TRUNC(CURRENT_DATE(), MONTH)"
    }
  }
}
\`\`\`

## Using in Claude

Once configured, you can ask:
- "ventas del mes"
- "lista las consultas disponibles"
- "muestra los clientes activos"
EOF

echo -e "${GREEN}✓ Created: ${CLIENT_DIR}/business-context.json${NC}"
echo -e "${GREEN}✓ Created: ${CLIENT_DIR}/.env.template${NC}"
echo -e "${GREEN}✓ Created: ${CLIENT_DIR}/claude-desktop-config.json${NC}"
echo -e "${GREEN}✓ Created: ${CLIENT_DIR}/README.md${NC}"

echo -e "\n${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Client setup complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Edit ${CLIENT_DIR}/business-context.json with client's query templates"
echo -e "2. Configure ${CLIENT_DIR}/.env.template with GCP credentials"
echo -e "3. Add Claude config from ${CLIENT_DIR}/claude-desktop-config.json"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"


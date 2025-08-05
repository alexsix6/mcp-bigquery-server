import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';

async function testMCPTools() {
  console.log('🧪 TESTING HERRAMIENTAS MCP EN CONTEXTO CLAUDE DESKTOP\n');
  
  // Simular cómo Claude Desktop invoca las herramientas
  const serverProcess = spawn('node', [
    'dist/index.js', 
    '--project-id', 'cognitivedsai-herramientas',
    '--location', 'US'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: undefined }
  });
  
  // Test 1: query tool
  console.log('🔍 Testing: bigquery:query tool');
  const queryTest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'bigquery:query',
      arguments: {
        query: 'SELECT 1 as test_connection'
      }
    }
  };
  
  // Test 2: explore tool  
  console.log('🔍 Testing: bigquery:explore tool');
  const exploreTest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'bigquery:explore',
      arguments: {
        dataset: 'Seguridad_data'
      }
    }
  };
  
  // Test 3: refresh tool
  console.log('🔍 Testing: bigquery:refresh tool');
  const refreshTest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'bigquery:refresh',
      arguments: {}
    }
  };
  
  // Enviar tests y capturar respuestas
  serverProcess.stdin.write(JSON.stringify(queryTest) + '\n');
  serverProcess.stdin.write(JSON.stringify(exploreTest) + '\n');
  serverProcess.stdin.write(JSON.stringify(refreshTest) + '\n');
  
  serverProcess.stdout.on('data', (data) => {
    console.log('📤 Server Response:', data.toString());
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log('❌ Server Error:', data.toString());
  });
  
  setTimeout(() => {
    serverProcess.kill();
    console.log('\n✅ Test completed');
  }, 5000);
}

testMCPTools();

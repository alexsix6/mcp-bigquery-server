import { spawn } from 'child_process';

async function checkRegisteredTools() {
  console.log('🔍 VERIFICANDO HERRAMIENTAS REGISTRADAS\n');
  
  const serverProcess = spawn('node', [
    'dist/index.js', 
    '--project-id', 'cognitivedsai-herramientas',
    '--location', 'US'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Solicitar lista de herramientas disponibles
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };
  
  console.log('📋 Solicitando lista de herramientas...');
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  
  serverProcess.stdout.on('data', (data) => {
    console.log('📤 Tools Response:', data.toString());
  });
  
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('🧠') && !output.includes('✅')) {
      console.log('❌ Server Error:', output);
    }
  });
  
  setTimeout(() => {
    serverProcess.kill();
    console.log('\n✅ Check completed');
  }, 3000);
}

checkRegisteredTools();

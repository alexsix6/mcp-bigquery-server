import { spawn } from 'child_process';

async function testCorrectToolNames() {
  console.log('🧪 TESTING CON NOMBRES CORRECTOS DE HERRAMIENTAS\n');
  
  const serverProcess = spawn('node', [
    'dist/index.js', 
    '--project-id', 'cognitivedsai-herramientas',
    '--location', 'US'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Test con nombres sin prefijo
  const tests = [
    {
      name: 'query',
      params: { sql: 'SELECT 1 as test' }
    },
    {
      name: 'explore', 
      params: { dataset: 'Seguridad_data' }
    },
    {
      name: 'refresh',
      params: {}
    }
  ];
  
  tests.forEach((test, index) => {
    const request = {
      jsonrpc: '2.0',
      id: index + 1,
      method: 'tools/call',
      params: {
        name: test.name,
        arguments: test.params
      }
    };
    
    console.log(`🔍 Testing: ${test.name}`);
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log('📤 Response:', data.toString());
  });
  
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('🧠') && !output.includes('✅')) {
      console.log('❌ Error:', output);
    }
  });
  
  setTimeout(() => {
    serverProcess.kill();
    console.log('\n✅ Test completed');
  }, 5000);
}

testCorrectToolNames();

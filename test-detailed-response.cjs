const { spawn } = require('child_process');

console.log('=== TESTING DETAILED RESPONSE CAPTURE ===');

const server = spawn('node', ['dist/index.js', '--project-id', 'cognitivedsai-herramientas', '--location', 'US'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '.credentials/mcp-bigquery-prod.json' }
});

let responseReceived = false;

// Capture stderr (logs)
server.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('🔍 STDERR:', output.trim());
});

// Capture stdout (JSON responses)
server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('📤 STDOUT RESPONSE:');
  console.log(output);
  responseReceived = true;
});

// Wait for server to be ready, then send query
setTimeout(() => {
  console.log('📨 Sending query to server...');
  const query = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { 
      name: 'query', 
      arguments: { 
        sql: 'SELECT * FROM `cognitivedsai-herramientas.Seguridad_data.Camaras` LIMIT 5' 
      } 
    }
  };
  server.stdin.write(JSON.stringify(query) + '\n');
}, 3000);

// Kill after timeout
setTimeout(() => {
  if (!responseReceived) {
    console.log('❌ No response received after 10 seconds');
  }
  server.kill();
}, 10000);

server.on('close', (code) => {
  console.log('🔚 Server process ended with code:', code);
});

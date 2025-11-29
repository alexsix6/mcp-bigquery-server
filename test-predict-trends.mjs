#!/usr/bin/env node

/**
 * Test específico para verificar que predict_trends está disponible y funciona
 */

import { spawn } from 'child_process';

console.log('🔮 TESTING PREDICT_TRENDS FUNCTIONALITY');

// Test 1: Verificar que la herramienta está disponible
console.log('\n📋 Test 1: Verificando que predict_trends está en la lista de herramientas...');

const child = spawn('node', ['dist/index.js', '--project-id', 'cognitivedsai-herramientas', '--location', 'US'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Request para listar herramientas
const listToolsRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list"
};

child.stdin.write(JSON.stringify(listToolsRequest) + '\n');

let output = '';
child.stdout.on('data', (data) => {
  output += data.toString();

  try {
    const response = JSON.parse(output);
    if (response.result && response.result.tools) {
      console.log(`✅ Herramientas encontradas: ${response.result.tools.length}`);

      const toolNames = response.result.tools.map(tool => tool.name);
      console.log('📝 Herramientas disponibles:', toolNames);

      if (toolNames.includes('predict_trends')) {
        console.log('🎯 ✅ predict_trends está disponible!');

        // Test 2: Probar la función predict_trends
        console.log('\n🔮 Test 2: Probando predict_trends...');

        const predictRequest = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "predict_trends",
            arguments: {
              dataset: "Seguridad_data",
              table: "vehiculos",
              metric_column: "id",
              time_column: "fecha_registro",
              periods_ahead: 6,
              confidence_interval: 0.95
            }
          }
        };

        child.stdin.write(JSON.stringify(predictRequest) + '\n');

        setTimeout(() => {
          child.kill();
          console.log('✅ Test completado');
        }, 2000);

      } else {
        console.log('❌ predict_trends NO está disponible');
        child.kill();
      }
    }
  } catch (e) {
    // Ignoring parsing errors for partial responses
  }
});

child.stderr.on('data', (data) => {
  const message = data.toString();
  if (message.includes('predict_trends')) {
    console.log('🔍 Detectado predict_trends en logs:', message.trim());
  }
});

child.on('close', (code) => {
  console.log(`📤 Proceso terminado con código: ${code}`);
});

// Timeout para evitar que se cuelgue
setTimeout(() => {
  child.kill();
  console.log('⏰ Test timeout');
}, 10000);
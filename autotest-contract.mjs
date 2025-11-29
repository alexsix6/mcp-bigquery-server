#!/usr/bin/env node

/**
 * AUTOTEST DE CONTRATO - Self-check al iniciar servidor
 * Valida que predict_trends cumple contrato nuevo (valores numéricos, no placeholder)
 */

import { spawn } from 'child_process';

export async function runContractTest() {
  console.log('🔬 [AUTOTEST] Running contract validation...');

  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/index.js', '--project-id', 'cognitivedsai-herramientas', '--location', 'US'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let testPassed = false;

    const predictRequest = {
      jsonrpc: "2.0",
      id: 999,
      method: "tools/call",
      params: {
        name: "predict_trends",
        arguments: {
          dataset: "alexseis_web",
          table: "conversations",
          metric_column: "id",
          time_column: "created_at",
          periods_ahead: 3,
          confidence_interval: 0.95
        }
      }
    };

    child.stdout.on('data', (data) => {
      output += data.toString();

      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim() && line.includes('"result"')) {
          try {
            const response = JSON.parse(line);
            if (response.result && response.result.content) {
              const content = JSON.parse(response.result.content[0].text);

              // VALIDACIONES CRÍTICAS DEL CONTRATO
              const validationResults = {
                hasMethod: !!content.method,
                methodValid: ['baseline', 'arima_plus'].includes(content.method),
                hasForecast: Array.isArray(content.forecast),
                forecastNotEmpty: content.forecast && content.forecast.length > 0,
                firstForecastValid: content.forecast && content.forecast[0] &&
                  typeof content.forecast[0].value === 'number' &&
                  typeof content.forecast[0].ci_low === 'number' &&
                  typeof content.forecast[0].ci_high === 'number' &&
                  typeof content.forecast[0].date === 'string',
                noPlaceholderText: !JSON.stringify(content).includes('Predictive modeling would generate forecasts here')
              };

              const allPassed = Object.values(validationResults).every(v => v === true);

              if (allPassed) {
                console.log('✅ [AUTOTEST] Contract validation PASSED');
                console.log(`   Method: ${content.method}`);
                console.log(`   Forecast entries: ${content.forecast.length}`);
                console.log(`   First forecast: {date: "${content.forecast[0].date}", value: ${content.forecast[0].value}}`);
                testPassed = true;
                child.kill();
                resolve(true);
              } else {
                console.log('❌ [AUTOTEST] Contract validation FAILED:');
                Object.entries(validationResults).forEach(([test, passed]) => {
                  console.log(`   ${test}: ${passed ? '✅' : '❌'}`);
                });
                child.kill();
                reject(new Error('Contract validation failed'));
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      // Silent stderr unless we need debugging
    });

    child.on('close', (code) => {
      if (!testPassed) {
        reject(new Error('Contract test did not complete successfully'));
      }
    });

    // Send test request after server initializes
    setTimeout(() => {
      child.stdin.write(JSON.stringify(predictRequest) + '\n');
    }, 3000);

    // Timeout
    setTimeout(() => {
      if (!testPassed) {
        child.kill();
        reject(new Error('Contract test timeout'));
      }
    }, 10000);
  });
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runContractTest()
    .then(() => {
      console.log('🎉 [AUTOTEST] All contract validations passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 [AUTOTEST] Contract validation failed:', error.message);
      process.exit(1);
    });
}
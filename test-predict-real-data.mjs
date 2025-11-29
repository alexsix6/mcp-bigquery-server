#!/usr/bin/env node

/**
 * Test predict_trends with REAL alexseis_web.conversations data
 * Should return numeric forecasts, not placeholder text
 */

import { spawn } from 'child_process';

console.log('🔮 TESTING PREDICT_TRENDS WITH REAL DATA - alexseis_web.conversations');

const child = spawn('node', ['dist/index.js', '--project-id', 'cognitivedsai-herramientas', '--location', 'US'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let responseReceived = false;

// Test con datos reales de alexseis_web.conversations
const predictRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "predict_trends",
    arguments: {
      dataset: "alexseis_web",
      table: "conversations",
      metric_column: "id", // Using ID as metric (count-based analysis)
      time_column: "created_at",
      periods_ahead: 7,
      confidence_interval: 0.95
    }
  }
};

console.log('\n📊 Sending predict_trends request for alexseis_web.conversations...');
console.log('📝 Parameters:');
console.log('   Dataset: alexseis_web');
console.log('   Table: conversations');
console.log('   Metric: id (count-based)');
console.log('   Time: created_at');
console.log('   Periods: 7 days ahead');
console.log('   Confidence: 95%');

child.stdout.on('data', (data) => {
  output += data.toString();

  // Try to parse JSON response
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.trim() && line.includes('"result"')) {
      try {
        const response = JSON.parse(line);
        if (response.result && response.result.content) {
          const content = JSON.parse(response.result.content[0].text);

          console.log('\n🎯 RESPONSE ANALYSIS:');
          console.log('✅ Received structured response');

          if (content.forecast && Array.isArray(content.forecast)) {
            console.log(`✅ Forecast array found with ${content.forecast.length} entries`);

            if (content.forecast.length > 0) {
              const firstForecast = content.forecast[0];

              console.log('\n📈 FORECAST VALIDATION:');
              console.log(`   Date: ${firstForecast.date}`);
              console.log(`   Value: ${firstForecast.value}`);
              console.log(`   CI Low: ${firstForecast.ci_low}`);
              console.log(`   CI High: ${firstForecast.ci_high}`);

              // Check if values are numeric
              if (typeof firstForecast.value === 'number' &&
                  typeof firstForecast.ci_low === 'number' &&
                  typeof firstForecast.ci_high === 'number') {
                console.log('✅ ALL VALUES ARE NUMERIC - SUCCESS!');
                console.log('🎉 PROBLEM FIXED: No more placeholder text');
              } else {
                console.log('❌ Values are not numeric - still has placeholder issue');
              }

              console.log('\n📊 SUMMARY:');
              console.log(`   Method: ${content.method}`);
              console.log(`   Data points: ${content.summary?.data_points}`);
              console.log(`   Notes: ${content.notes}`);

            } else {
              console.log('❌ Forecast array is empty');
            }
          } else {
            console.log('❌ No forecast array found in response');
          }

          responseReceived = true;
          child.kill();
        }
      } catch (e) {
        // Ignore JSON parsing errors for partial responses
      }
    }
  }
});

child.stderr.on('data', (data) => {
  const message = data.toString();
  if (message.includes('predict_trends') || message.includes('ARIMA') || message.includes('baseline')) {
    console.log('🔍 Server log:', message.trim());
  }
});

child.on('close', (code) => {
  if (!responseReceived) {
    console.log('❌ No valid response received');
  }
  console.log(`\n📤 Process finished with code: ${code}`);
});

// Send the request after a short delay
setTimeout(() => {
  child.stdin.write(JSON.stringify(predictRequest) + '\n');
}, 2000);

// Timeout
setTimeout(() => {
  if (!responseReceived) {
    console.log('⏰ Test timeout - killing process');
  }
  child.kill();
}, 15000);
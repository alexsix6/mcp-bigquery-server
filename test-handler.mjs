#!/usr/bin/env node

// Test específico del handler MCP
import { SemanticAnalyzer } from './dist/semantic-analyzer.js';

console.log('🧪 TESTING MCP HANDLER FLOW...');

// Simular el flujo exacto del handler
function simulateMCPHandler(sql) {
  console.log('\n🔄 SIMULATING MCP HANDLER FLOW:');
  console.log(`   Input SQL: ${sql.substring(0, 50)}...`);
  
  try {
    // 1. Validación READ-ONLY (igual que en el código real)
    console.log('✅ Step 1: Read-only validation');
    const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|MERGE|TRUNCATE|GRANT|REVOKE|EXECUTE|BEGIN|COMMIT|ROLLBACK)\b/i;
    if (forbiddenPattern.test(sql)) {
      throw new Error('Only READ operations are allowed');
    }
    
    // 2. Análisis semántico (igual que en el código real)
    console.log('🧠 Step 2: Starting semantic analysis...');
    const semanticAnalysis = SemanticAnalyzer.analyzeQuery(sql);
    console.log('✅ Step 2: Semantic analysis completed');
    
    // 3. Logging (igual que en el código real)
    console.log('📊 Step 3: Logging analysis results...');
    console.log(`   Semantic Analysis: ${semanticAnalysis.intentRecognition.queryType} query`, {
      complexity: semanticAnalysis.intentRecognition.complexity,
      riskLevel: semanticAnalysis.costPrediction.riskLevel,
      estimatedCost: semanticAnalysis.costPrediction.estimatedCost
    });
    
    // 4. Warning check (igual que en el código real)
    console.log('⚠️  Step 4: Checking for warnings...');
    if (SemanticAnalyzer.shouldWarnUser(semanticAnalysis)) {
      console.log('🚨 HIGH-RISK QUERY DETECTED:', {
        riskLevel: semanticAnalysis.costPrediction.riskLevel,
        warning: semanticAnalysis.costPrediction.warning,
        suggestions: semanticAnalysis.optimizationSuggestions.slice(0, 2)
      });
    } else {
      console.log('   No warnings needed');
    }
    
    console.log('✅ Handler simulation completed successfully');
    return true;
    
  } catch (error) {
    console.log('❌ Handler simulation failed:', error.message);
    console.log('Stack:', error.stack);
    return false;
  }
}

// Test con la query real
const testQuery = 'SELECT * FROM `cognitivedsai-herramientas.Seguridad_data.Camaras`';
const success = simulateMCPHandler(testQuery);

console.log('\n🎯 RESULTADO DEL TEST:');
if (success) {
  console.log('✅ Handler simulation: SUCCESS');
  console.log('🔍 CONCLUSIÓN: El problema NO está en el handler logic');
  console.log('💡 INVESTIGAR: ¿Por qué el handler no se ejecuta en el servidor real?');
} else {
  console.log('❌ Handler simulation: FAILED');
  console.log('🔍 CONCLUSIÓN: Hay un problema en el handler logic');
} 
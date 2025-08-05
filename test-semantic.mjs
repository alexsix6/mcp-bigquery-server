#!/usr/bin/env node

// Test específico del análisis semántico
import { SemanticAnalyzer } from './dist/semantic-analyzer.js';

console.log('🧪 TESTING SEMANTIC ANALYSIS...');

// Test 1: Import básico
try {
  console.log('✅ SemanticAnalyzer imported successfully');
  console.log('📋 Available methods:', Object.getOwnPropertyNames(SemanticAnalyzer));
} catch (error) {
  console.log('❌ Import failed:', error.message);
  process.exit(1);
}

// Test 2: Query de alto riesgo
const highRiskQuery = 'SELECT * FROM `cognitivedsai-herramientas.Seguridad_data.Camaras`';

try {
  console.log('\n🔍 Testing high-risk query...');
  const analysis = SemanticAnalyzer.analyzeQuery(highRiskQuery);
  
  console.log('✅ Analysis completed:');
  console.log('   Query type:', analysis.intentRecognition.queryType);
  console.log('   Complexity:', analysis.intentRecognition.complexity);
  console.log('   Risk level:', analysis.costPrediction.riskLevel);
  console.log('   Estimated cost:', analysis.costPrediction.estimatedCost);
  
  // Test 3: Warning detection
  const shouldWarn = SemanticAnalyzer.shouldWarnUser(analysis);
  console.log('   Should warn user:', shouldWarn);
  
  if (shouldWarn) {
    console.log('⚠️  WARNING DETECTED:');
    console.log('   Risk level:', analysis.costPrediction.riskLevel);
    console.log('   Warning message:', analysis.costPrediction.warning);
    console.log('   Suggestions:', analysis.optimizationSuggestions.slice(0, 2));
  }
  
} catch (error) {
  console.log('❌ Analysis failed:', error.message);
  console.log('Stack:', error.stack);
}

console.log('\n🎯 EXPECTED IN PRODUCTION:');
console.log('   - Should see "Semantic Analysis: exploratory query"');
console.log('   - Should see "High-risk query detected" warning');
console.log('   - Risk level should be "critical" or "high"'); 
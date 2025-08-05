import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';

async function diagnoseAuthentication() {
  console.log('🔍 DIAGNÓSTICO DE AUTENTICACIÓN Y CONECTIVIDAD\n');
  
  // Verificar configuración de credenciales
  const credentialMethods = [
    'GOOGLE_APPLICATION_CREDENTIALS env var',
    'gcloud default credentials', 
    'service account key'
  ];
  
  console.log('📋 Métodos de autenticación disponibles:');
  console.log(`   GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || '❌ No configurado'}`);
  
  try {
    const bigquery = new BigQuery({ 
      projectId: 'cognitivedsai-herramientas',
      // Forzar re-autenticación
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    console.log('\n🔄 Probando autenticación...');
    
    // Test 1: Verificar proyecto
    const [job] = await bigquery.createQueryJob({
      query: 'SELECT 1 as test_connection',
      dryRun: true
    });
    console.log('✅ Test de autenticación básica: EXITOSO');
    
    // Test 2: Listar datasets (requiere permisos)
    const [datasets] = await bigquery.getDatasets();
    console.log(`✅ Acceso a datasets: ${datasets.length} encontrados`);
    
    // Test 3: Verificar metadata de tablas problemáticas
    console.log('\n🔍 Analizando tablas con posibles schemas nulos...');
    
    let problematicTables = 0;
    let totalTables = 0;
    
    for (const dataset of datasets.slice(0, 2)) {
      console.log(`\n📊 Dataset: ${dataset.id}`);
      
      try {
        const [tables] = await dataset.getTables();
        console.log(`   📋 Tablas: ${tables.length}`);
        
        for (const table of tables.slice(0, 3)) {
          totalTables++;
          try {
            const [metadata] = await table.getMetadata();
            const hasValidSchema = metadata.schema && 
                                 metadata.schema.fields && 
                                 Array.isArray(metadata.schema.fields) &&
                                 metadata.schema.fields.length > 0;
            
            if (!hasValidSchema) {
              problematicTables++;
              console.log(`   🚨 PROBLEMA: ${table.id} - Schema: ${JSON.stringify(metadata.schema)}`);
            } else {
              console.log(`   ✅ OK: ${table.id} - Campos: ${metadata.schema.fields.length}`);
            }
            
          } catch (metaError) {
            problematicTables++;
            console.log(`   ❌ ERROR metadata ${table.id}: ${metaError.message}`);
          }
        }
      } catch (tablesError) {
        console.log(`   ❌ ERROR acceso tablas: ${tablesError.message}`);
      }
    }
    
    console.log(`\n📊 RESUMEN:`);
    console.log(`   Total tablas analizadas: ${totalTables}`);
    console.log(`   Tablas problemáticas: ${problematicTables}`);
    console.log(`   Porcentaje de problemas: ${((problematicTables/totalTables)*100).toFixed(1)}%`);
    
  } catch (error) {
    console.log(`❌ ERROR CRÍTICO DE AUTENTICACIÓN:`);
    console.log(`   Mensaje: ${error.message}`);
    console.log(`   Código: ${error.code || 'N/A'}`);
    console.log(`   Stack: ${error.stack?.split('\n')[1] || 'N/A'}`);
    
    // Sugerencias de solución
    console.log(`\n💡 POSIBLES SOLUCIONES:`);
    console.log(`   1. Verificar credenciales: gcloud auth list`);
    console.log(`   2. Re-autenticar: gcloud auth application-default login`);
    console.log(`   3. Verificar permisos del service account`);
    console.log(`   4. Comprobar variable GOOGLE_APPLICATION_CREDENTIALS`);
  }
}

diagnoseAuthentication();

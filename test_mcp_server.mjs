import { BigQuery } from '@google-cloud/bigquery';

// Simular las funciones problemáticas que identificaste
async function testProblematicFunctions() {
  console.log('🧪 TESTING FUNCIONES PROBLEMÁTICAS EN CONTEXTO MCP\n');
  
  const bigquery = new BigQuery({ projectId: 'cognitivedsai-herramientas' });
  
  try {
    const [datasets] = await bigquery.getDatasets();
    
    for (const dataset of datasets) {
      const [tables] = await dataset.getTables();
      
      for (const table of tables.slice(0, 2)) {
        console.log(`\n🔍 Testing: ${dataset.id}.${table.id}`);
        
        // TEST 1: Línea 326/660 - metadata.schema.fields
        try {
          const [metadata] = await table.getMetadata();
          console.log(`   metadata exists: ${!!metadata}`);
          console.log(`   metadata.schema exists: ${!!metadata.schema}`);
          console.log(`   metadata.schema type: ${typeof metadata.schema}`);
          
          if (metadata.schema) {
            console.log(`   metadata.schema.fields exists: ${!!metadata.schema.fields}`);
            console.log(`   metadata.schema.fields type: ${typeof metadata.schema.fields}`);
            console.log(`   metadata.schema.fields is Array: ${Array.isArray(metadata.schema.fields)}`);
            
            // SIMULANDO LÍNEA 326: schema: metadata.schema.fields
            try {
              const testSchema = metadata.schema.fields;
              console.log(`   ✅ metadata.schema.fields access: OK (${testSchema?.length} fields)`);
            } catch (err) {
              console.log(`   ❌ metadata.schema.fields access FAILED: ${err.message}`);
            }
          }
          
          // TEST 2: Línea 497 - table.schema.forEach  
          // Necesitamos simular cómo se obtiene table.schema en el caché
          if (metadata.schema && metadata.schema.fields) {
            try {
              metadata.schema.fields.forEach(field => {
                // Simular el procesamiento
              });
              console.log(`   ✅ schema.forEach: OK`);
            } catch (err) {
              console.log(`   ❌ schema.forEach FAILED: ${err.message}`);
            }
            
            // TEST 3: Línea 760 - table.schema.length
            try {
              const length = metadata.schema.fields.length;
              console.log(`   ✅ schema.length: OK (${length})`);
            } catch (err) {
              console.log(`   ❌ schema.length FAILED: ${err.message}`);
            }
          }
          
        } catch (metaError) {
          console.log(`   ❌ getMetadata FAILED: ${metaError.message}`);
        }
      }
    }
    
  } catch (error) {
    console.log(`❌ CRITICAL ERROR: ${error.message}`);
    console.log(`Error code: ${error.code}`);
    console.log(`Error stack: ${error.stack?.split('\n')[0]}`);
  }
}

testProblematicFunctions();

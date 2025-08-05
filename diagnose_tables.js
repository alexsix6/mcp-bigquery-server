const { BigQuery } = require('@google-cloud/bigquery');

async function diagnoseTables() {
  const bigquery = new BigQuery({ projectId: 'cognitivedsai-herramientas' });
  
  try {
    const [datasets] = await bigquery.getDatasets();
    console.log(`📊 Analizando ${datasets.length} datasets...`);
    
    for (const dataset of datasets.slice(0, 3)) { // Solo los primeros 3 para no sobrecargar
      console.log(`\n🔍 Dataset: ${dataset.id}`);
      
      try {
        const [tables] = await dataset.getTables();
        console.log(`  📋 Tablas encontradas: ${tables.length}`);
        
        for (const table of tables.slice(0, 2)) { // Solo las primeras 2 tablas
          try {
            const [metadata] = await table.getMetadata();
            const hasSchema = metadata.schema && metadata.schema.fields;
            console.log(`    📄 ${table.id}: schema=${hasSchema ? '✅' : '❌ NULL'}`);
            
            if (!hasSchema) {
              console.log(`    🚨 PROBLEMA ENCONTRADO: ${dataset.id}.${table.id} tiene schema nulo`);
            }
          } catch (err) {
            console.log(`    ❌ Error obteniendo metadata de ${table.id}: ${err.message}`);
          }
        }
      } catch (err) {
        console.log(`  ❌ Error accediendo a tablas: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`❌ Error general: ${err.message}`);
  }
}

diagnoseTables();

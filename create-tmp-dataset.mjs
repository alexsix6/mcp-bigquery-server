#!/usr/bin/env node

/**
 * Create tmp_forecast dataset for ARIMA models
 */

import { BigQuery } from '@google-cloud/bigquery';

async function createTmpDataset() {
  try {
    const bigquery = new BigQuery({ projectId: 'cognitivedsai-herramientas' });

    // Check if dataset exists
    const [datasets] = await bigquery.getDatasets();
    const exists = datasets.some(ds => ds.id === 'tmp_forecast');

    if (exists) {
      console.log('✅ Dataset tmp_forecast already exists');
      return;
    }

    // Create dataset
    const [dataset] = await bigquery.createDataset('tmp_forecast', {
      location: 'US',
      description: 'Temporary dataset for ARIMA forecasting models'
    });

    console.log('✅ Created dataset tmp_forecast:', dataset.id);

  } catch (error) {
    console.error('❌ Error creating dataset:', error.message);
  }
}

createTmpDataset();
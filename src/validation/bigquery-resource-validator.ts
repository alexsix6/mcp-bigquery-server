/**
 * BIGQUERY RESOURCE VALIDATOR - Sprint 1: Enterprise-Grade Resource Validation
 *
 * Validates that BigQuery datasets, tables, and columns exist and have correct types
 * before executing ML operations to prevent runtime BigQuery errors
 */

import { BigQuery } from '@google-cloud/bigquery';

export interface ResourceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    datasetExists: boolean;
    tableExists: boolean;
    columnsFound: { [key: string]: string }; // column_name -> data_type
    rowCount?: number;
  };
}

export class ResourceValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ResourceValidationError';
  }
}

export class BigQueryResourceValidator {
  constructor(
    private bigquery: BigQuery,
    private projectId: string,
    private location: string = 'US'
  ) {}

  /**
   * Comprehensive validation of BigQuery resources for predict_trends
   */
  async validateResources(
    dataset: string,
    table: string,
    timeColumn: string,
    metricColumn: string
  ): Promise<ResourceValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: any = {
      datasetExists: false,
      tableExists: false,
      columnsFound: {}
    };

    try {
      // Step 1: Validate dataset exists
      try {
        await this.validateDatasetExists(dataset);
        metadata.datasetExists = true;
      } catch (error: any) {
        errors.push(`Dataset '${dataset}' not found or not accessible`);
        return { valid: false, errors, warnings, metadata };
      }

      // Step 2: Validate table exists
      try {
        await this.validateTableExists(dataset, table);
        metadata.tableExists = true;
      } catch (error: any) {
        errors.push(`Table '${dataset}.${table}' not found or not accessible`);
        return { valid: false, errors, warnings, metadata };
      }

      // Step 3: Validate columns exist and have correct types
      try {
        const columnsInfo = await this.validateColumns(dataset, table, timeColumn, metricColumn);
        metadata.columnsFound = columnsInfo;
      } catch (error: any) {
        errors.push(error?.message || error);
        return { valid: false, errors, warnings, metadata };
      }

      // Step 4: Check data availability
      try {
        const rowCount = await this.validateDataAvailability(dataset, table, timeColumn);
        metadata.rowCount = rowCount;

        if (rowCount === 0) {
          errors.push(`Table '${dataset}.${table}' contains no data`);
        } else if (rowCount < 3) {
          warnings.push(`Only ${rowCount} rows found. ML models work better with more historical data`);
        }
      } catch (error: any) {
        warnings.push(`Could not verify data availability: ${error?.message || error}`);
      }

    } catch (error: any) {
      errors.push(`Unexpected validation error: ${error?.message || error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata
    };
  }

  /**
   * Validate that dataset exists and is accessible
   */
  async validateDatasetExists(dataset: string): Promise<void> {
    try {
      const query = `
        SELECT schema_name
        FROM \`${this.projectId}.INFORMATION_SCHEMA.SCHEMATA\`
        WHERE schema_name = @dataset
      `;

      const [rows] = await this.bigquery.query({
        query,
        params: { dataset },
        location: this.location
      });

      if (rows.length === 0) {
        throw new ResourceValidationError(`Dataset '${dataset}' does not exist in project '${this.projectId}'`);
      }
    } catch (error: any) {
      if (error instanceof ResourceValidationError) {
        throw error;
      }

      // Fallback: try direct dataset access
      try {
        const datasetRef = this.bigquery.dataset(dataset);
        await datasetRef.get();
      } catch (fallbackError) {
        throw new ResourceValidationError(
          `Dataset '${dataset}' not found or not accessible: ${error?.message || error}`
        );
      }
    }
  }

  /**
   * Validate that table exists within the dataset
   */
  async validateTableExists(dataset: string, table: string): Promise<void> {
    try {
      const query = `
        SELECT table_name
        FROM \`${this.projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\`
        WHERE table_name = @table
      `;

      const [rows] = await this.bigquery.query({
        query,
        params: { table },
        location: this.location
      });

      if (rows.length === 0) {
        throw new ResourceValidationError(`Table '${table}' does not exist in dataset '${dataset}'`);
      }
    } catch (error: any) {
      if (error instanceof ResourceValidationError) {
        throw error;
      }

      // Fallback: try direct table access
      try {
        const tableRef = this.bigquery.dataset(dataset).table(table);
        await tableRef.get();
      } catch (fallbackError) {
        throw new ResourceValidationError(
          `Table '${dataset}.${table}' not found or not accessible: ${error?.message || error}`
        );
      }
    }
  }

  /**
   * Validate that columns exist and have appropriate types
   */
  async validateColumns(
    dataset: string,
    table: string,
    timeColumn: string,
    metricColumn: string
  ): Promise<{ [key: string]: string }> {
    try {
      const query = `
        SELECT column_name, data_type
        FROM \`${this.projectId}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = @table
        AND column_name IN (@timeColumn, @metricColumn)
      `;

      const [rows] = await this.bigquery.query({
        query,
        params: { table, timeColumn, metricColumn },
        location: this.location
      });

      const foundColumns: { [key: string]: string } = {};
      rows.forEach((row: any) => {
        foundColumns[row.column_name] = row.data_type;
      });

      // Check if time column exists and has valid type
      if (!foundColumns[timeColumn]) {
        throw new ResourceValidationError(`Time column '${timeColumn}' not found in table '${dataset}.${table}'`);
      }

      const timeColumnType = foundColumns[timeColumn];
      const validTimeTypes = ['DATE', 'TIMESTAMP', 'DATETIME'];
      if (!validTimeTypes.includes(timeColumnType)) {
        throw new ResourceValidationError(
          `Time column '${timeColumn}' has invalid type '${timeColumnType}'. Must be one of: ${validTimeTypes.join(', ')}`
        );
      }

      // Check if metric column exists and has valid type
      if (!foundColumns[metricColumn]) {
        throw new ResourceValidationError(`Metric column '${metricColumn}' not found in table '${dataset}.${table}'`);
      }

      const metricColumnType = foundColumns[metricColumn];
      const validMetricTypes = ['INT64', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC', 'INTEGER', 'FLOAT'];
      if (!validMetricTypes.includes(metricColumnType)) {
        throw new ResourceValidationError(
          `Metric column '${metricColumn}' has invalid type '${metricColumnType}'. Must be numeric: ${validMetricTypes.join(', ')}`
        );
      }

      return foundColumns;

    } catch (error: any) {
      if (error instanceof ResourceValidationError) {
        throw error;
      }
      throw new ResourceValidationError(`Failed to validate columns: ${error?.message || error}`);
    }
  }

  /**
   * Validate data availability and basic quality
   */
  async validateDataAvailability(dataset: string, table: string, timeColumn: string): Promise<number> {
    try {
      // Get row count and check for data recency
      const query = `
        SELECT
          COUNT(*) as total_rows,
          MIN(${timeColumn}) as earliest_date,
          MAX(${timeColumn}) as latest_date
        FROM \`${this.projectId}.${dataset}.${table}\`
        WHERE ${timeColumn} IS NOT NULL
      `;

      const [rows] = await this.bigquery.query({
        query,
        location: this.location
      });

      if (rows.length === 0) {
        return 0;
      }

      const result = rows[0];
      return parseInt(result.total_rows) || 0;

    } catch (error: any) {
      throw new ResourceValidationError(`Failed to check data availability: ${error?.message || error}`);
    }
  }

  /**
   * Quick validation that throws on first error (for fast-fail scenarios)
   */
  async validateQuick(
    dataset: string,
    table: string,
    timeColumn: string,
    metricColumn: string
  ): Promise<void> {
    const result = await this.validateResources(dataset, table, timeColumn, metricColumn);
    if (!result.valid) {
      throw new ResourceValidationError(
        `Resource validation failed: ${result.errors[0]}`,
        {
          allErrors: result.errors,
          warnings: result.warnings,
          metadata: result.metadata
        }
      );
    }
  }

  /**
   * Lightweight check for resource existence (no data validation)
   */
  async validateExistence(dataset: string, table: string): Promise<boolean> {
    try {
      await this.validateDatasetExists(dataset);
      await this.validateTableExists(dataset, table);
      return true;
    } catch (error: any) {
      return false;
    }
  }
}
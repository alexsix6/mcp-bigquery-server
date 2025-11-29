/**
 * Unit Tests for BigQueryResourceValidator - Enterprise-Grade Resource Validation
 *
 * Tests BigQuery resource existence and validation to prevent runtime errors
 * with comprehensive mocking of BigQuery API calls
 */

import { BigQueryResourceValidator, ResourceValidationError } from '../../src/validation/bigquery-resource-validator';

describe('BigQueryResourceValidator', () => {
  let validator: BigQueryResourceValidator;
  let mockBigQuery: any;
  const projectId = 'test-project';
  const location = 'US';

  beforeEach(() => {
    // Mock BigQuery client
    mockBigQuery = {
      query: jest.fn(),
      dataset: jest.fn().mockReturnValue({
        get: jest.fn(),
        table: jest.fn().mockReturnValue({
          get: jest.fn()
        })
      })
    };
    validator = new BigQueryResourceValidator(mockBigQuery, projectId, location);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDatasetExists', () => {
    it('should pass when dataset exists', async () => {
      mockBigQuery.query.mockResolvedValue([
        [{ schema_name: 'test_dataset' }]
      ]);

      await expect(
        validator.validateDatasetExists('test_dataset')
      ).resolves.not.toThrow();

      expect(mockBigQuery.query).toHaveBeenCalledWith({
        query: expect.stringContaining('INFORMATION_SCHEMA.SCHEMATA'),
        params: { dataset: 'test_dataset' },
        location: 'US'
      });
    });

    it('should throw when dataset does not exist', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      await expect(
        validator.validateDatasetExists('nonexistent')
      ).rejects.toThrow("Dataset 'nonexistent' does not exist");
    });

    it('should use fallback when INFORMATION_SCHEMA fails', async () => {
      // First call (INFORMATION_SCHEMA) fails
      mockBigQuery.query.mockRejectedValue(new Error('Permission denied'));
      // Fallback call succeeds
      mockBigQuery.dataset().get.mockResolvedValue([{}]);

      await expect(
        validator.validateDatasetExists('test_dataset')
      ).resolves.not.toThrow();

      expect(mockBigQuery.dataset).toHaveBeenCalledWith('test_dataset');
      expect(mockBigQuery.dataset().get).toHaveBeenCalled();
    });

    it('should throw when both INFORMATION_SCHEMA and fallback fail', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('Permission denied'));
      mockBigQuery.dataset().get.mockRejectedValue(new Error('Not found'));

      await expect(
        validator.validateDatasetExists('nonexistent')
      ).rejects.toThrow("Dataset 'nonexistent' not found or not accessible");
    });
  });

  describe('validateTableExists', () => {
    it('should pass when table exists', async () => {
      mockBigQuery.query.mockResolvedValue([
        [{ table_name: 'test_table' }]
      ]);

      await expect(
        validator.validateTableExists('dataset', 'test_table')
      ).resolves.not.toThrow();

      expect(mockBigQuery.query).toHaveBeenCalledWith({
        query: expect.stringContaining('INFORMATION_SCHEMA.TABLES'),
        params: { table: 'test_table' },
        location: 'US'
      });
    });

    it('should throw when table does not exist', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      await expect(
        validator.validateTableExists('dataset', 'nonexistent')
      ).rejects.toThrow("Table 'nonexistent' does not exist in dataset 'dataset'");
    });

    it('should use fallback when INFORMATION_SCHEMA fails', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('Permission denied'));
      mockBigQuery.dataset().table().get.mockResolvedValue([{}]);

      await expect(
        validator.validateTableExists('dataset', 'test_table')
      ).resolves.not.toThrow();

      expect(mockBigQuery.dataset).toHaveBeenCalledWith('dataset');
      expect(mockBigQuery.dataset().table).toHaveBeenCalledWith('test_table');
      expect(mockBigQuery.dataset().table().get).toHaveBeenCalled();
    });

    it('should throw when both INFORMATION_SCHEMA and fallback fail', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('Permission denied'));
      mockBigQuery.dataset().table().get.mockRejectedValue(new Error('Not found'));

      await expect(
        validator.validateTableExists('dataset', 'nonexistent')
      ).rejects.toThrow("Table 'dataset.nonexistent' not found or not accessible");
    });
  });

  describe('validateColumns', () => {
    it('should pass with valid time and metric columns', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      const result = await validator.validateColumns('dataset', 'table', 'date', 'value');

      expect(result).toEqual({
        date: 'DATE',
        value: 'FLOAT64'
      });

      expect(mockBigQuery.query).toHaveBeenCalledWith({
        query: expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
        params: { table: 'table', timeColumn: 'date', metricColumn: 'value' },
        location: 'US'
      });
    });

    it('should throw when time column not found', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      await expect(
        validator.validateColumns('dataset', 'table', 'date', 'value')
      ).rejects.toThrow("Time column 'date' not found in table");
    });

    it('should throw when metric column not found', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'date', data_type: 'DATE' }
      ]]);

      await expect(
        validator.validateColumns('dataset', 'table', 'date', 'value')
      ).rejects.toThrow("Metric column 'value' not found in table");
    });

    it('should throw when time column has invalid type', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'date', data_type: 'STRING' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      await expect(
        validator.validateColumns('dataset', 'table', 'date', 'value')
      ).rejects.toThrow("Time column 'date' has invalid type 'STRING'");
    });

    it('should throw when metric column has invalid type', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'STRING' }
      ]]);

      await expect(
        validator.validateColumns('dataset', 'table', 'date', 'value')
      ).rejects.toThrow("Metric column 'value' has invalid type 'STRING'");
    });

    it('should accept TIMESTAMP as valid time type', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'timestamp', data_type: 'TIMESTAMP' },
        { column_name: 'value', data_type: 'INT64' }
      ]]);

      const result = await validator.validateColumns('dataset', 'table', 'timestamp', 'value');

      expect(result).toEqual({
        timestamp: 'TIMESTAMP',
        value: 'INT64'
      });
    });

    it('should accept DATETIME as valid time type', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'datetime', data_type: 'DATETIME' },
        { column_name: 'value', data_type: 'NUMERIC' }
      ]]);

      const result = await validator.validateColumns('dataset', 'table', 'datetime', 'value');

      expect(result).toEqual({
        datetime: 'DATETIME',
        value: 'NUMERIC'
      });
    });

    it('should accept BIGNUMERIC as valid metric type', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'amount', data_type: 'BIGNUMERIC' }
      ]]);

      const result = await validator.validateColumns('dataset', 'table', 'date', 'amount');

      expect(result).toEqual({
        date: 'DATE',
        amount: 'BIGNUMERIC'
      });
    });

    it('should handle BigQuery API errors gracefully', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('API Error'));

      await expect(
        validator.validateColumns('dataset', 'table', 'date', 'value')
      ).rejects.toThrow('Failed to validate columns: API Error');
    });
  });

  describe('validateDataAvailability', () => {
    it('should return row count when data is available', async () => {
      mockBigQuery.query.mockResolvedValue([[
        {
          total_rows: '100',
          earliest_date: '2024-01-01',
          latest_date: '2024-12-31'
        }
      ]]);

      const rowCount = await validator.validateDataAvailability('dataset', 'table', 'date');

      expect(rowCount).toBe(100);
    });

    it('should return 0 when no data is available', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      const rowCount = await validator.validateDataAvailability('dataset', 'table', 'date');

      expect(rowCount).toBe(0);
    });

    it('should return 0 when total_rows is null', async () => {
      mockBigQuery.query.mockResolvedValue([[
        { total_rows: null }
      ]]);

      const rowCount = await validator.validateDataAvailability('dataset', 'table', 'date');

      expect(rowCount).toBe(0);
    });

    it('should handle BigQuery API errors', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('Query failed'));

      await expect(
        validator.validateDataAvailability('dataset', 'table', 'date')
      ).rejects.toThrow('Failed to check data availability: Query failed');
    });
  });

  describe('validateResources - comprehensive validation', () => {
    it('should pass all validations with valid resources', async () => {
      // Mock successful dataset validation
      mockBigQuery.query.mockResolvedValueOnce([
        [{ schema_name: 'test_dataset' }]
      ]);

      // Mock successful table validation
      mockBigQuery.query.mockResolvedValueOnce([
        [{ table_name: 'test_table' }]
      ]);

      // Mock successful column validation
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      // Mock successful data availability check
      mockBigQuery.query.mockResolvedValueOnce([[
        { total_rows: '50' }
      ]]);

      const result = await validator.validateResources('test_dataset', 'test_table', 'date', 'value');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.datasetExists).toBe(true);
      expect(result.metadata?.tableExists).toBe(true);
      expect(result.metadata?.rowCount).toBe(50);
      expect(result.metadata?.columnsFound).toEqual({
        date: 'DATE',
        value: 'FLOAT64'
      });
    });

    it('should fail when dataset does not exist', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      const result = await validator.validateResources('nonexistent', 'test_table', 'date', 'value');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Dataset 'nonexistent' not found or not accessible");
      expect(result.metadata?.datasetExists).toBe(false);
    });

    it('should fail when table does not exist', async () => {
      // Dataset exists
      mockBigQuery.query.mockResolvedValueOnce([
        [{ schema_name: 'test_dataset' }]
      ]);

      // Table doesn't exist
      mockBigQuery.query.mockResolvedValueOnce([[]]);

      const result = await validator.validateResources('test_dataset', 'nonexistent', 'date', 'value');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Table 'test_dataset.nonexistent' not found or not accessible");
      expect(result.metadata?.datasetExists).toBe(true);
      expect(result.metadata?.tableExists).toBe(false);
    });

    it('should add warnings for small datasets', async () => {
      // Mock successful validations
      mockBigQuery.query.mockResolvedValueOnce([
        [{ schema_name: 'test_dataset' }]
      ]);
      mockBigQuery.query.mockResolvedValueOnce([
        [{ table_name: 'test_table' }]
      ]);
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      // Small dataset (2 rows)
      mockBigQuery.query.mockResolvedValueOnce([[
        { total_rows: '2' }
      ]]);

      const result = await validator.validateResources('test_dataset', 'test_table', 'date', 'value');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Only 2 rows found. ML models work better with more historical data');
    });

    it('should fail when no data is available', async () => {
      // Mock successful dataset, table, and column validations
      mockBigQuery.query.mockResolvedValueOnce([
        [{ schema_name: 'test_dataset' }]
      ]);
      mockBigQuery.query.mockResolvedValueOnce([
        [{ table_name: 'test_table' }]
      ]);
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);

      // No data available
      mockBigQuery.query.mockResolvedValueOnce([[
        { total_rows: '0' }
      ]]);

      const result = await validator.validateResources('test_dataset', 'test_table', 'date', 'value');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Table 'test_dataset.test_table' contains no data");
    });
  });

  describe('validateQuick', () => {
    it('should pass with valid resources', async () => {
      // Mock all validations to succeed
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'test_dataset' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'test_table' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ total_rows: '50' }]]);

      await expect(
        validator.validateQuick('test_dataset', 'test_table', 'date', 'value')
      ).resolves.not.toThrow();
    });

    it('should throw ResourceValidationError with invalid resources', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      await expect(
        validator.validateQuick('nonexistent', 'test_table', 'date', 'value')
      ).rejects.toThrow(ResourceValidationError);
    });
  });

  describe('validateExistence', () => {
    it('should return true when dataset and table exist', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'test_dataset' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'test_table' }]]);

      const exists = await validator.validateExistence('test_dataset', 'test_table');

      expect(exists).toBe(true);
    });

    it('should return false when dataset does not exist', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      const exists = await validator.validateExistence('nonexistent', 'test_table');

      expect(exists).toBe(false);
    });

    it('should return false when table does not exist', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'test_dataset' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[]]);

      const exists = await validator.validateExistence('test_dataset', 'nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle unexpected validation errors', async () => {
      mockBigQuery.query.mockRejectedValue(new Error('Unexpected error'));
      mockBigQuery.dataset().get.mockRejectedValue(new Error('Fallback also failed'));

      const result = await validator.validateResources('test_dataset', 'test_table', 'date', 'value');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Dataset \'test_dataset\' not found or not accessible');
    });

    it('should provide detailed error information', async () => {
      mockBigQuery.query.mockResolvedValue([[]]);

      try {
        await validator.validateQuick('test_dataset', 'test_table', 'date', 'value');
        fail('Should have thrown ResourceValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ResourceValidationError);
        expect((error as any).details).toBeDefined();
        expect((error as any).details.allErrors).toBeDefined();
        expect((error as any).details.metadata).toBeDefined();
      }
    });
  });
});
/**
 * Integration Tests for predict_trends validation flow
 *
 * Tests the complete validation pipeline from input to BigQuery resource validation
 * ensuring the enterprise-grade validation works end-to-end
 */

import { InputValidator, ValidationError } from '../../src/validation/input-validator';
import { BigQueryResourceValidator, ResourceValidationError } from '../../src/validation/bigquery-resource-validator';

describe('predict_trends validation integration', () => {
  let inputValidator: InputValidator;
  let resourceValidator: BigQueryResourceValidator;
  let mockBigQuery: any;

  beforeEach(() => {
    inputValidator = new InputValidator();

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

    resourceValidator = new BigQueryResourceValidator(mockBigQuery, 'test-project', 'US');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('complete validation flow', () => {
    it('should pass full validation pipeline with valid parameters and resources', async () => {
      const params = {
        dataset: 'alexseis_web',
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      // Phase 1: Input validation should pass
      const inputValidation = inputValidator.validate(params);
      expect(inputValidation.valid).toBe(true);

      // Mock Phase 2: Resource validation should pass
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'alexseis_web' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'conversations' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'created_at', data_type: 'TIMESTAMP' },
        { column_name: 'id', data_type: 'INT64' }
      ]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ total_rows: '1500' }]]);

      const resourceValidation = await resourceValidator.validateResources(
        params.dataset,
        params.table,
        params.time_column,
        params.metric_column
      );

      expect(resourceValidation.valid).toBe(true);
      expect(resourceValidation.metadata?.rowCount).toBe(1500);
    });

    it('should fail at input validation phase with invalid parameters', async () => {
      const invalidParams = {
        dataset: '', // Invalid: empty dataset
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: -5, // Invalid: negative periods
        confidence_interval: 0.75 // Invalid: not in allowed values
      };

      const inputValidation = inputValidator.validate(invalidParams);

      expect(inputValidation.valid).toBe(false);
      expect(inputValidation.errors).toContain('dataset is required and cannot be empty');
      // Note: validation stops on first error, so we only check for the first error detected
      expect(inputValidation.errors.length).toBeGreaterThan(0);

      // Should not proceed to resource validation when input validation fails
    });

    it('should fail at resource validation phase when dataset does not exist', async () => {
      const params = {
        dataset: 'nonexistent_dataset',
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      // Phase 1: Input validation should pass
      const inputValidation = inputValidator.validate(params);
      expect(inputValidation.valid).toBe(true);

      // Phase 2: Resource validation should fail - dataset doesn't exist
      mockBigQuery.query.mockResolvedValue([[]]);
      mockBigQuery.dataset().get.mockRejectedValue(new Error('Not found'));

      const resourceValidation = await resourceValidator.validateResources(
        params.dataset,
        params.table,
        params.time_column,
        params.metric_column
      );

      expect(resourceValidation.valid).toBe(false);
      expect(resourceValidation.errors).toContain("Dataset 'nonexistent_dataset' not found or not accessible");
    });

    it('should fail when table exists but columns have wrong types', async () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'description', // STRING column instead of numeric
        time_column: 'id', // INT64 column instead of date/timestamp
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      // Phase 1: Input validation passes
      const inputValidation = inputValidator.validate(params);
      expect(inputValidation.valid).toBe(true);

      // Phase 2: Resource validation - dataset and table exist
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'test_dataset' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'test_table' }]]);

      // But columns have wrong types
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'id', data_type: 'INT64' }, // Should be date/timestamp
        { column_name: 'description', data_type: 'STRING' } // Should be numeric
      ]]);

      const resourceValidation = await resourceValidator.validateResources(
        params.dataset,
        params.table,
        params.time_column,
        params.metric_column
      );

      expect(resourceValidation.valid).toBe(false);
      expect(resourceValidation.errors[0]).toContain("Time column 'id' has invalid type 'INT64'");
    });

    it('should pass with warnings for small datasets but valid structure', async () => {
      const params = {
        dataset: 'small_dataset',
        table: 'small_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 30, // Warning: >90 would be better warning, but this tests integration
        confidence_interval: 0.95
      };

      // Phase 1: Input validation passes (no warnings at this level for periods_ahead=30)
      const inputValidation = inputValidator.validate(params);
      expect(inputValidation.valid).toBe(true);

      // Phase 2: Resource validation passes but with warnings for small dataset
      mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'small_dataset' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'small_table' }]]);
      mockBigQuery.query.mockResolvedValueOnce([[
        { column_name: 'date', data_type: 'DATE' },
        { column_name: 'value', data_type: 'FLOAT64' }
      ]]);
      mockBigQuery.query.mockResolvedValueOnce([[{ total_rows: '2' }]]); // Very small dataset

      const resourceValidation = await resourceValidator.validateResources(
        params.dataset,
        params.table,
        params.time_column,
        params.metric_column
      );

      expect(resourceValidation.valid).toBe(true);
      expect(resourceValidation.warnings).toContain('Only 2 rows found. ML models work better with more historical data');
    });

    it('should handle BigQuery API errors gracefully', async () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      // Phase 1: Input validation passes
      const inputValidation = inputValidator.validate(params);
      expect(inputValidation.valid).toBe(true);

      // Phase 2: BigQuery API error during dataset validation
      mockBigQuery.query.mockRejectedValue(new Error('BigQuery service unavailable'));
      mockBigQuery.dataset().get.mockRejectedValue(new Error('Service unavailable'));

      const resourceValidation = await resourceValidator.validateResources(
        params.dataset,
        params.table,
        params.time_column,
        params.metric_column
      );

      expect(resourceValidation.valid).toBe(false);
      expect(resourceValidation.errors[0]).toContain('not found or not accessible');
    });
  });

  describe('validation error scenarios matching real usage', () => {
    it('should reject typical invalid requests that would cause BigQuery errors', async () => {
      // Common invalid request patterns that the validation should catch
      const invalidRequests = [
        {
          name: 'missing dataset',
          params: {
            table: 'conversations',
            metric_column: 'id',
            time_column: 'created_at'
          },
          expectedError: 'dataset is required'
        },
        {
          name: 'invalid BigQuery identifier',
          params: {
            dataset: 'test-dataset-with-hyphens',
            table: 'conversations',
            metric_column: 'id',
            time_column: 'created_at'
          },
          expectedError: 'contains invalid characters'
        },
        {
          name: 'periods_ahead too large',
          params: {
            dataset: 'test_dataset',
            table: 'conversations',
            metric_column: 'id',
            time_column: 'created_at',
            periods_ahead: 400
          },
          expectedError: 'periods_ahead cannot exceed 365'
        },
        {
          name: 'invalid confidence interval',
          params: {
            dataset: 'test_dataset',
            table: 'conversations',
            metric_column: 'id',
            time_column: 'created_at',
            periods_ahead: 7,
            confidence_interval: 0.5
          },
          expectedError: 'confidence_interval must be one of'
        }
      ];

      for (const testCase of invalidRequests) {
        const inputValidation = inputValidator.validate(testCase.params);

        expect(inputValidation.valid).toBe(false);
        expect(inputValidation.errors.some(error =>
          error.includes(testCase.expectedError)
        )).toBe(true);
      }
    });

    it('should handle edge cases with parameter sanitization', async () => {
      const paramsWithWhitespace = {
        dataset: '  test_dataset  ',
        table: '  conversations  ',
        metric_column: '  id  ',
        time_column: '  created_at  ',
        periods_ahead: '7', // String instead of number
        confidence_interval: '0.95' // String instead of number
      };

      // Test sanitization
      const sanitized = inputValidator.sanitizeParams(paramsWithWhitespace);

      expect(sanitized.dataset).toBe('test_dataset');
      expect(sanitized.table).toBe('conversations');
      expect(sanitized.metric_column).toBe('id');
      expect(sanitized.time_column).toBe('created_at');
      expect(sanitized.periods_ahead).toBe(7);
      expect(sanitized.confidence_interval).toBe(0.95);

      // Test validation of sanitized params
      const inputValidation = inputValidator.validate(sanitized);
      expect(inputValidation.valid).toBe(true);
    });
  });

  describe('end-to-end simulation', () => {
    it('should simulate the exact predict_trends handler validation flow', async () => {
      // Simulate parameters from real predict_trends request
      const rawParams = {
        dataset: 'alexseis_web',
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      try {
        // Step 1: Input validation (as implemented in index.ts)
        const inputValidation = inputValidator.validate(rawParams);
        if (!inputValidation.valid) {
          throw new ValidationError(`Input validation failed: ${inputValidation.errors.join(', ')}`);
        }

        // Log warnings if any (as implemented in index.ts)
        if (inputValidation.warnings.length > 0) {
          console.log(`Input warnings: ${inputValidation.warnings.join(', ')}`);
        }

        // Step 2: Resource validation (as implemented in index.ts)
        // Mock successful resource validation
        mockBigQuery.query.mockResolvedValueOnce([[{ schema_name: 'alexseis_web' }]]);
        mockBigQuery.query.mockResolvedValueOnce([[{ table_name: 'conversations' }]]);
        mockBigQuery.query.mockResolvedValueOnce([[
          { column_name: 'created_at', data_type: 'TIMESTAMP' },
          { column_name: 'id', data_type: 'INT64' }
        ]]);
        mockBigQuery.query.mockResolvedValueOnce([[{ total_rows: '1500' }]]);

        const resourceValidation = await resourceValidator.validateResources(
          rawParams.dataset,
          rawParams.table,
          rawParams.time_column,
          rawParams.metric_column
        );

        if (!resourceValidation.valid) {
          throw new ResourceValidationError(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
        }

        // Log warnings and metadata if any (as implemented in index.ts)
        if (resourceValidation.warnings.length > 0) {
          console.log(`Resource warnings: ${resourceValidation.warnings.join(', ')}`);
        }

        if (resourceValidation.metadata?.rowCount !== undefined) {
          console.log(`Data available: ${resourceValidation.metadata.rowCount} rows`);
        }

        // If we reach here, all validations passed - ready for ML generation
        expect(true).toBe(true); // Test passes

      } catch (error) {
        // This should not happen with valid test data
        fail(`Validation should have passed: ${(error as Error).message}`);
      }
    });

    it('should simulate validation failure and proper error handling', async () => {
      const invalidParams = {
        dataset: 'nonexistent_dataset',
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      try {
        // Step 1: Input validation passes
        const inputValidation = inputValidator.validate(invalidParams);
        if (!inputValidation.valid) {
          throw new ValidationError(`Input validation failed: ${inputValidation.errors.join(', ')}`);
        }

        // Step 2: Resource validation fails
        mockBigQuery.query.mockResolvedValue([[]]);
        mockBigQuery.dataset().get.mockRejectedValue(new Error('Not found'));

        const resourceValidation = await resourceValidator.validateResources(
          invalidParams.dataset,
          invalidParams.table,
          invalidParams.time_column,
          invalidParams.metric_column
        );

        if (!resourceValidation.valid) {
          throw new ResourceValidationError(`Resource validation failed: ${resourceValidation.errors.join(', ')}`);
        }

        // Should not reach here
        fail('Expected validation to fail');

      } catch (error) {
        // Expected error path
        expect(error).toBeInstanceOf(ResourceValidationError);
        expect((error as Error).message).toContain('Resource validation failed');
        expect((error as Error).message).toContain('nonexistent_dataset');
      }
    });
  });
});
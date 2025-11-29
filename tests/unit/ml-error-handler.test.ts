/**
 * Unit Tests for MLErrorHandler - Sprint 2: Error Handling
 *
 * Tests ML error handling, retry strategies, and graceful degradation
 * for BigQuery ML operations in the predict_trends functionality.
 */

import { MLErrorHandler, ErrorCategory, MLError } from '../../src/forecasting/ml-error-handler';

describe('MLErrorHandler', () => {
  let mlErrorHandler: MLErrorHandler;
  let mockBigQuery: any;
  const projectId = 'test-project';
  const location = 'US';

  beforeEach(() => {
    // Mock BigQuery client
    mockBigQuery = {
      query: jest.fn(),
      createQueryJob: jest.fn()
    };

    mlErrorHandler = new MLErrorHandler(mockBigQuery, projectId, location);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeBigQueryML', () => {
    const validParams = {
      dataset: 'test_dataset',
      table: 'test_table',
      metricColumn: 'value',
      timeColumn: 'date',
      periodsAhead: 7,
      confidenceInterval: 0.95
    };

    it('should successfully execute ARIMA_PLUS when data is sufficient', async () => {
      // Mock data availability check - sufficient data
      mockBigQuery.query
        .mockResolvedValueOnce([[{ data_points: '100' }]]) // validateDataAvailability
        .mockResolvedValueOnce([[]]) // create model
        .mockResolvedValueOnce([[ // forecast query - correct number of periods
          { date: '2025-01-01', value: 100, ci_low: 90, ci_high: 110 },
          { date: '2025-01-02', value: 105, ci_low: 95, ci_high: 115 },
          { date: '2025-01-03', value: 107, ci_low: 97, ci_high: 117 },
          { date: '2025-01-04', value: 110, ci_low: 100, ci_high: 120 },
          { date: '2025-01-05', value: 112, ci_low: 102, ci_high: 122 },
          { date: '2025-01-06', value: 115, ci_low: 105, ci_high: 125 },
          { date: '2025-01-07', value: 118, ci_low: 108, ci_high: 128 }
        ]])
        .mockResolvedValueOnce([[]]) // drop model
        .mockResolvedValueOnce([[{ count: '100' }]]); // getDataPointsCount

      const result = await mlErrorHandler.executeBigQueryML(
        validParams.dataset,
        validParams.table,
        validParams.metricColumn,
        validParams.timeColumn,
        validParams.periodsAhead,
        validParams.confidenceInterval
      );

      expect(result.success).toBe(true);
      expect(result.metadata.model_type).toBe('ARIMA_PLUS');
      expect(result.forecast).toHaveLength(validParams.periodsAhead);
      expect(result.forecast[0].value).toBe(100);
    });

    it('should fall back to baseline when data is insufficient', async () => {
      // Mock data availability check - insufficient data
      mockBigQuery.query
        .mockResolvedValueOnce([[{ data_points: '2' }]]) // validateDataAvailability - only 2 points
        .mockResolvedValueOnce([[{ // baseline statistics
          mean_value: '50',
          std_value: '10',
          data_points: '2',
          min_date: { value: '2024-12-30' },
          max_date: { value: '2024-12-31' }
        }]]);

      const result = await mlErrorHandler.executeBigQueryML(
        validParams.dataset,
        validParams.table,
        validParams.metricColumn,
        validParams.timeColumn,
        validParams.periodsAhead,
        validParams.confidenceInterval
      );

      expect(result.success).toBe(true);
      expect(result.metadata.model_type).toBe('BASELINE');
      expect(result.metadata.fallback_reason).toBe('insufficient_data');
      expect(result.forecast).toHaveLength(validParams.periodsAhead);
      expect(result.forecast[0].value).toBe(50);
    });

    it('should fall back to baseline when ARIMA_PLUS fails', async () => {
      // Mock data availability check - sufficient data
      mockBigQuery.query
        .mockResolvedValueOnce([[{ data_points: '100' }]]) // validateDataAvailability
        .mockRejectedValueOnce(new Error('BigQuery ML model creation failed')) // ARIMA fails
        .mockResolvedValueOnce([[{ // baseline statistics
          mean_value: '75',
          std_value: '15',
          data_points: '100',
          min_date: { value: '2024-01-01' },
          max_date: { value: '2024-12-31' }
        }]]);

      const result = await mlErrorHandler.executeBigQueryML(
        validParams.dataset,
        validParams.table,
        validParams.metricColumn,
        validParams.timeColumn,
        validParams.periodsAhead,
        validParams.confidenceInterval
      );

      expect(result.success).toBe(true);
      expect(result.metadata.model_type).toBe('BASELINE');
      expect(result.metadata.fallback_reason).toBeDefined();
      expect(result.forecast).toHaveLength(validParams.periodsAhead);
      expect(result.forecast[0].value).toBe(75);
    });

    it('should handle invalid ML output by falling back to baseline', async () => {
      // Mock data availability check - sufficient data
      mockBigQuery.query
        .mockResolvedValueOnce([[{ data_points: '100' }]]) // validateDataAvailability
        .mockResolvedValueOnce([[]]) // create model
        .mockResolvedValueOnce([[ // forecast query with invalid data
          { date: '2025-01-01', value: NaN, ci_low: 90, ci_high: 110 }
        ]])
        .mockResolvedValueOnce([[]]) // drop model
        .mockResolvedValueOnce([[{ count: '100' }]]) // getDataPointsCount
        .mockResolvedValueOnce([[{ // baseline statistics
          mean_value: '60',
          std_value: '12',
          data_points: '100',
          min_date: { value: '2024-01-01' },
          max_date: { value: '2024-12-31' }
        }]]);

      const result = await mlErrorHandler.executeBigQueryML(
        validParams.dataset,
        validParams.table,
        validParams.metricColumn,
        validParams.timeColumn,
        validParams.periodsAhead,
        validParams.confidenceInterval
      );

      expect(result.success).toBe(true);
      expect(result.metadata.model_type).toBe('BASELINE');
      expect(result.metadata.fallback_reason).toBe('invalid_output');
      expect(result.forecast).toHaveLength(validParams.periodsAhead);
      expect(result.forecast[0].value).toBe(60);
    });
  });

  describe('error classification', () => {
    const context = {
      operation: 'model_creation' as const,
      dataset: 'test',
      table: 'test',
      metric_column: 'value',
      time_column: 'date',
      periods_ahead: 7,
      attempt: 1,
      max_retries: 3
    };

    it('should classify quota errors correctly', () => {
      const error = new Error('quota exceeded for BigQuery ML');
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError).toBeInstanceOf(MLError);
      expect(mlError.category).toBe(ErrorCategory.QUOTA_EXCEEDED);
    });

    it('should classify timeout errors correctly', () => {
      const error = new Error('query timeout exceeded');
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError.category).toBe(ErrorCategory.TIMEOUT);
    });

    it('should classify permission errors correctly', () => {
      const error = new Error('permission denied to dataset');
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError.category).toBe(ErrorCategory.PERMISSION_DENIED);
    });

    it('should classify insufficient data errors correctly', () => {
      const error = new Error('insufficient training data for model');
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError.category).toBe(ErrorCategory.INSUFFICIENT_DATA);
    });

    it('should classify 5xx errors as retryable', () => {
      const error = { message: 'Internal server error', code: 500 };
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError.category).toBe(ErrorCategory.RETRYABLE);
    });

    it('should classify 4xx errors as non-retryable', () => {
      const error = { message: 'Bad request', code: 400 };
      const mlError = (mlErrorHandler as any).classifyError(error, context);

      expect(mlError.category).toBe(ErrorCategory.NON_RETRYABLE);
    });
  });

  describe('validateMLOutput', () => {
    it('should validate correct forecast output', () => {
      const forecast = [
        { date: '2025-01-01', value: 100, ci_low: 90, ci_high: 110 },
        { date: '2025-01-02', value: 105, ci_low: 95, ci_high: 115 }
      ];

      const result = (mlErrorHandler as any).validateMLOutput(forecast, 2);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject forecast with wrong length', () => {
      const forecast = [
        { date: '2025-01-01', value: 100, ci_low: 90, ci_high: 110 }
      ];

      const result = (mlErrorHandler as any).validateMLOutput(forecast, 3);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Expected 3 forecast periods, got 1');
    });

    it('should reject forecast with invalid values', () => {
      const forecast = [
        { date: '2025-01-01', value: NaN, ci_low: 90, ci_high: 110 },
        { date: 'invalid-date', value: 105, ci_low: Infinity, ci_high: 115 }
      ];

      const result = (mlErrorHandler as any).validateMLOutput(forecast, 2);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((err: string) => err.includes('Invalid forecast value'))).toBe(true);
      expect(result.errors.some((err: string) => err.includes('Invalid date'))).toBe(true);
    });

    it('should reject forecast with invalid confidence intervals', () => {
      const forecast = [
        { date: '2025-01-01', value: 100, ci_low: 120, ci_high: 110 } // ci_low > value > ci_high
      ];

      const result = (mlErrorHandler as any).validateMLOutput(forecast, 1);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid confidence interval');
    });
  });

  describe('validateDataAvailability', () => {
    it('should return sufficient for adequate data points', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{ data_points: '50' }]]);

      const result = await (mlErrorHandler as any).validateDataAvailability(
        'dataset', 'table', 'time_col', 'metric_col'
      );

      expect(result.sufficient).toBe(true);
      expect(result.dataPoints).toBe(50);
    });

    it('should return insufficient for low data points', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{ data_points: '2' }]]);

      const result = await (mlErrorHandler as any).validateDataAvailability(
        'dataset', 'table', 'time_col', 'metric_col'
      );

      expect(result.sufficient).toBe(false);
      expect(result.dataPoints).toBe(2);
      expect(result.reason).toContain('Only 2 data points available');
    });

    it('should handle query errors gracefully', async () => {
      mockBigQuery.query.mockRejectedValueOnce(new Error('Table not found'));

      const result = await (mlErrorHandler as any).validateDataAvailability(
        'dataset', 'table', 'time_col', 'metric_col'
      );

      expect(result.sufficient).toBe(false);
      expect(result.dataPoints).toBe(0);
      expect(result.reason).toContain('Failed to validate data availability');
    });
  });

  describe('baseline forecasting', () => {
    it('should generate baseline forecast with proper statistics', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{
        mean_value: '100',
        std_value: '20',
        data_points: '50',
        min_date: { value: '2024-01-01' },
        max_date: { value: '2024-12-31' }
      }]]);

      const result = await (mlErrorHandler as any).executeFallbackBaseline(
        'dataset', 'table', 'metric', 'time', 3, 0.95, 'test_reason'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.model_type).toBe('BASELINE');
      expect(result.metadata.fallback_reason).toBe('test_reason');
      expect(result.forecast).toHaveLength(3);
      expect(result.forecast[0].value).toBe(100);
      expect(result.forecast[0].ci_low).toBeLessThan(result.forecast[0].value);
      expect(result.forecast[0].ci_high).toBeGreaterThan(result.forecast[0].value);
    });

    it('should handle baseline query failures', async () => {
      mockBigQuery.query.mockRejectedValueOnce(new Error('Baseline query failed'));

      await expect((mlErrorHandler as any).executeFallbackBaseline(
        'dataset', 'table', 'metric', 'time', 3, 0.95, 'test_reason'
      )).rejects.toThrow('Baseline fallback failed');
    });
  });

  describe('edge cases', () => {
    it('should handle zero or negative values in baseline forecast', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{
        mean_value: '10',
        std_value: '15', // Large std deviation
        data_points: '10',
        min_date: { value: '2024-12-30' },
        max_date: { value: '2024-12-31' }
      }]]);

      const result = await (mlErrorHandler as any).executeFallbackBaseline(
        'dataset', 'table', 'metric', 'time', 2, 0.95, 'test_reason'
      );

      expect(result.success).toBe(true);
      // ci_low should be non-negative (Math.max(0, ...))
      expect(result.forecast[0].ci_low).toBeGreaterThanOrEqual(0);
    });

    it('should handle null/undefined statistics gracefully', async () => {
      mockBigQuery.query.mockResolvedValueOnce([[{
        mean_value: null,
        std_value: null,
        data_points: '0',
        min_date: { value: '2024-12-30' },
        max_date: { value: '2024-12-31' }
      }]]);

      const result = await (mlErrorHandler as any).executeFallbackBaseline(
        'dataset', 'table', 'metric', 'time', 2, 0.95, 'test_reason'
      );

      expect(result.success).toBe(true);
      expect(result.forecast[0].value).toBe(1.0); // Default mean value
    });
  });
});
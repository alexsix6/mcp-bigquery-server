/**
 * Enterprise-Grade ML Error Handling for BigQuery ML ARIMA_PLUS
 *
 * Provides robust error handling, retry strategies, and graceful degradation
 * for BigQuery ML operations in the predict_trends functionality.
 *
 * Features:
 * - Comprehensive error classification
 * - Automatic retry with exponential backoff
 * - Graceful degradation to baseline forecasting
 * - ML output validation and sanity checks
 */

import { BigQuery } from '@google-cloud/bigquery';

export interface ForecastResult {
  success: boolean;
  forecast: Array<{
    date: string;
    value: number;
    ci_low: number;
    ci_high: number;
  }>;
  metadata: {
    model_type: 'ARIMA_PLUS' | 'BASELINE';
    confidence_interval: number;
    fallback_reason?: string;
    data_points_used: number;
    warnings: string[];
  };
}

export interface MLErrorContext {
  operation: 'model_creation' | 'forecasting' | 'validation';
  dataset: string;
  table: string;
  metric_column: string;
  time_column: string;
  periods_ahead: number;
  attempt: number;
  max_retries: number;
}

export enum ErrorCategory {
  RETRYABLE = 'retryable',
  NON_RETRYABLE = 'non_retryable',
  INSUFFICIENT_DATA = 'insufficient_data',
  QUOTA_EXCEEDED = 'quota_exceeded',
  TIMEOUT = 'timeout',
  PERMISSION_DENIED = 'permission_denied',
  NOT_FOUND = 'not_found',
  INVALID_DATA = 'invalid_data'
}

export class MLError extends Error {
  public readonly category: ErrorCategory;
  public readonly context: MLErrorContext;
  public readonly originalError: Error;

  constructor(message: string, category: ErrorCategory, context: MLErrorContext, originalError: Error) {
    super(message);
    this.name = 'MLError';
    this.category = category;
    this.context = context;
    this.originalError = originalError;
  }
}

export class MLErrorHandler {
  private bigquery: BigQuery;
  private projectId: string;
  private location: string;

  constructor(bigquery: BigQuery, projectId: string, location: string) {
    this.bigquery = bigquery;
    this.projectId = projectId;
    this.location = location;
  }

  /**
   * Main entry point for executing BigQuery ML operations with comprehensive error handling
   */
  async executeBigQueryML(
    dataset: string,
    table: string,
    metricColumn: string,
    timeColumn: string,
    periodsAhead: number,
    confidenceInterval: number
  ): Promise<ForecastResult> {
    const context: MLErrorContext = {
      operation: 'model_creation',
      dataset,
      table,
      metric_column: metricColumn,
      time_column: timeColumn,
      periods_ahead: periodsAhead,
      attempt: 1,
      max_retries: 3
    };

    try {
      // Step 1: Validate data availability first
      const dataValidation = await this.validateDataAvailability(dataset, table, timeColumn, metricColumn);
      if (!dataValidation.sufficient) {
        return this.executeFallbackBaseline(dataset, table, metricColumn, timeColumn, periodsAhead, confidenceInterval, 'insufficient_data');
      }

      // Step 2: Execute ARIMA_PLUS with retry logic
      const arimaResult = await this.executeWithRetry(
        () => this.executeARIMAPlus(dataset, table, metricColumn, timeColumn, periodsAhead, confidenceInterval),
        context
      );

      // Step 3: Validate ML output
      const validationResult = this.validateMLOutput(arimaResult.forecast, periodsAhead);
      if (!validationResult.valid) {
        console.log(`ML output validation failed: ${validationResult.errors.join(', ')}. Falling back to baseline.`);
        return this.executeFallbackBaseline(dataset, table, metricColumn, timeColumn, periodsAhead, confidenceInterval, 'invalid_output');
      }

      return arimaResult;

    } catch (error: any) {
      const mlError = this.classifyError(error, context);

      if (mlError.category === ErrorCategory.RETRYABLE && context.attempt < context.max_retries) {
        console.log(`Retryable error detected. Falling back to baseline. Error: ${mlError.message}`);
      } else {
        console.log(`Non-retryable error or max retries exceeded. Falling back to baseline. Error: ${mlError.message}`);
      }

      return this.executeFallbackBaseline(
        dataset,
        table,
        metricColumn,
        timeColumn,
        periodsAhead,
        confidenceInterval,
        mlError.category
      );
    }
  }

  /**
   * Execute ARIMA_PLUS model creation and forecasting
   */
  private async executeARIMAPlus(
    dataset: string,
    table: string,
    metricColumn: string,
    timeColumn: string,
    periodsAhead: number,
    confidenceInterval: number
  ): Promise<ForecastResult> {
    const modelName = `arima_model_${dataset}_${table}_${Date.now()}`;
    const qualifiedTableName = `\`${this.projectId}.${dataset}.${table}\``;

    try {
      // Create ARIMA_PLUS model
      const createModelSQL = `
        CREATE OR REPLACE MODEL \`${this.projectId}.${dataset}.${modelName}\`
        OPTIONS(
          model_type='ARIMA_PLUS',
          time_series_timestamp_col='${timeColumn}',
          time_series_data_col='${metricColumn}',
          auto_arima=TRUE,
          data_frequency='AUTO_FREQUENCY'
        ) AS
        SELECT
          ${timeColumn},
          ${metricColumn}
        FROM ${qualifiedTableName}
        WHERE ${timeColumn} IS NOT NULL
          AND ${metricColumn} IS NOT NULL
        ORDER BY ${timeColumn}
      `;

      await this.bigquery.query({
        query: createModelSQL,
        location: this.location
      });

      // Generate forecast
      const forecastSQL = `
        SELECT
          forecast_timestamp as date,
          forecast_value as value,
          prediction_interval_lower_bound as ci_low,
          prediction_interval_upper_bound as ci_high
        FROM
          ML.FORECAST(MODEL \`${this.projectId}.${dataset}.${modelName}\`,
                     STRUCT(${periodsAhead} as horizon, ${confidenceInterval} as confidence_level))
        ORDER BY forecast_timestamp
      `;

      const [forecastRows] = await this.bigquery.query({
        query: forecastSQL,
        location: this.location
      });

      // Clean up model
      const dropModelSQL = `DROP MODEL IF EXISTS \`${this.projectId}.${dataset}.${modelName}\``;
      await this.bigquery.query({
        query: dropModelSQL,
        location: this.location
      });

      const forecast = forecastRows.map((row: any) => ({
        date: row.date.value || row.date,
        value: parseFloat(row.value),
        ci_low: parseFloat(row.ci_low),
        ci_high: parseFloat(row.ci_high)
      }));

      return {
        success: true,
        forecast,
        metadata: {
          model_type: 'ARIMA_PLUS',
          confidence_interval: confidenceInterval,
          data_points_used: await this.getDataPointsCount(dataset, table, timeColumn, metricColumn),
          warnings: []
        }
      };

    } catch (error: any) {
      // Clean up model on error
      try {
        const dropModelSQL = `DROP MODEL IF EXISTS \`${this.projectId}.${dataset}.${modelName}\``;
        await this.bigquery.query({
          query: dropModelSQL,
          location: this.location
        });
      } catch (cleanupError) {
        console.log(`Warning: Failed to clean up model ${modelName}:`, cleanupError);
      }

      throw error;
    }
  }

  /**
   * Execute baseline forecasting as fallback
   */
  private async executeFallbackBaseline(
    dataset: string,
    table: string,
    metricColumn: string,
    timeColumn: string,
    periodsAhead: number,
    confidenceInterval: number,
    fallbackReason: string
  ): Promise<ForecastResult> {
    const qualifiedTableName = `\`${this.projectId}.${dataset}.${table}\``;

    try {
      // Get historical statistics
      const statsSQL = `
        SELECT
          AVG(${metricColumn}) as mean_value,
          STDDEV(${metricColumn}) as std_value,
          COUNT(*) as data_points,
          MIN(${timeColumn}) as min_date,
          MAX(${timeColumn}) as max_date
        FROM ${qualifiedTableName}
        WHERE ${timeColumn} IS NOT NULL AND ${metricColumn} IS NOT NULL
      `;

      const [statsRows] = await this.bigquery.query({
        query: statsSQL,
        location: this.location
      });

      if (!statsRows || !Array.isArray(statsRows) || statsRows.length === 0) {
        throw new Error('No statistics data returned from query');
      }

      const stats = statsRows[0];
      if (!stats) {
        throw new Error('No statistics row returned from query');
      }

      const meanValue = parseFloat(stats.mean_value) || 1.0;
      const stdValue = parseFloat(stats.std_value) || meanValue * 0.1;
      const dataPoints = parseInt(stats.data_points) || 0;

      // Calculate confidence interval multiplier
      const zScore = confidenceInterval === 0.99 ? 2.576 :
                    confidenceInterval === 0.95 ? 1.96 :
                    confidenceInterval === 0.9 ? 1.645 : 1.28;

      const marginError = zScore * stdValue;

      // Generate future dates
      const forecast = [];
      let lastDate: Date;

      try {
        // Handle different formats of max_date from BigQuery
        const maxDateValue = stats.max_date?.value || stats.max_date || '2024-12-31';
        lastDate = new Date(maxDateValue);

        if (isNaN(lastDate.getTime())) {
          // Fallback to a default date if parsing fails
          lastDate = new Date('2024-12-31');
        }
      } catch {
        lastDate = new Date('2024-12-31');
      }

      for (let i = 1; i <= periodsAhead; i++) {
        const futureDate = new Date(lastDate);
        futureDate.setDate(futureDate.getDate() + i);

        forecast.push({
          date: futureDate.toISOString().split('T')[0],
          value: meanValue,
          ci_low: Math.max(0, meanValue - marginError),
          ci_high: meanValue + marginError
        });
      }

      return {
        success: true,
        forecast,
        metadata: {
          model_type: 'BASELINE',
          confidence_interval: confidenceInterval,
          fallback_reason: fallbackReason,
          data_points_used: dataPoints,
          warnings: [`Fallback to baseline due to: ${fallbackReason}`]
        }
      };

    } catch (error: any) {
      throw new Error(`Baseline fallback failed: ${error.message}`);
    }
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: MLErrorContext
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= context.max_retries; attempt++) {
      try {
        context.attempt = attempt;
        return await operation();
      } catch (error: any) {
        lastError = error;
        const mlError = this.classifyError(error, context);

        if (mlError.category !== ErrorCategory.RETRYABLE || attempt === context.max_retries) {
          throw mlError;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Attempt ${attempt} failed with retryable error. Retrying in ${backoffMs}ms...`);
        await this.sleep(backoffMs);
      }
    }

    throw lastError!;
  }

  /**
   * Classify errors into categories for appropriate handling
   */
  private classifyError(error: any, context: MLErrorContext): MLError {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorCode = error?.code || error?.status;

    // Quota and rate limiting errors
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorCode === 429) {
      return new MLError(
        `Quota exceeded: ${errorMessage}`,
        ErrorCategory.QUOTA_EXCEEDED,
        context,
        error
      );
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('deadline') || errorCode === 408) {
      return new MLError(
        `Timeout error: ${errorMessage}`,
        ErrorCategory.TIMEOUT,
        context,
        error
      );
    }

    // Insufficient data errors
    if (errorMessage.includes('insufficient') || errorMessage.includes('not enough data')) {
      return new MLError(
        `Insufficient data: ${errorMessage}`,
        ErrorCategory.INSUFFICIENT_DATA,
        context,
        error
      );
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('access denied') || errorCode === 403) {
      return new MLError(
        `Permission denied: ${errorMessage}`,
        ErrorCategory.PERMISSION_DENIED,
        context,
        error
      );
    }

    // Not found errors
    if (errorMessage.includes('not found') || errorCode === 404) {
      return new MLError(
        `Resource not found: ${errorMessage}`,
        ErrorCategory.NOT_FOUND,
        context,
        error
      );
    }

    // Invalid data errors
    if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
      return new MLError(
        `Invalid data: ${errorMessage}`,
        ErrorCategory.INVALID_DATA,
        context,
        error
      );
    }

    // Default to retryable for transient errors
    if (errorCode >= 500 && errorCode < 600) {
      return new MLError(
        `Retryable server error: ${errorMessage}`,
        ErrorCategory.RETRYABLE,
        context,
        error
      );
    }

    // Default to non-retryable
    return new MLError(
      `Non-retryable error: ${errorMessage}`,
      ErrorCategory.NON_RETRYABLE,
      context,
      error
    );
  }

  /**
   * Validate ML forecast output for quality and consistency
   */
  private validateMLOutput(
    forecast: Array<{ date: string; value: number; ci_low: number; ci_high: number }>,
    expectedPeriods: number
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check forecast length
    if (forecast.length !== expectedPeriods) {
      errors.push(`Expected ${expectedPeriods} forecast periods, got ${forecast.length}`);
    }

    // Check for valid values
    for (let i = 0; i < forecast.length; i++) {
      const point = forecast[i];

      if (!point.date || isNaN(Date.parse(point.date))) {
        errors.push(`Invalid date at position ${i}: ${point.date}`);
      }

      if (isNaN(point.value) || !isFinite(point.value)) {
        errors.push(`Invalid forecast value at position ${i}: ${point.value}`);
      }

      if (isNaN(point.ci_low) || !isFinite(point.ci_low)) {
        errors.push(`Invalid ci_low at position ${i}: ${point.ci_low}`);
      }

      if (isNaN(point.ci_high) || !isFinite(point.ci_high)) {
        errors.push(`Invalid ci_high at position ${i}: ${point.ci_high}`);
      }

      if (point.ci_low > point.value || point.value > point.ci_high) {
        errors.push(`Invalid confidence interval at position ${i}: ci_low(${point.ci_low}) > value(${point.value}) > ci_high(${point.ci_high})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate data availability for ML modeling
   */
  private async validateDataAvailability(
    dataset: string,
    table: string,
    timeColumn: string,
    metricColumn: string
  ): Promise<{ sufficient: boolean; dataPoints: number; reason?: string }> {
    try {
      const qualifiedTableName = `\`${this.projectId}.${dataset}.${table}\``;
      const countSQL = `
        SELECT COUNT(*) as data_points
        FROM ${qualifiedTableName}
        WHERE ${timeColumn} IS NOT NULL AND ${metricColumn} IS NOT NULL
      `;

      const [countRows] = await this.bigquery.query({
        query: countSQL,
        location: this.location
      });

      const dataPoints = parseInt(countRows[0].data_points) || 0;

      // Minimum 3 data points needed for meaningful ML model
      if (dataPoints < 3) {
        return {
          sufficient: false,
          dataPoints,
          reason: `Only ${dataPoints} data points available. Minimum 3 required for ARIMA_PLUS.`
        };
      }

      return {
        sufficient: true,
        dataPoints
      };

    } catch (error: any) {
      return {
        sufficient: false,
        dataPoints: 0,
        reason: `Failed to validate data availability: ${error.message}`
      };
    }
  }

  /**
   * Get count of data points used for modeling
   */
  private async getDataPointsCount(
    dataset: string,
    table: string,
    timeColumn: string,
    metricColumn: string
  ): Promise<number> {
    try {
      const qualifiedTableName = `\`${this.projectId}.${dataset}.${table}\``;
      const countSQL = `
        SELECT COUNT(*) as count
        FROM ${qualifiedTableName}
        WHERE ${timeColumn} IS NOT NULL AND ${metricColumn} IS NOT NULL
      `;

      const [countRows] = await this.bigquery.query({
        query: countSQL,
        location: this.location
      });

      return parseInt(countRows[0].count) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Utility function for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
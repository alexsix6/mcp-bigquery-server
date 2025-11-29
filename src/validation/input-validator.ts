/**
 * INPUT VALIDATOR - Sprint 1: Enterprise-Grade Input Validation
 *
 * Provides comprehensive validation for predict_trends parameters
 * to prevent BigQuery errors and ensure robust operation
 */

export interface PredictTrendsParams {
  dataset: string;
  table: string;
  metric_column: string;
  time_column: string;
  periods_ahead: number;
  confidence_interval: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class InputValidator {
  /**
   * Comprehensive validation of predict_trends parameters
   */
  validate(params: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.validateRequiredParams(params);
      this.validateParameterTypes(params);
      this.validateParameterRanges(params);
      this.validateParameterFormats(params);
    } catch (error: any) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push(`Validation error: ${error?.message || error}`);
      }
    }

    // Add warnings for edge cases
    if (params.periods_ahead > 90) {
      warnings.push('periods_ahead > 90 may reduce forecast accuracy');
    }

    if (params.confidence_interval === 0.99) {
      warnings.push('confidence_interval=0.99 may produce very wide intervals');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate that all required parameters are present
   */
  validateRequiredParams(params: any): void {
    const required = ['dataset', 'table', 'metric_column', 'time_column'];

    for (const param of required) {
      if (!params[param] || params[param] === '') {
        throw new ValidationError(`${param} is required and cannot be empty`);
      }
    }

    // Optional parameters with defaults
    if (params.periods_ahead === undefined) {
      params.periods_ahead = 12; // Set default
    }

    if (params.confidence_interval === undefined) {
      params.confidence_interval = 0.95; // Set default
    }
  }

  /**
   * Validate parameter types
   */
  validateParameterTypes(params: any): void {
    // String parameters
    const stringParams = ['dataset', 'table', 'metric_column', 'time_column'];
    for (const param of stringParams) {
      if (typeof params[param] !== 'string') {
        throw new ValidationError(`${param} must be a string, got ${typeof params[param]}`);
      }
    }

    // Numeric parameters
    if (typeof params.periods_ahead !== 'number' || !Number.isInteger(params.periods_ahead)) {
      throw new ValidationError(`periods_ahead must be an integer, got ${typeof params.periods_ahead}`);
    }

    if (typeof params.confidence_interval !== 'number') {
      throw new ValidationError(`confidence_interval must be a number, got ${typeof params.confidence_interval}`);
    }
  }

  /**
   * Validate parameter ranges and constraints
   */
  validateParameterRanges(params: any): void {
    // periods_ahead constraints
    if (params.periods_ahead < 1) {
      throw new ValidationError('periods_ahead must be at least 1');
    }

    if (params.periods_ahead > 365) {
      throw new ValidationError('periods_ahead cannot exceed 365 (1 year)');
    }

    // confidence_interval constraints
    const validCI = [0.8, 0.9, 0.95, 0.99];
    if (!validCI.includes(params.confidence_interval)) {
      throw new ValidationError(
        `confidence_interval must be one of: ${validCI.join(', ')}, got ${params.confidence_interval}`
      );
    }
  }

  /**
   * Validate parameter formats and naming conventions
   */
  validateParameterFormats(params: any): void {
    // BigQuery identifier validation (dataset, table, column names)
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    if (!identifierRegex.test(params.dataset)) {
      throw new ValidationError(
        `dataset name '${params.dataset}' contains invalid characters. Use only letters, numbers, and underscores, starting with letter or underscore`
      );
    }

    if (!identifierRegex.test(params.table)) {
      throw new ValidationError(
        `table name '${params.table}' contains invalid characters. Use only letters, numbers, and underscores, starting with letter or underscore`
      );
    }

    if (!identifierRegex.test(params.metric_column)) {
      throw new ValidationError(
        `metric_column name '${params.metric_column}' contains invalid characters. Use only letters, numbers, and underscores, starting with letter or underscore`
      );
    }

    if (!identifierRegex.test(params.time_column)) {
      throw new ValidationError(
        `time_column name '${params.time_column}' contains invalid characters. Use only letters, numbers, and underscores, starting with letter or underscore`
      );
    }

    // Length constraints
    const maxLength = 63; // BigQuery identifier limit
    if (params.dataset.length > maxLength) {
      throw new ValidationError(`dataset name too long (max ${maxLength} characters)`);
    }

    if (params.table.length > maxLength) {
      throw new ValidationError(`table name too long (max ${maxLength} characters)`);
    }

    if (params.metric_column.length > maxLength) {
      throw new ValidationError(`metric_column name too long (max ${maxLength} characters)`);
    }

    if (params.time_column.length > maxLength) {
      throw new ValidationError(`time_column name too long (max ${maxLength} characters)`);
    }
  }

  /**
   * Quick validation that throws on first error (for fast-fail scenarios)
   */
  validateQuick(params: any): void {
    const result = this.validate(params);
    if (!result.valid) {
      throw new ValidationError(`Input validation failed: ${result.errors[0]}`, {
        allErrors: result.errors,
        warnings: result.warnings
      });
    }
  }

  /**
   * Sanitize and normalize parameters
   */
  sanitizeParams(params: any): PredictTrendsParams {
    return {
      dataset: String(params.dataset).trim(),
      table: String(params.table).trim(),
      metric_column: String(params.metric_column).trim(),
      time_column: String(params.time_column).trim(),
      periods_ahead: Number(params.periods_ahead) || 12,
      confidence_interval: Number(params.confidence_interval) || 0.95
    };
  }
}
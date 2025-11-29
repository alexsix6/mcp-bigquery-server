/**
 * Unit Tests for InputValidator - Enterprise-Grade Input Validation
 *
 * Tests all validation scenarios to ensure robust parameter validation
 * for predict_trends functionality
 */

import { InputValidator, ValidationError } from '../../src/validation/input-validator';

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validateRequiredParams', () => {
    it('should pass with all required params', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateRequiredParams(params)).not.toThrow();
    });

    it('should throw when dataset is missing', () => {
      const params = {
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateRequiredParams(params))
        .toThrow('dataset is required');
    });

    it('should throw when table is missing', () => {
      const params = {
        dataset: 'test_dataset',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateRequiredParams(params))
        .toThrow('table is required');
    });

    it('should throw when metric_column is missing', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        time_column: 'date'
      };

      expect(() => validator.validateRequiredParams(params))
        .toThrow('metric_column is required');
    });

    it('should throw when time_column is missing', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value'
      };

      expect(() => validator.validateRequiredParams(params))
        .toThrow('time_column is required');
    });

    it('should throw when params have empty strings', () => {
      const params = {
        dataset: '',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateRequiredParams(params))
        .toThrow('dataset is required');
    });

    it('should set default values for optional parameters', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      validator.validateRequiredParams(params);

      expect(params).toHaveProperty('periods_ahead', 12);
      expect(params).toHaveProperty('confidence_interval', 0.95);
    });
  });

  describe('validateParameterTypes', () => {
    it('should pass with valid string parameters', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterTypes(params)).not.toThrow();
    });

    it('should pass with valid periods_ahead', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterTypes(params)).not.toThrow();
    });

    it('should throw when periods_ahead is not a number', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: '7', // String instead of number
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterTypes(params))
        .toThrow('periods_ahead must be an integer');
    });

    it('should throw when periods_ahead is not an integer', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7.5, // Float instead of integer
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterTypes(params))
        .toThrow('periods_ahead must be an integer');
    });

    it('should pass with valid confidence_interval', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterTypes(params)).not.toThrow();
    });

    it('should throw when confidence_interval is not a number', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: '0.95'
      };

      expect(() => validator.validateParameterTypes(params))
        .toThrow('confidence_interval must be a number');
    });

    it('should throw when dataset is not a string', () => {
      const params = { dataset: 123 };

      expect(() => validator.validateParameterTypes(params))
        .toThrow('dataset must be a string');
    });
  });

  describe('validateParameterRanges', () => {
    it('should pass with minimum valid periods_ahead (1)', () => {
      const params = {
        periods_ahead: 1,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterRanges(params)).not.toThrow();
    });

    it('should pass with maximum valid periods_ahead (365)', () => {
      const params = {
        periods_ahead: 365,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterRanges(params)).not.toThrow();
    });

    it('should throw when periods_ahead is less than 1', () => {
      const params = { periods_ahead: 0 };

      expect(() => validator.validateParameterRanges(params))
        .toThrow('periods_ahead must be at least 1');
    });

    it('should throw when periods_ahead exceeds 365', () => {
      const params = { periods_ahead: 366 };

      expect(() => validator.validateParameterRanges(params))
        .toThrow('periods_ahead cannot exceed 365');
    });

    it('should pass with valid confidence_interval (0.8)', () => {
      const params = {
        periods_ahead: 7,
        confidence_interval: 0.8
      };

      expect(() => validator.validateParameterRanges(params)).not.toThrow();
    });

    it('should pass with valid confidence_interval (0.95)', () => {
      const params = {
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => validator.validateParameterRanges(params)).not.toThrow();
    });

    it('should pass with valid confidence_interval (0.99)', () => {
      const params = {
        periods_ahead: 7,
        confidence_interval: 0.99
      };

      expect(() => validator.validateParameterRanges(params)).not.toThrow();
    });

    it('should throw with invalid confidence_interval (0.75)', () => {
      const params = {
        periods_ahead: 7,
        confidence_interval: 0.75
      };

      expect(() => validator.validateParameterRanges(params))
        .toThrow('confidence_interval must be one of: 0.8, 0.9, 0.95, 0.99');
    });

    it('should throw with confidence_interval too high (0.999)', () => {
      const params = {
        periods_ahead: 7,
        confidence_interval: 0.999
      };

      expect(() => validator.validateParameterRanges(params))
        .toThrow('confidence_interval must be one of: 0.8, 0.9, 0.95, 0.99');
    });
  });

  describe('validateParameterFormats', () => {
    it('should pass with valid BigQuery identifiers', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'metric_value',
        time_column: 'event_date'
      };

      expect(() => validator.validateParameterFormats(params)).not.toThrow();
    });

    it('should pass with identifiers starting with underscore', () => {
      const params = {
        dataset: '_test_dataset',
        table: '_test_table',
        metric_column: '_metric_value',
        time_column: '_event_date'
      };

      expect(() => validator.validateParameterFormats(params)).not.toThrow();
    });

    it('should throw when dataset contains invalid characters', () => {
      const params = {
        dataset: 'test-dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateParameterFormats(params))
        .toThrow('dataset name \'test-dataset\' contains invalid characters');
    });

    it('should throw when table starts with number', () => {
      const params = {
        dataset: 'test_dataset',
        table: '123_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateParameterFormats(params))
        .toThrow('table name \'123_table\' contains invalid characters');
    });

    it('should throw when identifier is too long (>63 chars)', () => {
      const longName = 'a'.repeat(64);
      const params = {
        dataset: longName,
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateParameterFormats(params))
        .toThrow('dataset name too long (max 63 characters)');
    });

    it('should accept maximum length identifiers (63 chars)', () => {
      const maxLengthName = 'a'.repeat(63);
      const params = {
        dataset: maxLengthName,
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateParameterFormats(params)).not.toThrow();
    });
  });

  describe('validate - comprehensive validation', () => {
    it('should return valid result with correct parameters', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      const result = validator.validate(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return warnings for edge cases', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 100,
        confidence_interval: 0.99
      };

      const result = validator.validate(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('periods_ahead > 90 may reduce forecast accuracy');
      expect(result.warnings).toContain('confidence_interval=0.99 may produce very wide intervals');
    });

    it('should return invalid result with errors', () => {
      const params = {
        dataset: '',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: -5,
        confidence_interval: 0.75
      };

      const result = validator.validate(params);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateQuick - fast-fail validation', () => {
    it('should pass with valid parameters', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => validator.validateQuick(params)).not.toThrow();
    });

    it('should throw ValidationError with invalid parameters', () => {
      const params = {
        dataset: '',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      expect(() => validator.validateQuick(params))
        .toThrow(ValidationError);
    });
  });

  describe('sanitizeParams', () => {
    it('should trim string parameters', () => {
      const params = {
        dataset: '  test_dataset  ',
        table: '  test_table  ',
        metric_column: '  value  ',
        time_column: '  date  ',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      const sanitized = validator.sanitizeParams(params);

      expect(sanitized.dataset).toBe('test_dataset');
      expect(sanitized.table).toBe('test_table');
      expect(sanitized.metric_column).toBe('value');
      expect(sanitized.time_column).toBe('date');
    });

    it('should set default values for missing optional parameters', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date'
      };

      const sanitized = validator.sanitizeParams(params);

      expect(sanitized.periods_ahead).toBe(12);
      expect(sanitized.confidence_interval).toBe(0.95);
    });

    it('should convert string numbers to numbers', () => {
      const params = {
        dataset: 'test_dataset',
        table: 'test_table',
        metric_column: 'value',
        time_column: 'date',
        periods_ahead: '7',
        confidence_interval: '0.95'
      };

      const sanitized = validator.sanitizeParams(params);

      expect(sanitized.periods_ahead).toBe(7);
      expect(sanitized.confidence_interval).toBe(0.95);
    });
  });

  describe('edge cases', () => {
    it('should handle null params gracefully', () => {
      expect(() => validator.validateRequiredParams(null))
        .toThrow();
    });

    it('should handle undefined params gracefully', () => {
      expect(() => validator.validateRequiredParams(undefined))
        .toThrow();
    });

    it('should handle empty object', () => {
      const result = validator.validate({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate full parameter set', () => {
      const params = {
        dataset: 'alexseis_web',
        table: 'conversations',
        metric_column: 'id',
        time_column: 'created_at',
        periods_ahead: 7,
        confidence_interval: 0.95
      };

      expect(() => {
        validator.validateRequiredParams(params);
        validator.validateParameterTypes(params);
        validator.validateParameterRanges(params);
        validator.validateParameterFormats(params);
      }).not.toThrow();
    });
  });
});
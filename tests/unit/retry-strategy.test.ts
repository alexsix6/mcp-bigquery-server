/**
 * Unit Tests for RetryStrategy - Sprint 2: Error Handling
 *
 * Tests retry logic, exponential backoff, circuit breaker patterns,
 * and retry budget management for robust BigQuery operations.
 */

import {
  RetryStrategy,
  RetryStrategyFactory,
  CircuitBreakerState,
  RetryBudgetManager,
  RetryDecision,
  RetryConfig
} from '../../src/forecasting/retry-strategy';

describe('RetryStrategy', () => {
  let retryStrategy: RetryStrategy;

  beforeEach(() => {
    retryStrategy = new RetryStrategy({
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      exponentialBase: 2,
      jitterPercent: 0.1,
      retryBudget: 10
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt when operation succeeds', async () => {
      const successfulOperation = jest.fn().mockResolvedValue('success');

      const result = await retryStrategy.executeWithRetry(
        successfulOperation,
        'test-operation'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.totalAttempts).toBe(1);
      expect(result.retriesUsed).toBe(0);
      expect(successfulOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry retryable errors up to max retries', async () => {
      const failingOperation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout error'))
        .mockRejectedValueOnce(new Error('rate limit exceeded'))
        .mockResolvedValueOnce('success');

      const result = await retryStrategy.executeWithRetry(
        failingOperation,
        'test-operation'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.totalAttempts).toBe(3);
      expect(result.retriesUsed).toBe(2);
      expect(failingOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail fast on non-retryable errors', async () => {
      const nonRetryableOperation = jest.fn()
        .mockRejectedValue(new Error('permission denied'));

      const result = await retryStrategy.executeWithRetry(
        nonRetryableOperation,
        'test-operation'
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('permission denied');
      expect(result.totalAttempts).toBe(1);
      expect(result.retriesUsed).toBe(0);
      expect(nonRetryableOperation).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after max retries exceeded', async () => {
      const alwaysFailingOperation = jest.fn()
        .mockRejectedValue(new Error('timeout error'));

      const result = await retryStrategy.executeWithRetry(
        alwaysFailingOperation,
        'test-operation'
      );

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(4); // 1 initial + 3 retries
      expect(result.retriesUsed).toBe(3);
      expect(alwaysFailingOperation).toHaveBeenCalledTimes(4);
    });

    it('should use custom retry logic when provided', async () => {
      const customRetryLogic = jest.fn().mockReturnValue(false);
      const failingOperation = jest.fn()
        .mockRejectedValue(new Error('custom error'));

      const result = await retryStrategy.executeWithRetry(
        failingOperation,
        'test-operation',
        customRetryLogic
      );

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1);
      expect(customRetryLogic).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('shouldRetry logic', () => {
    const context = {
      operation: 'test',
      attempt: 1,
      startTime: Date.now()
    };

    it('should identify retryable error patterns', () => {
      const retryableErrors = [
        new Error('timeout occurred'),
        new Error('deadline exceeded'),
        new Error('rate limit exceeded'),
        new Error('quota exceeded'),
        new Error('service unavailable'),
        new Error('internal error'),
        { message: 'server error', code: 500 },
        { message: 'rate limited', code: 429 }
      ];

      retryableErrors.forEach(error => {
        const decision = (retryStrategy as any).shouldRetry(error, context);
        expect(decision).toBe(RetryDecision.RETRY);
      });
    });

    it('should identify non-retryable error patterns', () => {
      const nonRetryableErrors = [
        new Error('permission denied'),
        new Error('access denied'),
        new Error('unauthorized'),
        new Error('not found'),
        new Error('invalid request'),
        new Error('malformed query'),
        { message: 'bad request', code: 400 },
        { message: 'unauthorized', code: 401 },
        { message: 'forbidden', code: 403 },
        { message: 'not found', code: 404 }
      ];

      nonRetryableErrors.forEach(error => {
        const decision = (retryStrategy as any).shouldRetry(error, context);
        expect(decision).toBe(RetryDecision.FAIL_FAST);
      });
    });
  });

  describe('delay calculation', () => {
    it('should calculate exponential backoff correctly', () => {
      const strategy = new RetryStrategy({
        baseDelayMs: 1000,
        exponentialBase: 2,
        maxDelayMs: 10000,
        jitterPercent: 0
      });

      const delay0 = (strategy as any).calculateDelay(0);
      const delay1 = (strategy as any).calculateDelay(1);
      const delay2 = (strategy as any).calculateDelay(2);

      expect(delay0).toBe(1000); // 1000 * 2^0
      expect(delay1).toBe(2000); // 1000 * 2^1
      expect(delay2).toBe(4000); // 1000 * 2^2
    });

    it('should cap delay at maxDelayMs', () => {
      const strategy = new RetryStrategy({
        baseDelayMs: 1000,
        exponentialBase: 2,
        maxDelayMs: 3000,
        jitterPercent: 0
      });

      const delay3 = (strategy as any).calculateDelay(3);
      expect(delay3).toBe(3000); // Capped at maxDelayMs
    });

    it('should add jitter to prevent thundering herd', () => {
      const strategy = new RetryStrategy({
        baseDelayMs: 1000,
        exponentialBase: 2,
        maxDelayMs: 10000,
        jitterPercent: 0.2
      });

      const delays = Array.from({ length: 10 }, () =>
        (strategy as any).calculateDelay(1)
      );

      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be within reasonable range (1600 to 2400 with 20% jitter)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(1600);
        expect(delay).toBeLessThan(2400);
      });
    });
  });

  describe('status and configuration', () => {
    it('should return current status', () => {
      const status = retryStrategy.getStatus();

      expect(status.circuitBreakerState).toBeDefined();
      expect(status.remainingRetryBudget).toBeGreaterThan(0);
      expect(status.config).toBeDefined();
      expect(status.config.maxRetries).toBe(3);
    });

    it('should update configuration', () => {
      retryStrategy.updateConfig({ maxRetries: 5 });
      const status = retryStrategy.getStatus();

      expect(status.config.maxRetries).toBe(5);
    });

    it('should reset circuit breaker', () => {
      retryStrategy.resetCircuitBreaker();
      const status = retryStrategy.getStatus();

      expect(status.circuitBreakerState).toBe('CLOSED');
    });
  });
});

describe('CircuitBreakerState', () => {
  let circuitBreaker: CircuitBreakerState;

  beforeEach(() => {
    circuitBreaker = new CircuitBreakerState(3, 1000); // 3 failures, 1 second recovery
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.shouldAllow()).toBe(true);
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should transition to OPEN after failure threshold', () => {
    // Record failures up to threshold
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.shouldAllow()).toBe(true);

    // Third failure should open circuit
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');
    expect(circuitBreaker.shouldAllow()).toBe(false);
  });

  it('should transition to HALF_OPEN after recovery time', (done) => {
    // Trip the circuit breaker
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Wait for recovery time + small buffer
    setTimeout(() => {
      expect(circuitBreaker.shouldAllow()).toBe(true);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      done();
    }, 1100);
  }, 2000);

  it('should reset to CLOSED on success', () => {
    // Trip the circuit breaker
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Record success should reset
    circuitBreaker.recordSuccess();
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.shouldAllow()).toBe(true);
  });
});

describe('RetryBudgetManager', () => {
  let budgetManager: RetryBudgetManager;

  beforeEach(() => {
    budgetManager = new RetryBudgetManager(10, 1000); // 10 budget, 1 second window
  });

  it('should allow spending within budget', () => {
    expect(budgetManager.canSpend(5)).toBe(true);
    expect(budgetManager.spend(5)).toBe(true);
    expect(budgetManager.getRemainingBudget()).toBe(5);
  });

  it('should deny spending beyond budget', () => {
    budgetManager.spend(8);
    expect(budgetManager.canSpend(5)).toBe(false);
    expect(budgetManager.spend(5)).toBe(false);
    expect(budgetManager.getRemainingBudget()).toBe(2);
  });

  it('should refresh budget after window expires', (done) => {
    budgetManager.spend(10);
    expect(budgetManager.getRemainingBudget()).toBe(0);

    // Wait for window to expire + small buffer
    setTimeout(() => {
      expect(budgetManager.getRemainingBudget()).toBeGreaterThan(0);
      done();
    }, 1100);
  }, 2000);
});

describe('RetryStrategyFactory', () => {
  it('should create conservative strategy', () => {
    const strategy = RetryStrategyFactory.createConservative();
    const status = strategy.getStatus();

    expect(status.config.maxRetries).toBe(2);
    expect(status.config.baseDelayMs).toBe(1000);
    expect(status.config.retryBudget).toBe(5);
  });

  it('should create aggressive strategy', () => {
    const strategy = RetryStrategyFactory.createAggressive();
    const status = strategy.getStatus();

    expect(status.config.maxRetries).toBe(5);
    expect(status.config.baseDelayMs).toBe(500);
    expect(status.config.retryBudget).toBe(20);
  });

  it('should create fast fail strategy', () => {
    const strategy = RetryStrategyFactory.createFastFail();
    const status = strategy.getStatus();

    expect(status.config.maxRetries).toBe(1);
    expect(status.config.baseDelayMs).toBe(500);
    expect(status.config.retryBudget).toBe(3);
  });

  it('should create BigQuery ML specific strategy', () => {
    const strategy = RetryStrategyFactory.createForBigQueryML();
    const status = strategy.getStatus();

    expect(status.config.maxRetries).toBe(3);
    expect(status.config.baseDelayMs).toBe(1000);
    expect(status.config.retryBudget).toBe(10);
  });
});
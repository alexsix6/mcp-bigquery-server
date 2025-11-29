/**
 * Enterprise-Grade Retry Strategy for BigQuery Operations
 *
 * Implements sophisticated retry logic with exponential backoff, jitter,
 * and circuit breaker patterns for robust BigQuery ML operations.
 *
 * Features:
 * - Exponential backoff with configurable base delay
 * - Jitter to prevent thundering herd problem
 * - Circuit breaker pattern for fast failure
 * - Retry budget management
 * - Context-aware retry decisions
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitterPercent: number;
  retryBudget: number;
}

export interface RetryContext {
  operation: string;
  attempt: number;
  startTime: number;
  lastError?: Error;
  metadata?: Record<string, any>;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  totalAttempts: number;
  totalDuration: number;
  retriesUsed: number;
}

export enum RetryDecision {
  RETRY = 'retry',
  FAIL_FAST = 'fail_fast',
  CIRCUIT_BREAK = 'circuit_break'
}

export class CircuitBreakerState {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeMs: number = 60000 // 1 minute
  ) {}

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public shouldAllow(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one attempt
    return true;
  }

  public getState(): string {
    return this.state;
  }
}

export class RetryBudgetManager {
  private budget: number;
  private windowStartTime: number;
  private windowDurationMs: number;

  constructor(initialBudget: number, windowDurationMs: number = 60000) {
    this.budget = initialBudget;
    this.windowStartTime = Date.now();
    this.windowDurationMs = windowDurationMs;
  }

  public canSpend(cost: number = 1): boolean {
    this.refreshWindowIfNeeded();
    return this.budget >= cost;
  }

  public spend(cost: number = 1): boolean {
    this.refreshWindowIfNeeded();
    if (this.budget >= cost) {
      this.budget -= cost;
      return true;
    }
    return false;
  }

  public getRemainingBudget(): number {
    this.refreshWindowIfNeeded();
    return this.budget;
  }

  private refreshWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.windowStartTime > this.windowDurationMs) {
      this.budget = this.windowDurationMs / 1000; // Reset to initial budget
      this.windowStartTime = now;
    }
  }
}

export class RetryStrategy {
  private config: RetryConfig;
  private circuitBreaker: CircuitBreakerState;
  private retryBudget: RetryBudgetManager;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBase: 2,
      jitterPercent: 0.1,
      retryBudget: 10,
      ...config
    };

    this.circuitBreaker = new CircuitBreakerState();
    this.retryBudget = new RetryBudgetManager(this.config.retryBudget);
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    isRetryableError?: (error: Error) => boolean
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error;
    let attempt = 0;

    const context: RetryContext = {
      operation: operationName,
      attempt: 0,
      startTime
    };

    // Check circuit breaker
    if (!this.circuitBreaker.shouldAllow()) {
      return {
        success: false,
        error: new Error(`Circuit breaker is OPEN for operation: ${operationName}`),
        totalAttempts: 0,
        totalDuration: Date.now() - startTime,
        retriesUsed: 0
      };
    }

    for (attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      context.attempt = attempt;

      try {
        const result = await operation();

        // Success - record in circuit breaker and return
        this.circuitBreaker.recordSuccess();

        return {
          success: true,
          result,
          totalAttempts: attempt,
          totalDuration: Date.now() - startTime,
          retriesUsed: Math.max(0, attempt - 1)
        };

      } catch (error: any) {
        lastError = error;
        context.lastError = error;

        // Record failure in circuit breaker
        this.circuitBreaker.recordFailure();

        // Check if we should retry
        const decision = this.shouldRetry(error, context, isRetryableError);

        if (decision !== RetryDecision.RETRY || attempt > this.config.maxRetries) {
          break;
        }

        // Check retry budget
        if (!this.retryBudget.canSpend(1)) {
          console.log(`Retry budget exhausted for operation: ${operationName}`);
          break;
        }

        // Spend retry budget
        this.retryBudget.spend(1);

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt - 1);
        console.log(`Attempt ${attempt} failed for ${operationName}. Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError!,
      totalAttempts: attempt,
      totalDuration: Date.now() - startTime,
      retriesUsed: Math.max(0, attempt - 1)
    };
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(
    error: Error,
    context: RetryContext,
    customIsRetryable?: (error: Error) => boolean
  ): RetryDecision {
    // Circuit breaker check
    if (!this.circuitBreaker.shouldAllow()) {
      return RetryDecision.CIRCUIT_BREAK;
    }

    // Custom retry logic if provided
    if (customIsRetryable) {
      return customIsRetryable(error) ? RetryDecision.RETRY : RetryDecision.FAIL_FAST;
    }

    // Default retry logic based on error patterns
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = (error as any)?.code || (error as any)?.status;

    // Non-retryable errors
    const nonRetryablePatterns = [
      'permission denied',
      'access denied',
      'unauthorized',
      'forbidden',
      'not found',
      'invalid',
      'malformed',
      'syntax error',
      'authentication',
      'credential'
    ];

    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return RetryDecision.FAIL_FAST;
      }
    }

    // Non-retryable status codes
    if (errorCode === 400 || errorCode === 401 || errorCode === 403 || errorCode === 404) {
      return RetryDecision.FAIL_FAST;
    }

    // Retryable errors
    const retryablePatterns = [
      'timeout',
      'deadline',
      'rate limit',
      'quota',
      'service unavailable',
      'internal error',
      'server error',
      'connection',
      'network'
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return RetryDecision.RETRY;
      }
    }

    // Retryable status codes (5xx errors)
    if (errorCode >= 500 && errorCode < 600) {
      return RetryDecision.RETRY;
    }

    // Rate limiting
    if (errorCode === 429) {
      return RetryDecision.RETRY;
    }

    // Default to fail fast for unknown errors
    return RetryDecision.FAIL_FAST;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(retryAttempt: number): number {
    // Exponential backoff: baseDelay * (exponentialBase ^ retryAttempt)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.exponentialBase, retryAttempt);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterPercent * (Math.random() - 0.5) * 2;
    const finalDelay = Math.max(0, cappedDelay + jitter);

    return Math.round(finalDelay);
  }

  /**
   * Get retry strategy status and metrics
   */
  public getStatus(): {
    circuitBreakerState: string;
    remainingRetryBudget: number;
    config: RetryConfig;
  } {
    return {
      circuitBreakerState: this.circuitBreaker.getState(),
      remainingRetryBudget: this.retryBudget.getRemainingBudget(),
      config: { ...this.config }
    };
  }

  /**
   * Reset circuit breaker (for testing or manual intervention)
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreakerState();
  }

  /**
   * Update retry configuration
   */
  public updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Utility function for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating common retry strategies
 */
export class RetryStrategyFactory {
  /**
   * Conservative strategy for production environments
   */
  static createConservative(): RetryStrategy {
    return new RetryStrategy({
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      exponentialBase: 2,
      jitterPercent: 0.1,
      retryBudget: 5
    });
  }

  /**
   * Aggressive strategy for development/testing
   */
  static createAggressive(): RetryStrategy {
    return new RetryStrategy({
      maxRetries: 5,
      baseDelayMs: 500,
      maxDelayMs: 30000,
      exponentialBase: 2,
      jitterPercent: 0.2,
      retryBudget: 20
    });
  }

  /**
   * Fast failure strategy for time-sensitive operations
   */
  static createFastFail(): RetryStrategy {
    return new RetryStrategy({
      maxRetries: 1,
      baseDelayMs: 500,
      maxDelayMs: 2000,
      exponentialBase: 1.5,
      jitterPercent: 0.05,
      retryBudget: 3
    });
  }

  /**
   * BigQuery ML specific strategy
   */
  static createForBigQueryML(): RetryStrategy {
    return new RetryStrategy({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBase: 2,
      jitterPercent: 0.1,
      retryBudget: 10
    });
  }
}
// Tipos para análisis semántico y detección predictiva

export interface SemanticAnalysis {
  intentRecognition: {
    queryType: 'analytical' | 'exploratory' | 'reporting' | 'aggregation';
    complexity: 'simple' | 'medium' | 'complex' | 'heavy';
    tables: string[];
    timeRange: DateRange | null;
    operations: string[];
  };
  costPrediction: {
    estimatedBytes: number;
    estimatedCost: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    warning?: string;
  };
  optimizationSuggestions: string[];
  performanceMetrics: {
    complexity: number;
    joinCount: number;
    aggregationCount: number;
    hasTimeFilter: boolean;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
  column: string;
}

export interface QueryPattern {
  pattern: RegExp;
  type: string;
  cost: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface CostPrediction {
  estimatedBytes: number;
  estimatedCost: number;
  confidence: number;
  factors: string[];
}

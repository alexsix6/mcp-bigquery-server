import { SemanticAnalysis, QueryPattern, CostPrediction, DateRange } from './types/semantic-types.js';

export class SemanticAnalyzer {
  private static readonly QUERY_PATTERNS: QueryPattern[] = [
    {
      pattern: /SELECT\s+\*\s+FROM/i,
      type: 'full_table_scan',
      cost: 'high',
      suggestion: 'Especificar columnas específicas en lugar de SELECT *'
    },
    {
      pattern: /JOIN.*JOIN.*JOIN/i,
      type: 'multiple_joins',
      cost: 'high',
      suggestion: 'Considerar optimizar múltiples JOINs o usar WITH clauses'
    },
    {
      pattern: /GROUP\s+BY.*ORDER\s+BY/i,
      type: 'group_order',
      cost: 'medium',
      suggestion: 'Considerar limitar resultados con LIMIT'
    },
    {
      pattern: /WHERE.*LIKE\s+'%.*%'/i,
      type: 'wildcard_search',
      cost: 'high',
      suggestion: 'Evitar LIKE con wildcards al inicio (%texto%)'
    },
    {
      pattern: /WHERE.*(?:created_at|date|timestamp).*>.*CURRENT_DATE/i,
      type: 'date_filter',
      cost: 'low',
      suggestion: 'Excelente uso de filtros de fecha'
    }
  ];

  static analyzeQuery(sql: string): SemanticAnalysis {
    const analysis: SemanticAnalysis = {
      intentRecognition: this.recognizeIntent(sql),
      costPrediction: this.predictCost(sql),
      optimizationSuggestions: this.generateSuggestions(sql),
      performanceMetrics: this.calculateMetrics(sql)
    };

    return analysis;
  }

  private static recognizeIntent(sql: string): SemanticAnalysis['intentRecognition'] {
    const cleanSQL = sql.trim().toUpperCase();
    
    // Detectar tipo de consulta
    let queryType: 'analytical' | 'exploratory' | 'reporting' | 'aggregation' = 'exploratory';
    
    if (cleanSQL.includes('GROUP BY') || cleanSQL.includes('COUNT(') || cleanSQL.includes('SUM(')) {
      queryType = 'aggregation';
    } else if (cleanSQL.includes('JOIN') && cleanSQL.includes('WHERE')) {
      queryType = 'analytical';
    } else if (cleanSQL.includes('ORDER BY') && cleanSQL.includes('LIMIT')) {
      queryType = 'reporting';
    }

    // Detectar complejidad
    let complexity: 'simple' | 'medium' | 'complex' | 'heavy' = 'simple';
    const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
    const subqueryCount = (sql.match(/\(/g) || []).length;
    
    if (joinCount >= 3 || subqueryCount >= 2) {
      complexity = 'heavy';
    } else if (joinCount >= 2 || subqueryCount >= 1) {
      complexity = 'complex';
    } else if (joinCount >= 1 || sql.includes('GROUP BY')) {
      complexity = 'medium';
    }

    // Extraer tablas
    const tableMatches = sql.match(/FROM\s+`?(\w+\.?\w*\.?\w*)`?/gi) || [];
    const tables = tableMatches.map(match => 
      match.replace(/FROM\s+`?/i, '').replace(/`/g, '')
    );

    // Detectar filtros de fecha
    const datePattern = /WHERE.*(?:created_at|date|timestamp|_date).*(?:>|<|BETWEEN)/i;
    const timeRange = datePattern.test(sql) ? this.extractDateRange(sql) : null;

    // Detectar operaciones
    const operations: string[] = [];
    if (sql.includes('JOIN')) operations.push('JOIN');
    if (sql.includes('GROUP BY')) operations.push('AGGREGATION');
    if (sql.includes('ORDER BY')) operations.push('SORTING');
    if (sql.includes('LIMIT')) operations.push('LIMITING');

    return {
      queryType,
      complexity,
      tables,
      timeRange,
      operations
    };
  }

  private static predictCost(sql: string): SemanticAnalysis['costPrediction'] {
    let estimatedBytes = 1000000; // 1MB base
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let warning: string | undefined;

    // Factores que aumentan el costo
    if (sql.includes('SELECT *')) {
      estimatedBytes *= 5;
      riskLevel = 'medium';
      warning = 'SELECT * puede procesar columnas innecesarias';
    }

    const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
    if (joinCount >= 2) {
      estimatedBytes *= Math.pow(2, joinCount);
      riskLevel = joinCount >= 3 ? 'high' : 'medium';
    }

    if (sql.includes('GROUP BY') && !sql.includes('LIMIT')) {
      estimatedBytes *= 3;
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Sin filtros de fecha es muy riesgoso
    const hasDateFilter = /WHERE.*(?:created_at|date|timestamp).*(?:>|<|BETWEEN)/i.test(sql);
    if (!hasDateFilter && !sql.includes('LIMIT')) {
      estimatedBytes *= 10;
      riskLevel = 'critical';
      warning = 'Consulta sin filtros de fecha puede procesar toda la tabla';
    }

    // Estimar costo en USD (aproximado)
    const estimatedCost = (estimatedBytes / 1024 / 1024 / 1024) * 0.005; // $5 per TB

    return {
      estimatedBytes,
      estimatedCost: Number(estimatedCost.toFixed(4)),
      riskLevel,
      warning
    };
  }

  private static generateSuggestions(sql: string): string[] {
    const suggestions: string[] = [];

    // Aplicar patrones predefinidos
    for (const pattern of this.QUERY_PATTERNS) {
      if (pattern.pattern.test(sql)) {
        suggestions.push(pattern.suggestion);
      }
    }

    // Sugerencias específicas
    if (!sql.includes('LIMIT') && sql.includes('ORDER BY')) {
      suggestions.push('Agregar LIMIT para controlar el número de resultados');
    }

    if (!sql.includes('WHERE') && !sql.includes('LIMIT')) {
      suggestions.push('Agregar filtros WHERE para reducir datos procesados');
    }

    if (sql.includes('SELECT *')) {
      suggestions.push('Especificar solo las columnas necesarias');
    }

    return suggestions;
  }

  private static calculateMetrics(sql: string): SemanticAnalysis['performanceMetrics'] {
    const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
    const aggregationCount = (sql.match(/\b(COUNT|SUM|AVG|MAX|MIN|GROUP BY)\b/gi) || []).length;
    const hasTimeFilter = /WHERE.*(?:created_at|date|timestamp).*(?:>|<|BETWEEN)/i.test(sql);
    
    // Calcular complejidad numérica
    let complexity = 1;
    complexity += joinCount * 2;
    complexity += aggregationCount * 1.5;
    complexity += sql.includes('LIMIT') ? -0.5 : 1;
    complexity += hasTimeFilter ? -1 : 2;

    return {
      complexity: Math.max(1, Math.round(complexity)),
      joinCount,
      aggregationCount,
      hasTimeFilter
    };
  }

  private static extractDateRange(sql: string): DateRange | null {
    // Implementación simplificada - detectar columna de fecha
    const dateColumnMatch = sql.match(/(?:created_at|date|timestamp|_date)/i);
    if (dateColumnMatch) {
      return {
        start: new Date(),
        end: new Date(),
        column: dateColumnMatch[0]
      };
    }
    return null;
  }

  static shouldWarnUser(analysis: SemanticAnalysis): boolean {
    return analysis.costPrediction.riskLevel === 'high' || 
           analysis.costPrediction.riskLevel === 'critical';
  }

  static formatAnalysisForUser(analysis: SemanticAnalysis): string {
    const lines: string[] = [];
    
    lines.push(`🧠 **Análisis Semántico:**`);
    lines.push(`   Tipo: ${analysis.intentRecognition.queryType}`);
    lines.push(`   Complejidad: ${analysis.intentRecognition.complexity}`);
    lines.push(`   Riesgo de costo: ${analysis.costPrediction.riskLevel}`);
    
    if (analysis.costPrediction.warning) {
      lines.push(`⚠️ **Advertencia:** ${analysis.costPrediction.warning}`);
    }
    
    if (analysis.optimizationSuggestions.length > 0) {
      lines.push(`💡 **Sugerencias:**`);
      analysis.optimizationSuggestions.slice(0, 3).forEach(suggestion => {
        lines.push(`   • ${suggestion}`);
      });
    }
    
    return lines.join('\n');
  }
}

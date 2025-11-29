/**
 * Smart Context Generator for BigQuery
 * 
 * Automatically discovers tables, analyzes schemas, and generates
 * intelligent business queries based on column patterns.
 * 
 * @author alexsix6
 */

import { BigQuery } from '@google-cloud/bigquery';
import { promises as fs } from 'fs';
import { BusinessContextConfig, QueryTemplate } from './business-context.js';

/**
 * Column analysis result
 */
interface ColumnAnalysis {
  name: string;
  type: string;
  mode: string;
  semanticType: 'date' | 'category' | 'metric' | 'identifier' | 'text' | 'unknown';
}

/**
 * Table analysis result
 */
interface TableAnalysis {
  projectId: string;
  datasetId: string;
  tableId: string;
  fullName: string;
  rowCount: string;
  columns: ColumnAnalysis[];
  dateColumns: ColumnAnalysis[];
  categoryColumns: ColumnAnalysis[];
  metricColumns: ColumnAnalysis[];
  identifierColumns: ColumnAnalysis[];
}

/**
 * Smart Context Generator
 * Auto-discovers and generates business context from BigQuery schemas
 */
export class SmartContextGenerator {
  private bigquery: BigQuery;
  private projectId: string;

  constructor(bigquery: BigQuery, projectId: string) {
    this.bigquery = bigquery;
    this.projectId = projectId;
  }

  /**
   * Main entry point: Generate complete business context
   */
  async generateContext(outputPath?: string): Promise<BusinessContextConfig> {
    console.error(`[SmartContextGenerator] Starting auto-discovery for project: ${this.projectId}`);
    
    // 1. Discover all tables
    const tables = await this.discoverTables();
    console.error(`[SmartContextGenerator] Found ${tables.length} tables`);
    
    // 2. Analyze each table
    const analyses: TableAnalysis[] = [];
    for (const table of tables) {
      try {
        const analysis = await this.analyzeTable(table.datasetId, table.tableId);
        analyses.push(analysis);
        console.error(`[SmartContextGenerator] Analyzed: ${table.datasetId}.${table.tableId}`);
      } catch (error) {
        console.error(`[SmartContextGenerator] Failed to analyze ${table.datasetId}.${table.tableId}:`, error);
      }
    }
    
    // 3. Generate business context
    const context = this.generateBusinessContext(analyses);
    console.error(`[SmartContextGenerator] Generated ${Object.keys(context.queryTemplates).length} query templates`);
    
    // 4. Save if path provided
    if (outputPath) {
      await fs.writeFile(outputPath, JSON.stringify(context, null, 2), 'utf-8');
      console.error(`[SmartContextGenerator] Saved context to: ${outputPath}`);
    }
    
    return context;
  }

  /**
   * Discover all tables in the project
   */
  private async discoverTables(): Promise<{ datasetId: string; tableId: string }[]> {
    const tables: { datasetId: string; tableId: string }[] = [];
    
    try {
      const [datasets] = await this.bigquery.getDatasets();
      
      for (const dataset of datasets) {
        try {
          const [datasetTables] = await dataset.getTables();
          for (const table of datasetTables) {
            tables.push({
              datasetId: dataset.id!,
              tableId: table.id!
            });
          }
        } catch (error) {
          console.error(`[SmartContextGenerator] Error listing tables in ${dataset.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[SmartContextGenerator] Error discovering datasets:', error);
    }
    
    return tables;
  }

  /**
   * Analyze a single table's schema
   */
  private async analyzeTable(datasetId: string, tableId: string): Promise<TableAnalysis> {
    const [metadata] = await this.bigquery
      .dataset(datasetId)
      .table(tableId)
      .getMetadata();
    
    const schema = metadata.schema?.fields || [];
    const rowCount = metadata.numRows || '0';
    
    const columns: ColumnAnalysis[] = schema.map((field: any) => ({
      name: field.name,
      type: field.type,
      mode: field.mode || 'NULLABLE',
      semanticType: this.classifyColumn(field.name, field.type)
    }));
    
    return {
      projectId: this.projectId,
      datasetId,
      tableId,
      fullName: `\`${this.projectId}.${datasetId}.${tableId}\``,
      rowCount,
      columns,
      dateColumns: columns.filter(c => c.semanticType === 'date'),
      categoryColumns: columns.filter(c => c.semanticType === 'category'),
      metricColumns: columns.filter(c => c.semanticType === 'metric'),
      identifierColumns: columns.filter(c => c.semanticType === 'identifier')
    };
  }

  /**
   * Classify a column by its semantic type based on name and type
   */
  private classifyColumn(name: string, type: string): ColumnAnalysis['semanticType'] {
    const lowerName = name.toLowerCase();
    
    // Date patterns (Spanish + English)
    const datePatterns = [
      'fecha', 'date', 'timestamp', 'created', 'updated', 'modified',
      'año', 'anio', 'year', 'mes', 'month', 'dia', 'day', 'time',
      'inicio', 'fin', 'start', 'end', 'periodo', 'period'
    ];
    if (datePatterns.some(p => lowerName.includes(p)) || 
        ['DATE', 'TIMESTAMP', 'DATETIME', 'TIME'].includes(type)) {
      return 'date';
    }
    
    // Category patterns (Spanish + English)
    const categoryPatterns = [
      'tipo', 'type', 'categoria', 'category', 'estado', 'status',
      'area', 'departamento', 'department', 'region', 'zona', 'zone',
      'nivel', 'level', 'riesgo', 'risk', 'prioridad', 'priority',
      'clasificacion', 'classification', 'grupo', 'group', 'segmento', 'segment',
      'canal', 'channel', 'fuente', 'source', 'origen', 'pais', 'country',
      'ciudad', 'city', 'sector', 'industria', 'industry', 'sub_categoria'
    ];
    if (categoryPatterns.some(p => lowerName.includes(p))) {
      return 'category';
    }
    
    // Metric patterns (Spanish + English)
    const metricPatterns = [
      'total', 'amount', 'monto', 'valor', 'value', 'precio', 'price',
      'cantidad', 'quantity', 'count', 'suma', 'sum', 'promedio', 'average',
      'porcentaje', 'percentage', 'tasa', 'rate', 'costo', 'cost',
      'ingreso', 'revenue', 'ganancia', 'profit', 'descuento', 'discount',
      'puntos', 'points', 'score', 'rating', 'peso', 'weight'
    ];
    if (metricPatterns.some(p => lowerName.includes(p)) ||
        ['INTEGER', 'INT64', 'FLOAT', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC', 'DECIMAL'].includes(type)) {
      // Additional check: if it's numeric but looks like an ID, classify as identifier
      if (lowerName.includes('id') || lowerName.includes('codigo') || lowerName.includes('code')) {
        return 'identifier';
      }
      return 'metric';
    }
    
    // Identifier patterns (Spanish + English)
    const identifierPatterns = [
      'id', 'codigo', 'code', 'clave', 'key', 'numero', 'number',
      'documento', 'document', 'rut', 'dni', 'nit', 'cedula',
      'referencia', 'reference', 'folio', 'ticket', 'orden', 'order'
    ];
    if (identifierPatterns.some(p => lowerName.includes(p))) {
      return 'identifier';
    }
    
    // Text fields that might be names/descriptions
    if (['STRING', 'TEXT'].includes(type)) {
      const textPatterns = ['nombre', 'name', 'descripcion', 'description', 'titulo', 'title', 'comentario', 'comment', 'nota', 'note', 'email', 'telefono', 'phone', 'direccion', 'address'];
      if (textPatterns.some(p => lowerName.includes(p))) {
        return 'text';
      }
    }
    
    return 'unknown';
  }

  /**
   * Generate business context from table analyses
   */
  private generateBusinessContext(analyses: TableAnalysis[]): BusinessContextConfig {
    const queryTemplates: Record<string, QueryTemplate> = {};
    const tableAliases: Record<string, string> = {};
    const columnAliases: Record<string, Record<string, string>> = {};
    const keyColumns: Record<string, string[]> = {};
    const dateColumns: Record<string, string> = {};
    const commonFilters: Record<string, string> = {};
    
    // Add common filters
    commonFilters['este año'] = `EXTRACT(YEAR FROM CURRENT_DATE())`;
    commonFilters['este mes'] = `EXTRACT(MONTH FROM CURRENT_DATE())`;
    
    for (const analysis of analyses) {
      const tableName = analysis.tableId;
      const friendlyName = this.generateFriendlyName(tableName);
      
      // Table aliases
      tableAliases[friendlyName.toLowerCase()] = `${analysis.datasetId}.${analysis.tableId}`;
      tableAliases[tableName.toLowerCase()] = `${analysis.datasetId}.${analysis.tableId}`;
      
      // Key columns
      if (analysis.identifierColumns.length > 0) {
        keyColumns[tableName] = analysis.identifierColumns.map(c => c.name);
      }
      
      // Date column (use first one found)
      if (analysis.dateColumns.length > 0) {
        dateColumns[tableName] = analysis.dateColumns[0].name;
      }
      
      // Generate queries for this table
      const tableQueries = this.generateQueriesForTable(analysis);
      Object.assign(queryTemplates, tableQueries);
    }
    
    // Determine industry based on table names
    const industry = this.detectIndustry(analyses);
    
    return {
      clientName: `Auto-Generated: ${this.projectId}`,
      projectId: this.projectId,
      industry,
      language: 'es',
      queryTemplates,
      tableAliases,
      columnAliases,
      keyColumns,
      commonFilters,
      dateColumns
    };
  }

  /**
   * Generate queries for a specific table based on its analysis
   */
  private generateQueriesForTable(analysis: TableAnalysis): Record<string, QueryTemplate> {
    const queries: Record<string, QueryTemplate> = {};
    const friendlyName = this.generateFriendlyName(analysis.tableId);
    const selectColumns = this.getMainSelectColumns(analysis);
    
    // 1. Query: Recent records (if has date column)
    if (analysis.dateColumns.length > 0) {
      const dateCol = analysis.dateColumns[0].name;
      queries[`últimos ${friendlyName}`] = {
        description: `Últimos registros de ${friendlyName}`,
        sql: `SELECT ${selectColumns} FROM ${analysis.fullName} ORDER BY ${dateCol} DESC LIMIT 50`,
        tags: [friendlyName, 'recientes']
      };
      
      // Query: Records this month/year
      const hasYearCol = analysis.dateColumns.find(c => 
        c.name.toLowerCase().includes('año') || c.name.toLowerCase().includes('anio') || c.name.toLowerCase().includes('year')
      );
      const hasMonthCol = analysis.dateColumns.find(c =>
        c.name.toLowerCase().includes('mes') || c.name.toLowerCase().includes('month')
      );
      
      if (hasYearCol && hasMonthCol) {
        queries[`${friendlyName} del mes`] = {
          description: `${friendlyName} del mes actual`,
          sql: `SELECT ${selectColumns} FROM ${analysis.fullName} WHERE ${hasYearCol.name} = EXTRACT(YEAR FROM CURRENT_DATE()) ORDER BY ${dateCol} DESC LIMIT 100`,
          tags: [friendlyName, 'mensual']
        };
      } else if (['DATE', 'TIMESTAMP', 'DATETIME'].includes(analysis.dateColumns[0].type)) {
        queries[`${friendlyName} del mes`] = {
          description: `${friendlyName} del mes actual`,
          sql: `SELECT ${selectColumns} FROM ${analysis.fullName} WHERE ${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH) ORDER BY ${dateCol} DESC LIMIT 100`,
          tags: [friendlyName, 'mensual']
        };
      }
    }
    
    // 2. Query: Distribution by category (if has category columns)
    if (analysis.categoryColumns.length > 0) {
      const catCol = analysis.categoryColumns[0].name;
      const catFriendlyName = this.generateFriendlyName(catCol);
      
      queries[`${friendlyName} por ${catFriendlyName}`] = {
        description: `Distribución de ${friendlyName} por ${catFriendlyName}`,
        sql: `SELECT ${catCol}, COUNT(*) as total FROM ${analysis.fullName} GROUP BY ${catCol} ORDER BY total DESC`,
        tags: [friendlyName, 'distribución', catFriendlyName]
      };
      
      // If there's a "risk" or "status" category, generate filter queries
      const riskCol = analysis.categoryColumns.find(c => 
        c.name.toLowerCase().includes('riesgo') || c.name.toLowerCase().includes('risk') ||
        c.name.toLowerCase().includes('nivel') || c.name.toLowerCase().includes('prioridad')
      );
      if (riskCol) {
        queries[`${friendlyName} críticos`] = {
          description: `${friendlyName} con nivel alto o crítico`,
          sql: `SELECT ${selectColumns} FROM ${analysis.fullName} WHERE LOWER(${riskCol.name}) IN ('alto', 'crítico', 'high', 'critical', 'urgente') ORDER BY ${analysis.dateColumns[0]?.name || riskCol.name} DESC LIMIT 50`,
          tags: [friendlyName, 'crítico', 'alertas']
        };
      }
    }
    
    // 3. Query: Aggregations (if has metric columns)
    if (analysis.metricColumns.length > 0 && analysis.categoryColumns.length > 0) {
      const metricCol = analysis.metricColumns[0].name;
      const catCol = analysis.categoryColumns[0].name;
      
      queries[`totales ${friendlyName}`] = {
        description: `Totales de ${friendlyName} por ${this.generateFriendlyName(catCol)}`,
        sql: `SELECT ${catCol}, SUM(${metricCol}) as total, COUNT(*) as cantidad FROM ${analysis.fullName} GROUP BY ${catCol} ORDER BY total DESC`,
        tags: [friendlyName, 'totales', 'agregación']
      };
    }
    
    // 4. Query: Top performers (if has identifier/name and can be grouped)
    const nameCol = analysis.columns.find(c => 
      c.name.toLowerCase().includes('nombre') || c.name.toLowerCase().includes('name') ||
      c.name.toLowerCase().includes('colaborador') || c.name.toLowerCase().includes('empleado') ||
      c.name.toLowerCase().includes('cliente') || c.name.toLowerCase().includes('customer')
    );
    if (nameCol && analysis.categoryColumns.length > 0) {
      queries[`top ${friendlyName}`] = {
        description: `Top 10 por cantidad de ${friendlyName}`,
        sql: `SELECT ${nameCol.name}, ${analysis.categoryColumns[0]?.name ? analysis.categoryColumns[0].name + ', ' : ''}COUNT(*) as total FROM ${analysis.fullName} GROUP BY ${nameCol.name}${analysis.categoryColumns[0]?.name ? ', ' + analysis.categoryColumns[0].name : ''} ORDER BY total DESC LIMIT 10`,
        tags: [friendlyName, 'ranking', 'top']
      };
    }
    
    // 5. Query: Summary/Overview
    queries[`resumen ${friendlyName}`] = {
      description: `Resumen general de ${friendlyName}`,
      sql: this.generateSummaryQuery(analysis),
      tags: [friendlyName, 'resumen', 'overview']
    };
    
    return queries;
  }

  /**
   * Generate a summary query for a table
   */
  private generateSummaryQuery(analysis: TableAnalysis): string {
    const parts: string[] = ['SELECT'];
    const selects: string[] = ['COUNT(*) as total_registros'];
    
    // Add distinct counts for important columns
    if (analysis.identifierColumns.length > 0) {
      const idCol = analysis.identifierColumns[0].name;
      selects.push(`COUNT(DISTINCT ${idCol}) as ${idCol}_unicos`);
    }
    
    // Add category distributions
    for (const cat of analysis.categoryColumns.slice(0, 2)) {
      selects.push(`COUNT(DISTINCT ${cat.name}) as tipos_${cat.name}`);
    }
    
    // Add metric aggregations
    for (const metric of analysis.metricColumns.slice(0, 2)) {
      if (!metric.name.toLowerCase().includes('id')) {
        selects.push(`SUM(${metric.name}) as total_${metric.name}`);
        selects.push(`AVG(${metric.name}) as promedio_${metric.name}`);
      }
    }
    
    parts.push(selects.join(', '));
    parts.push(`FROM ${analysis.fullName}`);
    
    return parts.join(' ');
  }

  /**
   * Get main columns for SELECT statements
   */
  private getMainSelectColumns(analysis: TableAnalysis): string {
    const columns: string[] = [];
    
    // Add identifiers first
    for (const col of analysis.identifierColumns.slice(0, 2)) {
      columns.push(col.name);
    }
    
    // Add date columns
    for (const col of analysis.dateColumns.slice(0, 2)) {
      if (!columns.includes(col.name)) {
        columns.push(col.name);
      }
    }
    
    // Add category columns
    for (const col of analysis.categoryColumns.slice(0, 3)) {
      if (!columns.includes(col.name)) {
        columns.push(col.name);
      }
    }
    
    // Add some text columns (names, descriptions)
    const textCols = analysis.columns.filter(c => c.semanticType === 'text');
    for (const col of textCols.slice(0, 2)) {
      if (!columns.includes(col.name)) {
        columns.push(col.name);
      }
    }
    
    // If we have too few columns, add more
    if (columns.length < 5) {
      for (const col of analysis.columns) {
        if (!columns.includes(col.name) && columns.length < 8) {
          columns.push(col.name);
        }
      }
    }
    
    return columns.length > 0 ? columns.join(', ') : '*';
  }

  /**
   * Generate a friendly name from a table/column name
   */
  private generateFriendlyName(name: string): string {
    // Remove common prefixes/suffixes
    let friendly = name
      .replace(/^(tbl_|tb_|t_|dim_|fact_|stg_)/i, '')
      .replace(/(_table|_data|_info)$/i, '');
    
    // Convert camelCase or snake_case to spaces
    friendly = friendly
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase();
    
    return friendly;
  }

  /**
   * Detect industry based on table names and columns
   */
  private detectIndustry(analyses: TableAnalysis[]): string {
    const allNames = analyses.flatMap(a => [
      a.tableId.toLowerCase(),
      ...a.columns.map(c => c.name.toLowerCase())
    ]).join(' ');
    
    if (allNames.includes('seguridad') || allNames.includes('riesgo') || allNames.includes('incidente')) {
      return 'seguridad';
    }
    if (allNames.includes('venta') || allNames.includes('orden') || allNames.includes('producto') || allNames.includes('cliente')) {
      return 'ecommerce';
    }
    if (allNames.includes('paciente') || allNames.includes('diagnostico') || allNames.includes('medico')) {
      return 'salud';
    }
    if (allNames.includes('transaccion') || allNames.includes('cuenta') || allNames.includes('balance')) {
      return 'finanzas';
    }
    if (allNames.includes('evento') || allNames.includes('sesion') || allNames.includes('usuario')) {
      return 'analytics';
    }
    
    return 'general';
  }
}


/**
 * Business Context Manager for BigQuery
 * 
 * Provides semantic mapping for business terminology:
 * - Maps business terms to SQL queries
 * - Provides table/column aliases
 * - Stores common query templates
 * - Enables natural language to SQL mapping
 * 
 * @author alexsix6
 */

import { promises as fs } from 'fs';

/**
 * Query template with metadata
 */
export interface QueryTemplate {
  description: string;
  sql: string;
  parameters?: {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    description: string;
    default?: string;
  }[];
  tags?: string[];
}

/**
 * Business context configuration
 */
export interface BusinessContextConfig {
  clientName: string;
  projectId?: string;
  industry?: string;
  language?: 'es' | 'en' | 'pt';
  
  queryTemplates: Record<string, QueryTemplate>;
  tableAliases: Record<string, string>;
  columnAliases: Record<string, Record<string, string>>;
  keyColumns: Record<string, string[]>;
  commonFilters: Record<string, string>;
  dateColumns: Record<string, string>;
  
  metrics?: Record<string, {
    name: string;
    sql: string;
    description: string;
  }>;
}

const DEFAULT_CONTEXT: BusinessContextConfig = {
  clientName: 'default',
  language: 'es',
  queryTemplates: {},
  tableAliases: {},
  columnAliases: {},
  keyColumns: {},
  commonFilters: {},
  dateColumns: {},
};

/**
 * Business Context Manager
 */
export class BusinessContext {
  private config: BusinessContextConfig;
  private loaded = false;

  constructor(config?: Partial<BusinessContextConfig>) {
    this.config = { ...DEFAULT_CONTEXT, ...config };
  }

  async loadFromFile(filePath: string): Promise<boolean> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<BusinessContextConfig>;
      this.config = { ...DEFAULT_CONTEXT, ...parsed };
      this.loaded = true;
      console.error(`[BusinessContext] Loaded context for: ${this.config.clientName}`);
      return true;
    } catch (error) {
      console.error(`[BusinessContext] Failed to load context:`, error);
      return false;
    }
  }

  async saveToFile(filePath: string): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  getQueryTemplate(term: string): QueryTemplate | null {
    const normalizedTerm = term.toLowerCase().trim();
    
    if (this.config.queryTemplates[normalizedTerm]) {
      return this.config.queryTemplates[normalizedTerm];
    }
    
    for (const [key, template] of Object.entries(this.config.queryTemplates)) {
      if (normalizedTerm.includes(key) || key.includes(normalizedTerm)) {
        return template;
      }
    }
    
    return null;
  }

  addQueryTemplate(term: string, template: QueryTemplate): void {
    this.config.queryTemplates[term.toLowerCase()] = template;
  }

  listQueryTemplates(): { term: string; description: string }[] {
    return Object.entries(this.config.queryTemplates).map(([term, template]) => ({
      term,
      description: template.description,
    }));
  }

  resolveTableAlias(alias: string): string {
    const normalizedAlias = alias.toLowerCase().trim();
    return this.config.tableAliases[normalizedAlias] || alias;
  }

  resolveColumnAlias(table: string, column: string): string {
    const tableAliases = this.config.columnAliases[table.toLowerCase()];
    if (!tableAliases) return column;
    return tableAliases[column.toLowerCase()] || column;
  }

  getKeyColumns(table: string): string[] {
    return this.config.keyColumns[table.toLowerCase()] || [];
  }

  getDateColumn(table: string): string | null {
    return this.config.dateColumns[table.toLowerCase()] || null;
  }

  getCommonFilter(filterName: string): string | null {
    return this.config.commonFilters[filterName.toLowerCase()] || null;
  }

  applyFilters(sql: string, filterNames: string[]): string {
    const conditions: string[] = [];
    
    for (const filterName of filterNames) {
      const filter = this.getCommonFilter(filterName);
      if (filter) {
        conditions.push(filter);
      }
    }
    
    if (conditions.length === 0) return sql;
    
    if (sql.toUpperCase().includes('WHERE')) {
      return `${sql} AND ${conditions.join(' AND ')}`;
    } else {
      return `${sql} WHERE ${conditions.join(' AND ')}`;
    }
  }

  interpretQuery(naturalLanguage: string): {
    type: 'template' | 'table' | 'unknown';
    sql?: string;
    table?: string;
    filters?: string[];
    suggestions?: string[];
  } {
    const normalized = naturalLanguage.toLowerCase().trim();
    
    const template = this.getQueryTemplate(normalized);
    if (template) {
      return { type: 'template', sql: template.sql };
    }
    
    for (const [alias, table] of Object.entries(this.config.tableAliases)) {
      if (normalized.includes(alias)) {
        const filters: string[] = [];
        for (const filterName of Object.keys(this.config.commonFilters)) {
          if (normalized.includes(filterName)) {
            filters.push(filterName);
          }
        }
        return { type: 'table', table, filters };
      }
    }
    
    return {
      type: 'unknown',
      suggestions: this.listQueryTemplates().map(t => t.term).slice(0, 5),
    };
  }

  getConfig(): BusinessContextConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BusinessContextConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getClientName(): string {
    return this.config.clientName;
  }

  getMetric(name: string): { name: string; sql: string; description: string } | null {
    return this.config.metrics?.[name.toLowerCase()] || null;
  }
}

/**
 * Create a sample BigQuery analytics context
 */
export function createAnalyticsContext(clientName: string, projectId: string): BusinessContext {
  return new BusinessContext({
    clientName,
    projectId,
    industry: 'analytics',
    language: 'es',
    
    queryTemplates: {
      'eventos del mes': {
        description: 'Eventos del mes actual',
        sql: `SELECT * FROM \`${projectId}.analytics.events\` 
              WHERE event_date >= DATE_TRUNC(CURRENT_DATE(), MONTH)
              LIMIT 1000`,
        tags: ['eventos', 'mensual'],
      },
      'usuarios activos': {
        description: 'Usuarios con actividad reciente',
        sql: `SELECT DISTINCT user_id, MAX(event_date) as last_activity
              FROM \`${projectId}.analytics.events\`
              WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
              GROUP BY user_id`,
        tags: ['usuarios', 'activos'],
      },
    },
    
    tableAliases: {
      'eventos': 'analytics.events',
      'usuarios': 'analytics.users',
      'sesiones': 'analytics.sessions',
    },
    
    columnAliases: {},
    keyColumns: {},
    commonFilters: {
      'hoy': "event_date = CURRENT_DATE()",
      'esta semana': "event_date >= DATE_TRUNC(CURRENT_DATE(), WEEK)",
      'este mes': "event_date >= DATE_TRUNC(CURRENT_DATE(), MONTH)",
    },
    dateColumns: {},
  });
}


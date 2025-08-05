#!/usr/bin/env node
import { SemanticAnalyzer } from './semantic-analyzer.js';

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from '@google-cloud/bigquery';

import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import os from 'os';

// Intelligent server interfaces
interface ServerConfig {
  projectId: string;
  location?: string;
  keyFilename?: string;
}

interface CachedTableInfo {
  datasetId: string;
  tableId: string;
  schema: any[];
  rowCount?: string;
  tableType?: string;
  lastUpdated: number;
  sampleData?: any[];
}

interface QueryAnalysis {
  complexity: 'simple' | 'moderate' | 'complex';
  requiresOptimization: boolean;
  isExploration: boolean;
  tableReferences: string[];
  estimatedCost: 'low' | 'medium' | 'high';
  userType: 'technical' | 'business';
}

interface ExecutionStrategy {
  useCache: boolean;
  addLimits: boolean;
  autoQualify: boolean;
  provideSuggestions: boolean;
  enableFallback: boolean;
}

// Global state for intelligent operation
const tableCache = new Map<string, CachedTableInfo>();
const queryHistory = new Map<string, number>();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
const CACHE_FILE = path.join(os.homedir(), '.bigquery-mcp-intelligent-cache.json');

// Enhanced logging system
class IntelligentLogger {
  private static logLevel: 'silent' | 'normal' | 'verbose' = 'normal';
  
  static setLogLevel(level: 'silent' | 'normal' | 'verbose') {
    this.logLevel = level;
  }
  
  static info(message: string, metadata?: any) {
    if (this.logLevel !== 'silent') {
      console.error(`[${new Date().toISOString()}] 🧠 ${message}`, metadata || '');
    }
  }
  
  static success(message: string, metadata?: any) {
    if (this.logLevel !== 'silent') {
      console.error(`[${new Date().toISOString()}] ✅ ${message}`, metadata || '');
    }
  }
  
  static warning(message: string, metadata?: any) {
    console.error(`[${new Date().toISOString()}] ⚠️  ${message}`, metadata || '');
  }
  
  static error(message: string, error?: any) {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, error || '');
  }
  
  static strategy(message: string, strategy: any) {
    if (this.logLevel === 'verbose') {
      console.error(`[${new Date().toISOString()}] 🎯 ${message}`, strategy);
    }
  }
}

// Intelligent Query Analyzer
class QueryAnalyzer {
  static analyze(query: string, context?: any): QueryAnalysis {
    const lowerQuery = query.toLowerCase();
    
    // Detect complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (lowerQuery.includes('join') || lowerQuery.includes('group by') || lowerQuery.includes('window')) {
      complexity = 'complex';
    } else if (lowerQuery.includes('where') && lowerQuery.includes('order by')) {
      complexity = 'moderate';
    }
    
    // Detect if it's exploration vs specific query
    const isExploration = lowerQuery.includes('show') || 
                         lowerQuery.includes('describe') || 
                         lowerQuery.includes('information_schema') ||
                         lowerQuery.includes('select *') ||
                         !lowerQuery.includes('where');
    
    // Extract table references
    const tableReferences = this.extractTableReferences(query);
    
    // Estimate cost based on patterns
    let estimatedCost: 'low' | 'medium' | 'high' = 'low';
    if (lowerQuery.includes('select *') && !lowerQuery.includes('limit')) {
      estimatedCost = 'high';
    } else if (tableReferences.length > 1 || lowerQuery.includes('group by')) {
      estimatedCost = 'medium';
    }
    
    // Detect user type based on query patterns
    const userType = this.detectUserType(query);
    
    return {
      complexity,
      requiresOptimization: estimatedCost === 'high' || complexity === 'complex',
      isExploration,
      tableReferences,
      estimatedCost,
      userType
    };
  }
  
  private static extractTableReferences(query: string): string[] {
    const tables: string[] = [];
    const fromMatches = query.match(/FROM\s+`?([^`\s]+)`?/gi);
    if (fromMatches) {
      fromMatches.forEach(match => {
        const table = match.replace(/FROM\s+`?/i, '').replace(/`/g, '');
        tables.push(table);
      });
    }
    return tables;
  }
  
  private static detectUserType(query: string): 'technical' | 'business' {
    const technicalPatterns = [
      /SELECT.*JOIN/i,
      /CASE WHEN/i,
      /PARTITION BY/i,
      /WINDOW/i,
      /CTE|WITH/i
    ];
    
    const isTechnical = technicalPatterns.some(pattern => pattern.test(query));
    return isTechnical ? 'technical' : 'business';
  }
}

// Intelligent Strategy Selector
class StrategySelector {
  static selectStrategy(analysis: QueryAnalysis, cacheAvailable: boolean): ExecutionStrategy {
    const strategy: ExecutionStrategy = {
      useCache: cacheAvailable,
      addLimits: false,
      autoQualify: true,
      provideSuggestions: false,
      enableFallback: true
    };
    
    // Adjust strategy based on analysis
    if (analysis.requiresOptimization) {
      strategy.addLimits = true;
      strategy.provideSuggestions = true;
    }
    
    if (analysis.userType === 'business') {
      strategy.provideSuggestions = true;
    }
    
    if (analysis.estimatedCost === 'high') {
      strategy.addLimits = true;
    }
    
    IntelligentLogger.strategy('Selected execution strategy', strategy);
    return strategy;
  }
}

// Main Intelligent BigQuery Server
class IntelligentBigQueryServer {
  private server: Server;
  private bigquery: BigQuery;
  private config: ServerConfig;
  private resourceBaseUrl: URL;
  private isInitialized = false;
  private fallbackMode = false;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: "intelligent-mcp-server/bigquery",
        version: "2.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      },
    );
    
    this.bigquery = new BigQuery({
      projectId: config.projectId,
      ...(config.keyFilename && { keyFilename: config.keyFilename })
    });
    
    this.resourceBaseUrl = new URL(`bigquery://${config.projectId}`);
    this.setupHandlers();
  }

  // Intelligent initialization with fallback
  async initialize(): Promise<void> {
    IntelligentLogger.info(`Initializing Intelligent BigQuery Server for project: ${this.config.projectId}`);
    
    try {
      // Try to load cache first (fastest startup)
      const cacheLoaded = await this.loadCacheFromFile();
      
      if (!cacheLoaded) {
        // Cache miss - perform intelligent exploration
        await this.intelligentExploration();
      } else {
        IntelligentLogger.success('Using cached project information for instant startup');
      }
      
      this.isInitialized = true;
      this.printIntelligentSummary();
      
    } catch (error: any) {
      IntelligentLogger.warning('Enhanced initialization failed, enabling fallback mode', error.message);
      this.fallbackMode = true;
      this.isInitialized = true;
    }
  }

  // Intelligent exploration with error recovery
  private async intelligentExploration(): Promise<void> {
    IntelligentLogger.info('Starting intelligent project exploration...');
    
    try {
      const startTime = Date.now();
      const [datasets] = await this.bigquery.getDatasets();
      IntelligentLogger.info(`Discovered ${datasets.length} datasets`);
      
      let successfulTables = 0;
      let totalTables = 0;
      
      for (const dataset of datasets) {
        try {
          const [tables] = await dataset.getTables();
          IntelligentLogger.info(`Dataset ${dataset.id}: ${tables.length} tables found`);
          totalTables += tables.length;
          
          for (const table of tables) {
            try {
              await this.intelligentCacheTable(dataset.id!, table.id!);
              successfulTables++;
            } catch (tableError: any) {
              IntelligentLogger.warning(`Could not cache table ${dataset.id}.${table.id}:`, tableError.message);
              // Continue with other tables
            }
          }
        } catch (datasetError: any) {
          IntelligentLogger.warning(`Could not access dataset ${dataset.id}:`, datasetError.message);
          // Continue with other datasets
        }
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      IntelligentLogger.success(`Exploration complete! Cached ${successfulTables}/${totalTables} tables in ${duration}s`);
      
      // Save successful exploration to cache
      await this.saveCacheToFile();
      
    } catch (error: any) {
      IntelligentLogger.error('Project exploration failed:', error.message);
      throw error;
    }
  }

  // Intelligent table caching with smart sampling
  private async intelligentCacheTable(datasetId: string, tableId: string): Promise<void> {
    const cacheKey = `${datasetId}.${tableId}`;
    
    try {
      const dataset = this.bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      const [metadata] = await table.getMetadata();
      
      // Smart sample data collection
      let sampleData: any[] = [];
      const rowCount = parseInt(metadata.numRows || '0');
      
      if (rowCount > 0 && rowCount < 10000) { // Only sample small-medium tables
        try {
          const sampleQuery = `SELECT * FROM \`${this.config.projectId}.${datasetId}.${tableId}\` LIMIT 3`;
          const [rows] = await this.bigquery.query({
            query: sampleQuery,
            location: this.config.location,
            maximumBytesBilled: "50000000" // 50MB limit for samples
          });
          sampleData = rows;
        } catch (sampleError: any) {
          IntelligentLogger.info(`Skipping sample data for ${cacheKey} (${sampleError.message})`);
          // Not critical - continue without sample data
        }
      }
      
      const tableInfo: CachedTableInfo = {
        datasetId,
        tableId,
        schema: metadata?.schema?.fields || [],
        rowCount: metadata.numRows,
        tableType: metadata.type,
        lastUpdated: Date.now(),
        sampleData
      };
      
      tableCache.set(cacheKey, tableInfo);
      IntelligentLogger.info(`  ✓ Cached: ${cacheKey} (${metadata.numRows || '?'} rows)`, { silent: true });
      
    } catch (error: any) {
      IntelligentLogger.warning(`Failed to cache ${cacheKey}:`, error.message);
      throw error; // Re-throw to handle at exploration level
    }
  }

  // Intelligent query execution with automatic strategy selection
  private async executeIntelligentQuery(sql: string, options: any = {}): Promise<any> {
    // 1. Analyze the query
    const analysis = QueryAnalyzer.analyze(sql);
    IntelligentLogger.info(`Query analysis: ${analysis.complexity} complexity, ${analysis.estimatedCost} cost`);
    
    // 2. Select optimal strategy
    const strategy = StrategySelector.selectStrategy(analysis, this.isInitialized && !this.fallbackMode);
    
    // 3. Apply intelligent optimizations
    let optimizedSql = sql;
    const optimizations: string[] = [];
    
    if (strategy.autoQualify) {
      const qualifiedSql = this.autoQualifyTables(sql);
      if (qualifiedSql !== sql) {
        optimizedSql = qualifiedSql;
        optimizations.push('Auto-qualified table names');
      }
    }
    
    if (strategy.addLimits && this.needsLimit(sql)) {
      optimizedSql = this.addIntelligentLimit(optimizedSql, analysis);
      optimizations.push('Added intelligent LIMIT');
    }
    
    // 4. Execute with intelligent fallback
    try {
      IntelligentLogger.info(`Executing optimized query...`);
      const startTime = Date.now();
      
      const [rows] = await this.bigquery.query({
        query: optimizedSql,
        location: this.config.location,
        maximumBytesBilled: options.maximumBytesBilled || "1000000000",
      });
      
      const duration = Date.now() - startTime;
      IntelligentLogger.success(`Query completed in ${duration}ms, returned ${rows.length} rows`);
      
      // 5. Generate intelligent response
      return this.generateIntelligentResponse(rows, analysis, strategy, optimizations, options.semanticAnalysis);
      
    } catch (error: any) {
      IntelligentLogger.warning('🔍 [FALLBACK] Enhanced execution failed, trying fallback. Error:', error.message);
      
      if (strategy.enableFallback && optimizedSql !== sql) {
        // Fallback to original query
        try {
          const [rows] = await this.bigquery.query({
            query: sql,
            location: this.config.location,
            maximumBytesBilled: options.maximumBytesBilled || "1000000000",
          });
          
          IntelligentLogger.success('🔍 [FALLBACK] Fallback execution successful - using generateBasicResponse (NO semantic analysis)');
          return this.generateBasicResponse(rows);
          
        } catch (fallbackError: any) {
          IntelligentLogger.error('Both enhanced and fallback execution failed');
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
  }

  // Smart table qualification
  private autoQualifyTables(sql: string): string {
    if (!this.isInitialized || this.fallbackMode) return sql;
    
    let qualifiedSql = sql;
    
    for (const table of tableCache.values()) {
      const shortName = table.tableId;
      const fullName = `\`${this.config.projectId}.${table.datasetId}.${table.tableId}\``;
      
      // Only replace if it's a standalone table name and not already qualified
      const pattern = new RegExp(`\\b${shortName}\\b(?!\\.)`, 'gi');
      if (pattern.test(qualifiedSql) && !qualifiedSql.includes(fullName)) {
        qualifiedSql = qualifiedSql.replace(pattern, fullName);
      }
    }
    
    return qualifiedSql;
  }

  // Intelligent limit addition
  private needsLimit(sql: string): boolean {
    const lowerSql = sql.toLowerCase();
    return lowerSql.includes('select *') && 
           !lowerSql.includes('limit') && 
           !lowerSql.includes('count(');
  }

  private addIntelligentLimit(sql: string, analysis: QueryAnalysis): string {
    // Smart limit based on query type and user
    let limit = 1000; // Default
    
    if (analysis.userType === 'business') {
      limit = 100; // Smaller limit for business users
    } else if (analysis.complexity === 'complex') {
      limit = 500; // Medium limit for complex queries
    }
    
    return `${sql} LIMIT ${limit}`;
  }

  // Intelligent response generation
  private generateIntelligentResponse(rows: any[], analysis: QueryAnalysis, strategy: ExecutionStrategy, optimizations: string[], semanticAnalysis?: any): any {
    let response = "";
    
    // 🔍 DEBUGGING: Log semantic analysis presence
    IntelligentLogger.info(`🔍 [DEBUG] semanticAnalysis received: ${!!semanticAnalysis}`);
    if (semanticAnalysis) {
      IntelligentLogger.info(`🔍 [DEBUG] semanticAnalysis.intentRecognition: ${JSON.stringify(semanticAnalysis.intentRecognition)}`);
    }
    
    // 🧠 Add semantic analysis information for user visibility
    if (semanticAnalysis) {
      response += `\n\n🧠 **ANÁLISIS SEMÁNTICO:**`;
      response += `\n📊 Tipo de consulta: ${semanticAnalysis.intentRecognition.queryType}`;
      response += `\n⚡ Complejidad: ${semanticAnalysis.intentRecognition.complexity}`;
      response += `\n💰 Costo estimado: $${semanticAnalysis.costPrediction.estimatedCost}`;
      
      // Show risk level with appropriate emoji
      const riskEmoji = semanticAnalysis.costPrediction.riskLevel === 'critical' ? '🚨' : 
                       semanticAnalysis.costPrediction.riskLevel === 'high' ? '⚠️' : 
                       semanticAnalysis.costPrediction.riskLevel === 'medium' ? '⚠️' : '✅';
      response += `\n${riskEmoji} Nivel de riesgo: ${semanticAnalysis.costPrediction.riskLevel.toUpperCase()}`;
      
      // Show warning if high risk
      if (semanticAnalysis.costPrediction.warning) {
        response += `\n⚠️ **Advertencia:** ${semanticAnalysis.costPrediction.warning}`;
      }
      
             // Show optimization suggestions
       if (semanticAnalysis.optimizationSuggestions && semanticAnalysis.optimizationSuggestions.length > 0) {
         response += `\n\n💡 **Sugerencias de optimización:**`;
         semanticAnalysis.optimizationSuggestions.slice(0, 3).forEach((suggestion: string) => {
           response += `\n   • ${suggestion}`;
         });
       }
       
       // 🔍 DEBUGGING: Confirm semantic analysis was added
       IntelligentLogger.info(`🔍 [DEBUG] Semantic analysis added to response`);

     }

     // Add JSON data for all queries
     response += `\n\n📋 **DATOS:**\n${JSON.stringify(rows, null, 2)}`;
    
    // Add helpful context for business users
    if (analysis.userType === 'business' && rows.length > 0) {
      response += `\n\n📊 Query returned ${rows.length} results`;
      
      if (optimizations.length > 0) {
        response += `\n🔧 Automatic optimizations applied: ${optimizations.join(', ')}`;
      }
    }
    
    // Add column suggestions if relevant
    if (strategy.provideSuggestions) {
      const suggestions = this.generateContextualSuggestions(analysis);
      if (suggestions.length > 0) {
        response += `\n\n💡 Related columns you might find useful:\n${suggestions.slice(0, 5).join('\n')}`;
      }
    }
    
         // 🔍 DEBUGGING: Log exact response being sent to Claude Desktop
     const finalResponse = {
       content: [{ type: "text", text: response }],
       isError: false,
     };
     
     IntelligentLogger.info(`🔍 [RESPONSE] Sending to Claude Desktop - length: ${response.length} chars`);
     IntelligentLogger.info(`🔍 [RESPONSE] Preview: ${response.substring(0, 200)}...`);
     if (semanticAnalysis) {
       IntelligentLogger.info(`🔍 [RESPONSE] Contains semantic analysis: YES`);
     }
     
     return finalResponse;
  }

  private generateBasicResponse(rows: any[]): any {
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      isError: false,
    };
  }

  // Generate contextual suggestions based on cached schemas
  private generateContextualSuggestions(analysis: QueryAnalysis): string[] {
    const suggestions: string[] = [];
    
    if (!this.isInitialized || this.fallbackMode) return suggestions;
    
    analysis.tableReferences.forEach(tableRef => {
      const parts = tableRef.split('.');
      const tableId = parts[parts.length - 1];
      
      for (const table of tableCache.values()) {
        if (table.tableId.toLowerCase().includes(tableId.toLowerCase())) {
          if (table?.schema && Array.isArray(table.schema)) {
            table.schema.forEach(field => {
              if (field.name.toLowerCase().includes('name') || 
                  field.name.toLowerCase().includes('id') ||
                  field.name.toLowerCase().includes('date') ||
                  field.name.toLowerCase().includes('key')) {
                suggestions.push(`Consider filtering by ${field.name}`);
              }
            });
          } else {
            IntelligentLogger.warning(`Table ${table?.tableId || 'unknown'} has invalid schema, skipping contextual suggestions`);
          }
        }
      }
    });
    
    return [...new Set(suggestions)]; // Remove duplicates
  }

  // Cache management
  private async loadCacheFromFile(): Promise<boolean> {
    try {
      const data = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
      
      if (Date.now() - data.timestamp > CACHE_DURATION || data.projectId !== this.config.projectId) {
        IntelligentLogger.info('Cache expired or different project, will refresh');
        return false;
      }
      
      tableCache.clear();
      data.tables.forEach((table: CachedTableInfo) => {
        const key = `${table.datasetId}.${table.tableId}`;
        tableCache.set(key, table);
      });
      
      IntelligentLogger.success(`Loaded ${tableCache.size} tables from cache`);
      return true;
    } catch (error: any) {
      IntelligentLogger.info('No valid cache found, will perform fresh exploration');
      return false;
    }
  }

  private async saveCacheToFile(): Promise<void> {
    try {
      const cacheData = {
        timestamp: Date.now(),
        projectId: this.config.projectId,
        tables: Array.from(tableCache.values())
      };
      
      await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
      IntelligentLogger.success('Intelligent cache saved to disk');
    } catch (error: any) {
      IntelligentLogger.warning('Failed to save cache:', error.message);
    }
  }

  private printIntelligentSummary(): void {
    // Log only to stderr to avoid interfering with MCP JSON communication
    console.error(`[${new Date().toISOString()}] 🧠 INTELLIGENT BIGQUERY SERVER READY`);
    console.error(`[${new Date().toISOString()}] 🧠 Project: ${this.config.projectId}`);
    console.error(`[${new Date().toISOString()}] 🧠 Mode: ${this.fallbackMode ? 'Fallback' : 'Enhanced'}`);
    console.error(`[${new Date().toISOString()}] 🧠 Cached Tables: ${tableCache.size}`);
    console.error(`[${new Date().toISOString()}] 🧠 Capabilities: Auto-optimization, Intelligent fallback, Natural conversations`);
  }

  // Handler setup
  setupHandlers() {
    // Intelligent ListResources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        IntelligentLogger.info('Listing resources with intelligent caching...');
        
        if (tableCache.size > 0) {
          const resources = [];
          
          for (const table of tableCache.values()) {
            resources.push({
              uri: new URL(`${table.datasetId}/${table.tableId}/schema`, this.resourceBaseUrl).href,
              mimeType: "application/json",
              name: `"${table.datasetId}.${table.tableId}" ${table.tableType || 'table'} (${table.rowCount || '?'} rows)`,
            });
          }
          
          IntelligentLogger.success(`Returned ${resources.length} cached resources`);
          return { resources };
        }
        
        // Fallback to live discovery
        IntelligentLogger.info('Cache unavailable, performing live discovery...');
        const [datasets] = await this.bigquery.getDatasets();
        const resources = [];

        for (const dataset of datasets) {
          const [tables] = await dataset.getTables();
          
          for (const table of tables) {
            const [metadata] = await table.getMetadata();
            const resourceType = metadata.type === 'VIEW' ? 'view' : 'table';
            
            resources.push({
              uri: new URL(`${dataset.id}/${table.id}/schema`, this.resourceBaseUrl).href,
              mimeType: "application/json",
              name: `"${dataset.id}.${table.id}" ${resourceType} schema`,
            });
          }
        }

        return { resources };
      } catch (error) {
        IntelligentLogger.error('Error in ListResources:', error);
        throw error;
      }
    });

    // Intelligent ReadResource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceUrl = new URL(request.params.uri);
      const pathComponents = resourceUrl.pathname.split("/");
      const schema = pathComponents.pop();
      const tableId = pathComponents.pop();
      const datasetId = pathComponents.pop();

      if (schema !== "schema") {
        throw new Error("Invalid resource URI");
      }

      const cacheKey = `${datasetId}.${tableId}`;
      const cached = tableCache.get(cacheKey);
      
      if (cached) {
        IntelligentLogger.info(`Returning enhanced cached schema for ${cacheKey}`);
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify({
                schema: cached.schema,
                rowCount: cached.rowCount,
                tableType: cached.tableType,
                sampleData: cached.sampleData,
                lastUpdated: new Date(cached.lastUpdated).toISOString(),
                fullTableName: `\`${this.config.projectId}.${datasetId}.${tableId}\``,
                intelligent: true
              }, null, 2),
            },
          ],
        };
      }
      
      // Intelligent fallback
      IntelligentLogger.info(`Cache miss for ${cacheKey}, using intelligent fallback`);
      const dataset = this.bigquery.dataset(datasetId!);
      const table = dataset.table(tableId!);
      const [metadata] = await table.getMetadata();

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify({
              schema: metadata?.schema?.fields || [],
              intelligent: true,
              fallback: true
            }, null, 2),
          },
        ],
      };
    });

    // Intelligent Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      IntelligentLogger.info('🔍 [TOOLS] ListToolsRequestSchema called - returning available tools');
      return {
        tools: [
          {
            name: "query",
            description: "Execute intelligent BigQuery SQL with automatic optimization and natural language support",
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string" },
                maximumBytesBilled: { 
                  type: "string",
                  description: "Maximum bytes billed (default: 1GB)",
                  optional: true
                }
              },
            },
          },
          {
            name: "explore",
            description: "Intelligently explore BigQuery datasets and tables with contextual information",
            inputSchema: {
              type: "object",
              properties: {
                dataset: { 
                  type: "string",
                  description: "Optional: specific dataset to explore",
                  optional: true
                },
                includeData: {
                  type: "boolean",
                  description: "Include sample data in results (default: false)",
                  optional: true
                }
              },
            },
          },
          {
            name: "refresh",
            description: "Refresh the intelligent cache with latest BigQuery schema information",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    // Intelligent CallTool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      IntelligentLogger.info(`🔍 [CALLTOOL] CallToolRequestSchema called with tool: ${request.params.name}`);
      
             if (request.params.name === "query") {
         const sql = request.params.arguments?.sql as string;
         const maximumBytesBilled = request.params.arguments?.maximumBytesBilled;
         
         IntelligentLogger.info(`🔍 [SQL-RECEIVED] ${sql}`);
        
        // Validate read-only operations
        const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|MERGE|TRUNCATE|GRANT|REVOKE|EXECUTE|BEGIN|COMMIT|ROLLBACK)\b/i;
        if (forbiddenPattern.test(sql)) {
          throw new Error('Only READ operations are allowed');
        }

        // 🧠 Análisis Semántico y Detección Predictiva
        const semanticAnalysis = SemanticAnalyzer.analyzeQuery(sql);
        
        // Log análisis para debugging
        IntelligentLogger.info(`Semantic Analysis: ${semanticAnalysis.intentRecognition.queryType} query`, {
          complexity: semanticAnalysis.intentRecognition.complexity,
          riskLevel: semanticAnalysis.costPrediction.riskLevel,
          estimatedCost: semanticAnalysis.costPrediction.estimatedCost
        });

        
        // Advertir sobre consultas de alto riesgo
        if (SemanticAnalyzer.shouldWarnUser(semanticAnalysis)) {
          IntelligentLogger.warning(`High-risk query detected`, {
            riskLevel: semanticAnalysis.costPrediction.riskLevel,
            warning: semanticAnalysis.costPrediction.warning,
            suggestions: semanticAnalysis.optimizationSuggestions.slice(0, 2)
          });
        }

        try {
          return await this.executeIntelligentQuery(sql, { maximumBytesBilled, semanticAnalysis });
        } catch (error) {
          IntelligentLogger.error('Query execution failed:', error);
          throw error;
        }
      }
      
      if (request.params.name === "explore") {
        const dataset = request.params.arguments?.dataset;
        const includeData = request.params.arguments?.includeData || false;
        
        IntelligentLogger.info(`Intelligent exploration requested for ${dataset || 'all datasets'}`);
        
        let explorationData: any = {};
        
        if (this.fallbackMode) {
          explorationData = {
            message: "Exploration available in basic mode",
            fallback: true
          };
        } else if (dataset) {
          const tables = Array.from(tableCache.values())
            .filter(table => table.datasetId === dataset)
            .map(table => ({
              name: table.tableId,
              fullName: `\`${this.config.projectId}.${table.datasetId}.${table.tableId}\``,
              rowCount: table.rowCount,
              tableType: table.tableType,
              columnCount: table?.schema?.length || 0,
              keyColumns: (table?.schema && Array.isArray(table.schema)) 
                ? table.schema
                    .filter(field => field.name.toLowerCase().includes('id') || 
                                   field.name.toLowerCase().includes('name') ||
                                   field.name.toLowerCase().includes('date'))
                    .map(field => `${field.name} (${field.type})`)
                    .slice(0, 5)
                : [],
              ...(includeData && { sampleData: table.sampleData })
            }));
          
          explorationData = {
            dataset,
            tableCount: tables.length,
            tables,
            intelligent: true
          };
        } else {
          const datasets = new Map();
          for (const table of tableCache.values()) {
            if (!datasets.has(table.datasetId)) {
              datasets.set(table.datasetId, {
                name: table.datasetId,
                tables: [],
                totalRows: 0
              });
            }
            
            const datasetInfo = datasets.get(table.datasetId);
            datasetInfo.tables.push({
              name: table.tableId,
              fullName: `\`${this.config.projectId}.${table.datasetId}.${table.tableId}\``,
              rowCount: table.rowCount,
              tableType: table.tableType
            });
            datasetInfo.totalRows += parseInt(table.rowCount || '0');
          }
          
          explorationData = {
            projectId: this.config.projectId,
            totalDatasets: datasets.size,
            totalTables: tableCache.size,
            datasets: Object.fromEntries(datasets),
            intelligent: true,
            cacheStatus: this.fallbackMode ? 'fallback' : 'active'
          };
        }
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(explorationData, null, 2) 
          }],
          isError: false,
        };
      }
      
      if (request.params.name === "refresh") {
        IntelligentLogger.info('Intelligent cache refresh requested...');
        
        try {
          tableCache.clear();
          await this.intelligentExploration();
          
          return {
            content: [{ 
              type: "text", 
              text: `🧠 Intelligent cache refreshed successfully! Discovered ${tableCache.size} tables with enhanced capabilities.` 
            }],
            isError: false,
          };
        } catch (error: any) {
          IntelligentLogger.warning('Enhanced refresh failed, enabling fallback mode');
          this.fallbackMode = true;
          
          return {
            content: [{ 
              type: "text", 
              text: `⚠️ Cache refresh completed in fallback mode. Basic functionality available.` 
            }],
            isError: false,
          };
        }
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  async start() {
    await this.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    IntelligentLogger.info('🔧 [STARTUP] Handlers registered: ListTools, CallTool, ListResources, ReadResource');
    IntelligentLogger.success('🧠 Intelligent BigQuery MCP Server running - Ready for natural conversations!');
  }
}

// Configuration management (same as before)
async function validateConfig(config: ServerConfig): Promise<void> {
  if (config.keyFilename) {
    const resolvedKeyPath = path.resolve(config.keyFilename);
    try {
      await fs.access(resolvedKeyPath, fsConstants.R_OK);
      config.keyFilename = resolvedKeyPath;
    } catch (error) {
      console.error('File access error details:', error);
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'EACCES') {
          throw new Error(`Permission denied accessing key file: ${resolvedKeyPath}. Please check file permissions.`);
        } else if (nodeError.code === 'ENOENT') {
          throw new Error(`Key file not found: ${resolvedKeyPath}. Please verify the file path.`);
        } else {
          throw new Error(`Unable to access key file: ${resolvedKeyPath}. Error: ${nodeError.message}`);
        }
      } else {
        throw new Error(`Unexpected error accessing key file: ${resolvedKeyPath}`);
      }
    }

    try {
      const keyFileContent = await fs.readFile(config.keyFilename, 'utf-8');
      const keyData = JSON.parse(keyFileContent);
      
      if (!keyData.type || keyData.type !== 'service_account' || !keyData.project_id) {
        throw new Error('Invalid service account key file format');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Service account key file is not valid JSON');
      }
      throw error;
    }
  }

  if (!/^[a-z0-9-]+$/.test(config.projectId)) {
    throw new Error('Invalid project ID format');
  }
}

function parseArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    projectId: '',
    location: 'US' 
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    const key = arg.slice(2);
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
      throw new Error(`Missing value for argument: ${arg}`);
    }

    const value = args[++i];
    
    switch (key) {
      case 'project-id':
        config.projectId = value;
        break;
      case 'location':
        config.location = value;
        break;
      case 'key-file':
        config.keyFilename = value;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!config.projectId) {
    throw new Error(
      "Missing required argument: --project-id\n" +
      "Usage: intelligent-mcp-server-bigquery --project-id <project-id> [--location <location>] [--key-file <path-to-key-file>]"
    );
  }

  return config;
}

// Startup
async function main() {
  try {
    const config = parseArgs();
    await validateConfig(config);
    
    const intelligentServer = new IntelligentBigQueryServer(config);
    await intelligentServer.start();
    
  } catch (error) {
    console.error('Intelligent server startup failed:', error);
    process.exit(1);
  }
}

main().catch(console.error); 
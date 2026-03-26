import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService as NestElasticsearchService } from '@nestjs/elasticsearch';

type LogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);

  constructor(
    private readonly elasticsearchService: NestElasticsearchService,
  ) {}

  async onModuleInit() {
    try {
      this.testConnection();
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch');
    }
  }

  async testConnection() {
    try {
      await this.elasticsearchService.ping();
      this.logger.log('Successfully connected to Elasticsearch');
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch');
    }
  }

  private async log(
    level: LogLevel,
    phone: string,
    message: string,
    context?: string,
    metadata?: Record<string, any>,
  ) {
    try {
      await this.elasticsearchService.index({
        index: 'bigbot-logs',
        body: {
          timestamp: new Date().toISOString(),
          level,
          phone,
          message,
          context: context || 'global',
          ...metadata,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send log to Elasticsearch', error.stack);
    }
  }

  async error(phone: string, message: string, context?: string, trace?: string, metadata?: Record<string, any>) {
    await this.log('error', phone, message, context, { trace, ...metadata });
  }

  async warn(phone: string, message: string, context?: string, metadata?: Record<string, any>) {
    await this.log('warn', phone, message, context, metadata);
  }

  async logMessage(phone: string, message: string, context?: string, metadata?: Record<string, any>) {
    await this.log('log', phone, message, context, metadata);
  }

  async debug(phone: string, message: string, context?: string, metadata?: Record<string, any>) {
    await this.log('debug', phone, message, context, metadata);
  }

  async verbose(phone: string, message: string, context?: string, metadata?: Record<string, any>) {
    await this.log('verbose', phone, message, context, metadata);
  }
}

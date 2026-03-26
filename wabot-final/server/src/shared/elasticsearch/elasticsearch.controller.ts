import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from './elasticsearch.service';

@Controller('debug/elasticsearch')
export class ElasticsearchController {
  constructor(
    private readonly config: ConfigService,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  @Get('config')
  getConfig() {
    return {
      node: this.config.get('ELASTICSEARCH_NODE'),
      username: this.config.get('ELASTICSEARCH_USERNAME'),
    };
  }
}

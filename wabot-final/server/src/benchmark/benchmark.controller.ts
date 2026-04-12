import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';

@Controller('benchmark')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Post('start')
  async start(@Body() body: {
    durationMinutes?: number;
    drybotPhone?: string;
    driverPhone?: string;
    keywords?: string[];
  }) {
    const duration = body.durationMinutes || 20;
    const drybotPhone = (body.drybotPhone || '972552732722').replace(/\D/g, '');
    const driverPhone = (body.driverPhone || '972533312219').replace(/\D/g, '');
    const keywords = body.keywords || ['ים', 'בב'];

    return this.benchmarkService.startRun(driverPhone, drybotPhone, duration, keywords);
  }

  @Post('stop')
  async stop(@Body() body: { runId?: string; driverPhone?: string }) {
    if (body.runId) {
      return this.benchmarkService.stopRun(body.runId);
    }
    const phone = (body.driverPhone || '972533312219').replace(/\D/g, '');
    const run = await this.benchmarkService.getActiveRun(phone);
    if (!run) return { error: 'no_active_run' };
    return this.benchmarkService.stopRun(run.runId);
  }

  @Get(':runId/report')
  async report(@Param('runId') runId: string) {
    const report = await this.benchmarkService.generateReport(runId);
    if (!report) return { error: 'run_not_found' };
    return report;
  }
}

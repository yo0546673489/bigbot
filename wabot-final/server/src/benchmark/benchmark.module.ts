import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BenchmarkEvent, BenchmarkEventSchema } from './benchmark-event.schema';
import { BenchmarkRun, BenchmarkRunSchema } from './benchmark-run.schema';
import { BenchmarkService } from './benchmark.service';
import { BenchmarkController } from './benchmark.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BenchmarkEvent.name, schema: BenchmarkEventSchema },
      { name: BenchmarkRun.name, schema: BenchmarkRunSchema },
    ]),
  ],
  controllers: [BenchmarkController],
  providers: [BenchmarkService],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}

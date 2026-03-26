import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ride, RideSchema } from './rides.schema';
import { RidesService } from './rides.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ride.name, schema: RideSchema }]),
  ],
  providers: [RidesService],
  exports: [MongooseModule, RidesService],
})
export class RidesModule {}

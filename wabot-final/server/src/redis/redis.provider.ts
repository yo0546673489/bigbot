import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { BufferJSON, proto } from '@whiskeysockets/baileys'

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async () => {
        return new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: Number(process.env.REDIS_PORT) || 6379,
          maxRetriesPerRequest: null
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisProviderModule {}

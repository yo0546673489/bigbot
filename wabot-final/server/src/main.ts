import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import { WhatsappFlowService } from './whatsappflow/whatsappflow.service';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { WhatsappServiceMgn } from './waweb/whatsappMgn.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Set global prefix for all routes, excluding Swagger
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'api', method: RequestMethod.ALL }],
  });

  // Add logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const { method, originalUrl, ip } = req;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${method} ${originalUrl} - IP: ${ip}`);
    next();
  });

  // Enable cookie parser
  app.use(cookieParser());

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Allow both ports
    credentials: true, // Allow credentials (cookies, authorization headers)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Travel Companion API')
    .setDescription('The Travel Companion API documentation')
    .setVersion('1.0')
    .addTag('drivers', 'Driver management endpoints')
    .addTag('travelbot', 'WhatsApp bot endpoints')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 7878;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Swagger documentation is available at: http://localhost:${port}/api`
  );

  // app.get(WhatsappFlowService).init();
  // app.get(WhatsappServiceMgn).listenToKafkaMessages();
}

bootstrap();

process.on('unhandledRejection', (reason: any, promise) => {
  const message = reason?.message || reason?.toString?.() || String(reason);
  console.warn(`[unhandledRejection] ${message}`);
});

process.on('uncaughtException', (err: any) => {
  const message = err?.message || err?.toString?.() || String(err);
  console.error(`[uncaughtException] ${message}`);
});
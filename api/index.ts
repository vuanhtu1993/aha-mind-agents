import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let isAppInitialized = false;

/**
 * Khởi tạo NestJS Application Context dưới dạng Express Handler cho Vercel Serverless.
 * Sử dụng Singleton Pattern để tái sử dụng instance qua các lần invoke (tránh cold start thừa).
 */
async function bootstrapServerless() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  // 1. Cấu hình Global Prefix
  app.setGlobalPrefix('api');

  // 2. Kích hoạt CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 3. Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 4. Swagger Open-API Documentation với Cloud CDN
  // CRITICAL CHO VERCEL: Sử dụng customCssUrl và customJs từ CDN (cdnjs/unpkg)
  // để tránh việc Swagger cố đọc file static từ node_modules/swagger-ui-dist trên môi trường serverless (gây crash 500).
  const config = new DocumentBuilder()
    .setTitle('aha-mind:agents API Gateway')
    .setDescription('Hệ thống điều phối và thực thi Autonomous Multi-Agent Workflows')
    .setVersion('1.0.0')
    .addTag('Health', 'Kiểm tra sức khỏe hệ thống')
    .addTag('Agents', 'Định tuyến và thực thi Agent Pipelines')
    .addTag('Status', 'Server-Sent Events (SSE) theo dõi tiến độ Job')
    .addTag('Dashboard', 'Thống kê & Giám sát vận hành Agent')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js',
    ],
  });

  await app.init();
  isAppInitialized = true;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (!isAppInitialized) {
      await bootstrapServerless();
    }
    server(req, res);
  } catch (error: any) {
    console.error('CRITICAL ERROR IN BOOTSTRAP:', error);
    res.status(500).json({
      error: 'FUNCTION_INVOCATION_FAILED',
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    });
  }
}

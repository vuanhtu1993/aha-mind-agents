import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Cấu hình Global Prefix cho toàn bộ API Gateway
  app.setGlobalPrefix('api');

  // 2. Kích hoạt CORS hỗ trợ PWA Frontend kết nối an toàn
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 3. Global Validation Pipe tự động lọc và ép kiểu DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 4. Swagger Open-API Documentation (truy cập tại /api/docs)
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
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`🚀 [aha-mind-agents] Gateway is running on: http://localhost:${port}/api`);
  logger.log(`📑 [Swagger Docs] Available at: http://localhost:${port}/api/docs`);
}

bootstrap();

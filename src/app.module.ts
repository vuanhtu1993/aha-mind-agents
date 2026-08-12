import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { validateEnv } from './common/config/env.validation';
import { HealthModule } from './api/health/health.module';
import { DatabaseModule } from './infra/database/database.module';
import { CoreModule } from './core/core.module';
import { StoryShadowingModule } from './plugins/story-shadowing/story-shadowing.module';
import { AgentsModule } from './api/agents/agents.module';
import { DashboardModule } from './api/dashboard/dashboard.module';


/**
 * AppModule là Root Module trung tâm kết nối toàn bộ các thành phần của Gateway.
 *
 * ConfigModule:
 * - isGlobal: true -> Biến môi trường có thể inject ở bất cứ service/module nào.
 * - validate: validateEnv -> Kiểm tra hợp lệ bằng Zod ngay khi app khởi động.
 */
const getPublicPath = () => join(process.cwd(), 'public');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ...(process.env.VERCEL !== '1'
      ? [ServeStaticModule.forRoot({ rootPath: getPublicPath() })]
      : []),
    DatabaseModule,
    CoreModule,
    HealthModule,
    StoryShadowingModule,
    AgentsModule,
    DashboardModule,
  ],
})
export class AppModule { }

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SpeakingQuizModule (E2E)', () => {
  let app: INestApplication;
  const mockQueue = {
    opts: {
      connection: {
        host: '127.0.0.1',
        port: 6379,
        lazyConnect: true,
      },
    },
    add: jest.fn().mockResolvedValue({ id: 'job-sq-e2e-123' }),
    getJob: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken('speaking-quiz-queue'))
      .useValue(mockQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  }, 25000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 25000);

  it('GET /api/v1/agents - should list speaking-quiz in registered agents', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/agents')
      .expect(200);

    const pluginIds = response.body.map((p: any) => p.id);
    expect(pluginIds).toContain('speaking-quiz');
  });

  it('POST /api/agents/speaking-quiz/jobs - should accept job and return 202', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agents/speaking-quiz/jobs')
      .send({
        customTopic: 'Artificial Intelligence and Human Creativity',
        level: 'B2',
      })
      .expect(202);

    expect(response.body.status).toBe('queued');
    expect(response.body.jobId).toBeDefined();
    expect(response.body.sseUrl).toContain('/api/agents/speaking-quiz/jobs/');
  });

  it('GET /api/agents/speaking-quiz/questions - should return array for storybook queries', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/agents/speaking-quiz/questions?storybookId=679c1a2b3c4d5e6f7a8b9c0d')
      .expect(200);

    expect(response.body.total).toBeDefined();
    expect(Array.isArray(response.body.questions)).toBeTruthy();
  });
});

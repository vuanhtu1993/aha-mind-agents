import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('VocabReviewModule (E2E)', () => {
  let app: INestApplication;
  const mockQueue = {
    opts: {
      connection: {
        host: '127.0.0.1',
        port: 6379,
        lazyConnect: true,
      },
    },
    add: jest.fn().mockResolvedValue({ id: 'job-mock-e2e' }),
    getJob: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken('speaking-quiz-queue'))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken('story-shadowing-queue'))
      .useValue(mockQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  it('GET /api/vocab/review/due-count - should return due count stats structure', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vocab/review/due-count')
      .expect(200);

    expect(response.body).toHaveProperty('dueCount');
    expect(response.body).toHaveProperty('totalCount');
    expect(response.body).toHaveProperty('newCount');
    expect(response.body).toHaveProperty('learningCount');
    expect(response.body).toHaveProperty('masteredCount');
    expect(typeof response.body.dueCount).toBe('number');
  });

  it('GET /api/vocab/review/session - should return session questions structure', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vocab/review/session?limit=5&practiceAll=true')
      .expect(200);

    expect(response.body).toHaveProperty('questions');
    expect(response.body).toHaveProperty('totalDue');
    expect(response.body).toHaveProperty('sessionLimit');
    expect(response.body).toHaveProperty('totalSaved');
    expect(Array.isArray(response.body.questions)).toBeTruthy();
  });
});

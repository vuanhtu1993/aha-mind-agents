import { Test, TestingModule } from '@nestjs/testing';
import { QueueModule } from './queue.module';
import { ConfigModule } from '@nestjs/config';

describe('QueueModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        QueueModule,
      ],
    }).compile();
  });

  it('should compile QueueModule successfully', () => {
    expect(module).toBeDefined();
  });
});

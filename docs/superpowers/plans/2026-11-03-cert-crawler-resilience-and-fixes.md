# Cert Crawler Agent Resilience, Delta Sync & Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp `CertCrawlerModule` để hỗ trợ cơ chế cào tiếp tục khi lỗi (Resumable Delta Sync), chống Rate Limit bền bỉ cho bộ đề lớn (700+ câu hỏi như `ccao-f`), và xử lý triệt để toàn bộ các Findings từ quá trình Code Review.

**Architecture:** Producer truy vấn MongoDB để tìm các `externalId` đã hoàn tất (có đủ cả `correctAnswer` và `aiExpertVi`) nhằm chỉ lấy đề bài và đẩy Job cho phần câu hỏi còn thiếu hoặc bị khuyết dữ liệu (Delta Sync), kết hợp delay giữa các batch và gắn Deterministic `jobId` trên BullMQ. Processor điều tiết tốc độ ở mức an toàn (`3 req/s`), ném lỗi cho mọi sự cố mạng/5xx/401/429 để kích hoạt Exponential Backoff 5 cấp độ (5s -> 80s). Đồng thời chuẩn hóa Env Schema, Mongoose Schema và tài liệu Swagger OpenAPI.

**Tech Stack:** NestJS 11, TypeScript, BullMQ, Redis, Mongoose, Axios, `@nestjs/swagger`, Zod.

**Spec:** `docs/superpowers/specs/2026-11-02-cert-crawler-agent-design.md`

## Global Constraints

- Mọi file mã nguồn phải tuân thủ TypeScript strict/typecheck, ESLint và Prettier.
- Biến môi trường `HOCCUNGSUSHI_COOKIE` được khai báo tường minh trong `EnvSchema` (`src/common/config/env.validation.ts`).
- Một câu hỏi chỉ được coi là "đã hoàn tất" (completed) để bỏ qua khi đồng bộ tiếp (resume) nếu trong MongoDB đã có cả `correctAnswer` (khác rỗng) và `aiExpertVi` (khác rỗng), trừ khi client truyền `force: true`.
- Tất cả các file tạo mới hoặc chỉnh sửa phải giữ nguyên dòng bản quyền `Made by Anh Tu - Share to be share` ở phần header/footer.

## Review Focus

1. **Resumable Delta Sync (Chạy tiếp không trùng lặp):** Khi đã cào được 300/736 câu của `ccao-f`, gọi lại `POST /api/crawler/cert/sync` với `{ certId: "ccao-f" }` (mặc định `force: false`) phải bỏ qua 300 câu đã hoàn tất và chỉ chia batch tải + đẩy vào BullMQ đúng 436 câu còn lại.
2. **Incomplete Record Healing (Tự vá câu hỏi khuyết đáp án):** Nếu một câu hỏi đã tồn tại trong DB nhưng thiếu `correctAnswer` hoặc thiếu `aiExpertVi`, Delta Sync không được coi câu đó là hoàn tất mà phải đưa lại vào danh sách cần cào.
3. **Force Full Re-sync:** Khi truyền `{ certId: "ccao-f", force: true }`, hệ thống phải bỏ qua bước lọc DB và đồng bộ lại toàn bộ 736 câu.
4. **Long-Window Rate Limit Survival (429 & Network Errors):** Khi gặp HTTP 429, 5xx hoặc lỗi mạng (ECONNRESET/ETIMEDOUT), Processor phải throw Error để BullMQ retry với cấu hình `attempts: 5, backoff: { type: 'exponential', delay: 5000 }` thay vì nuốt lỗi và lưu bản ghi rỗng.
5. **Queue Deduplication:** Mỗi job đẩy vào BullMQ phải có `jobId: "${certId}-${question.id}"` để nếu người dùng bấm `/sync` 2 lần liên tiếp khi hàng đợi đang chạy, Redis không tạo ra 2 job trùng nhau cho cùng 1 câu hỏi.

---

### Task 1: Chuẩn hóa Cấu hình Môi trường, Schema & DTO (`EnvSchema`, `CertQuestion`, `SyncCertDto`)

**Files:**
- Modify: `src/common/config/env.validation.ts:34-42`
- Modify: `src/infra/database/schemas/cert-question.schema.ts:50-55`
- Modify: `src/plugins/cert-crawler/dto/sync-cert.dto.ts:1-19`
- Modify: `src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts:1-25`

**Interfaces:**
- Consumes: `zod`, `class-validator`, `class-transformer`, `@nestjs/swagger`
- Produces:
  - `EnvSchema` có thêm `HOCCUNGSUSHI_COOKIE: z.string().optional()`
  - `CertQuestion.correctAnswer`: `@Prop({ default: '' })` (không bắt buộc `required: true` để tương thích với trạng thái lưu tạm nếu cần)
  - `SyncCertDto`: `{ certId: string; force?: boolean }`

- [ ] **Step 1: Viết unit test kiểm tra trường `force?: boolean` trong `SyncCertDto`**

Cập nhật `src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`:
```typescript
import { validate } from 'class-validator';
import { SyncCertDto } from './sync-cert.dto';

describe('SyncCertDto', () => {
  it('should validate valid certId without force flag', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'cca-f';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate valid certId with boolean force flag', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'ccao-f';
    dto.force = true;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-boolean force flag', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'ccao-f';
    (dto as any).force = 'not-a-boolean';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty certId', async () => {
    const dto = new SyncCertDto();
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL (RED)**

Run: `npx jest src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`
Expected: FAIL tại test case `should reject non-boolean force flag` vì `force` chưa được định nghĩa.

- [ ] **Step 3: Cập nhật `env.validation.ts`, `cert-question.schema.ts` và `sync-cert.dto.ts`**

1. Trong `src/common/config/env.validation.ts`, bổ sung:
```typescript
  // Cookie xác thực nền tảng hoccungsushi.com cho Cert Crawler Agent
  HOCCUNGSUSHI_COOKIE: z.string().optional(),
```
2. Trong `src/infra/database/schemas/cert-question.schema.ts`, đổi `@Prop({ required: true })` của `correctAnswer` thành:
```typescript
  @Prop({ default: '' })
  correctAnswer: string;
```
3. Trong `src/plugins/cert-crawler/dto/sync-cert.dto.ts`, bổ sung trường `force?: boolean`:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SyncCertDto {
  @ApiProperty({
    description: 'ID của chứng chỉ cần đồng bộ (ví dụ: cca-f, ccao-f, ccar-p)',
    example: 'ccao-f',
  })
  @IsString()
  @IsNotEmpty()
  certId: string;

  @ApiPropertyOptional({
    description: 'Bắt buộc cào lại toàn bộ câu hỏi kể cả các câu đã hoàn tất trong DB',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
```

- [ ] **Step 4: Chạy lại unit test cho DTO và Schema để xác nhận PASS (GREEN)**

Run: `npx jest src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts src/infra/database/schemas/cert-question.schema.spec.ts`
Expected: PASS (2 test suites, 6 tests)

- [ ] **Step 5: Commit Task 1**

```bash
git add src/common/config/env.validation.ts src/infra/database/schemas/cert-question.schema.ts src/plugins/cert-crawler/dto/sync-cert.dto.ts src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts
git commit -m "feat(cert-crawler): add force sync option, env schema, and relax correctAnswer prop"
```

---

### Task 2: Nâng cấp `CertCrawlerProducerService` hỗ trợ Resumable Delta Sync, Batch Delay & Job Deduplication

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.constants.ts:1-10`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.ts:1-130`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.spec.ts:1-79`

**Interfaces:**
- Consumes: `@InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION) Model<CertQuestionDocument>`
- Produces:
  - `triggerSync(certId: string, force?: boolean): Promise<{ certId: string; attemptId: number; totalQuestions: number; skippedQuestions: number; queuedJobs: number }>`

- [ ] **Step 1: Viết failing tests cho cơ chế Delta Sync (Resume) và `force: true` trong `cert-crawler.producer.spec.ts`**

Bổ sung `mockModel` vào `TestingModule` của `src/plugins/cert-crawler/cert-crawler.producer.spec.ts` và thêm các test cases:
```typescript
  const mockModel = {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
```
Test cases cần thêm:
1. `should skip already completed questions during delta sync (force = false)`:
   - Giả lập `attempt` trả về `question_ids: [1142, 1143, 1144]`.
   - Giả lập `mockModel.find` trả về `[{ externalId: 1142 }]` (đã có đủ `correctAnswer` và `aiExpertVi`).
   - Kỳ vọng `axios.get` lấy batch đề bài chỉ gọi với `ids=1143,1144`.
   - Kỳ vọng kết quả trả về `{ totalQuestions: 3, skippedQuestions: 1, queuedJobs: 2 }`.
   - Kỳ vọng mỗi phần tử trong `mockQueue.addBulk` có `opts.jobId` dạng `'cca-f-1143'`, `opts.attempts: 5`, `opts.backoff: { type: 'exponential', delay: 5000 }`.
2. `should return queuedJobs = 0 without calling batch API when all questions are already completed`:
   - Giả lập `question_ids: [1142]` và `mockModel.find` trả về `[{ externalId: 1142 }]`.
   - Kỳ vọng `mockQueue.addBulk` không bị gọi, trả về `{ totalQuestions: 1, skippedQuestions: 1, queuedJobs: 0 }`.
3. `should crawl all questions when force = true even if DB has completed records`:
   - Giả lập `service.triggerSync('cca-f', true)`.
   - Kỳ vọng `mockModel.find` không được dùng để lọc bỏ, `queuedJobs` bằng tổng số câu hỏi.

- [ ] **Step 2: Chạy test để xác nhận FAIL (RED)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.producer.spec.ts`
Expected: FAIL vì `CertCrawlerProducerService` chưa inject `CertQuestion` model và chưa trả về `skippedQuestions`.

- [ ] **Step 3: Hiện thực Delta Sync, Batch Throttling và Exponential Backoff trong `CertCrawlerProducerService`**

1. Trong `src/plugins/cert-crawler/cert-crawler.constants.ts`, bổ sung các hằng số điều phối tải:
```typescript
export const CERT_BATCH_SIZE = 20;
export const CERT_BATCH_DELAY_MS = 250;
export const CERT_JOB_ATTEMPTS = 5;
export const CERT_JOB_BACKOFF_DELAY_MS = 5000;
```
2. Trong `src/plugins/cert-crawler/cert-crawler.producer.ts`:
   - Inject `@InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION) private readonly certQuestionModel: Model<CertQuestionDocument>`.
   - Viết phương thức `getCompletedExternalIds(certId: string): Promise<Set<number>>` truy vấn:
     ```typescript
     const completedDocs = await this.certQuestionModel
       .find({
         certId,
         correctAnswer: { $exists: true, $nin: ['', null] },
         aiExpertVi: { $exists: true, $nin: ['', null] },
       })
       .select('externalId')
       .lean();
     return new Set(completedDocs.map((d) => d.externalId));
     ```
   - Trong `triggerSync(certId: string, force = false)`:
     - Lấy `{ attemptId, questionIds }` từ `getOrCreateAttempt(certId)`.
     - Nếu `!force`, lọc `pendingIds = questionIds.filter((id) => !completedSet.has(id))`.
     - Nếu `pendingIds.length === 0`, log thông báo toàn bộ câu hỏi đã hoàn tất và trả về `{ certId, attemptId, totalQuestions: questionIds.length, skippedQuestions: questionIds.length, queuedJobs: 0 }`.
     - Duyệt `pendingIds` theo từng lô `CERT_BATCH_SIZE` (20 câu). Giữa các batch (khi `i + batchSize < pendingIds.length` và `process.env.NODE_ENV !== 'test'`), nghỉ `CERT_BATCH_DELAY_MS` (250ms) để tránh spike request lên server đích.
     - Tạo mảng `jobs` với `opts`:
       ```typescript
       opts: {
         jobId: `${certId}-${q.id}`,
         attempts: CERT_JOB_ATTEMPTS,
         backoff: { type: 'exponential', delay: CERT_JOB_BACKOFF_DELAY_MS },
         removeOnComplete: true,
         removeOnFail: false, // Giữ lại failed jobs sau 5 lần thử để dễ chẩn đoán
       }
       ```

- [ ] **Step 4: Chạy test để xác nhận PASS (GREEN)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.producer.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add src/plugins/cert-crawler/cert-crawler.constants.ts src/plugins/cert-crawler/cert-crawler.producer.ts src/plugins/cert-crawler/cert-crawler.producer.spec.ts
git commit -m "feat(cert-crawler): add resumable delta sync, batch delay, and deterministic jobId"
```

---

### Task 3: Củng cố `CertCrawlerProcessor` Chống Rate Limit & Retry Mọi Lỗi Tạm thời

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.ts:23-70`
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.spec.ts:45-96`

**Interfaces:**
- Consumes: `Job<CrawlQuestionJobData>`
- Produces:
  - Worker limiter: `{ max: 3, duration: 1000 }` (3 req/s = 180 req/phút, êm ái cho 736 câu của `ccao-f` trong ~4 phút)
  - Khi API `/reveal` trả về lỗi (429, 401/403, 5xx, hoặc Network Timeout): lưu trước phần đề bài cơ bản (`baseQuestion`) vào DB để không mất đề, sau đó **throw Error** để BullMQ kích hoạt cơ chế Exponential Backoff retry lấy đáp án sau.

- [ ] **Step 1: Viết failing tests cho hành vi xử lý lỗi & retry trong `cert-crawler.processor.spec.ts`**

Bổ sung 2 test cases vào `src/plugins/cert-crawler/cert-crawler.processor.spec.ts`:
1. `should upsert base question and rethrow error on HTTP 429 so BullMQ retries`:
   - Mock `axios.get` reject với `{ response: { status: 429, data: { error: 'Too many requests' } }, message: 'Request failed' }`.
   - Kỳ vọng `processor.process(mockJob)` rejects/throws `Rate limit 429`.
   - Kỳ vọng `mockModel.findOneAndUpdate` vẫn được gọi để lưu phần câu hỏi cơ bản (không ghi đè `correctAnswer`).
2. `should upsert base question and rethrow error on network timeout or 5xx error so BullMQ retries`:
   - Mock `axios.get` reject với `new Error('timeout of 10000ms exceeded')`.
   - Kỳ vọng `processor.process(mockJob)` rejects/throws lỗi để BullMQ retry lấy `reveal` ở lượt tiếp theo thay vì nuốt lỗi.

- [ ] **Step 2: Chạy test để xác nhận FAIL (RED)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.processor.spec.ts`
Expected: FAIL vì hiện tại lỗi timeout đang bị catch và nuốt (không throw).

- [ ] **Step 3: Cập nhật `CertCrawlerProcessor` trong `src/plugins/cert-crawler/cert-crawler.processor.ts`**

1. Điều chỉnh `@Processor(CERT_CRAWLER_QUEUE, { limiter: { max: 3, duration: 1000 } })`.
2. Trong hàm `process(job: Job<CrawlQuestionJobData>)`:
   - Chuẩn bị `baseQuestionDoc` từ `job.data`.
   - Thực hiện gọi `axios.get(revealUrl, ...)`.
   - Nếu xảy ra bất kỳ lỗi nào khi gọi `revealUrl`:
     - Upsert `baseQuestionDoc` vào MongoDB trước (để bảo toàn đề bài song ngữ).
     - Ghi log cảnh báo/lỗi rõ ràng kèm trạng thái HTTP (429, 401, hay Network Error) và số lần thử (`job.attemptsMade + 1`).
     - Ném lại lỗi (`throw new Error(...)`) để BullMQ đưa job vào trạng thái chờ retry theo Exponential Backoff (5s -> 10s -> 20s -> 40s -> 80s).

- [ ] **Step 4: Chạy test để xác nhận PASS (GREEN)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.processor.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add src/plugins/cert-crawler/cert-crawler.processor.ts src/plugins/cert-crawler/cert-crawler.processor.spec.ts
git commit -m "fix(cert-crawler): throttle worker to 3 req/s and retry on all reveal failures"
```

---

### Task 4: Nâng cấp `CertCrawlerController` (Detailed Status, Force Sync & Swagger OpenAPI)

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.ts:1-60`
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.spec.ts:1-87`
- Modify: `src/main.ts:35-40`

**Interfaces:**
- Consumes: `CertCrawlerProducerService`, `CertExcelExportService`, `Model<CertQuestionDocument>`, `@InjectQueue(CERT_CRAWLER_QUEUE) Queue`
- Produces:
  - `POST /api/crawler/cert/sync`: Truyền `dto.certId` và `dto.force` vào `producerService.triggerSync(dto.certId, dto.force)`.
  - `GET /api/crawler/cert/status?certId=...`: Trả về chi tiết tiến độ:
    ```typescript
    {
      certId: string;
      totalSaved: number;
      completedCount: number; // Đã có đủ correctAnswer & aiExpertVi
      incompleteCount: number; // Đã lưu đề nhưng thiếu đáp án/giải thích
      queue: { waiting: number; active: number; delayed: number; failed: number };
    }
    ```
  - Swagger decorators đầy đủ: `@ApiTags('Cert Crawler')`, `@ApiOperation`, `@ApiQuery`.

- [ ] **Step 1: Viết failing tests cho Controller mới trong `cert-crawler.controller.spec.ts`**

Cập nhật `src/plugins/cert-crawler/cert-crawler.controller.spec.ts`:
- Thêm mock cho BullMQ Queue (`getJobCounts: jest.fn().mockResolvedValue({ waiting: 10, active: 2, delayed: 1, failed: 0 })`).
- Kiểm tra `controller.sync({ certId: 'ccao-f', force: true })` gọi `mockProducer.triggerSync('ccao-f', true)`.
- Kiểm tra `controller.status('ccao-f')` trả về đầy đủ `{ certId: 'ccao-f', totalSaved: 100, completedCount: 95, incompleteCount: 5, queue: { waiting: 10, active: 2, delayed: 1, failed: 0 } }`.

- [ ] **Step 2: Chạy test để xác nhận FAIL (RED)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.controller.spec.ts`
Expected: FAIL vì `status()` chưa trả về `completedCount`, `incompleteCount`, `queue` và `sync()` chưa truyền `dto.force`.

- [ ] **Step 3: Hiện thực Swagger Decorators và Detailed Status trong `CertCrawlerController` & `main.ts`**

1. Trong `src/main.ts`, thêm `.addTag('Cert Crawler', 'Thu thập và kết xuất ngân hàng câu hỏi chứng chỉ')` vào `DocumentBuilder`.
2. Trong `src/plugins/cert-crawler/cert-crawler.controller.ts`:
   - Gắn `@ApiTags('Cert Crawler')` cho `CertCrawlerController`.
   - Inject `@InjectQueue(CERT_CRAWLER_QUEUE) private readonly crawlerQueue: Queue`.
   - Cập nhật `@Post('sync')`: gắn `@ApiOperation` và gọi `this.producerService.triggerSync(dto.certId, dto.force)`.
   - Cập nhật `@Get('status')`: gắn `@ApiOperation`, `@ApiQuery({ name: 'certId', required: true, example: 'ccao-f' })`, đếm song song `totalSaved`, `completedCount` (có đủ `correctAnswer` và `aiExpertVi`), và `crawlerQueue.getJobCounts('waiting', 'active', 'delayed', 'failed')`.
   - Cập nhật `@Get('export')`: gắn `@ApiOperation`, `@ApiQuery({ name: 'certId', required: true, example: 'cca-f' })`.

- [ ] **Step 4: Chạy test để xác nhận PASS (GREEN)**

Run: `npx jest src/plugins/cert-crawler/cert-crawler.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 4**

```bash
git add src/main.ts src/plugins/cert-crawler/cert-crawler.controller.ts src/plugins/cert-crawler/cert-crawler.controller.spec.ts
git commit -m "feat(cert-crawler): add detailed queue/completion status and Swagger docs"
```

---

### Task 5: Dọn dẹp Repository (Git Hygiene) & Kiểm tra Tổng thể

**Files:**
- Modify: `.gitignore`
- Remove from Git tracking (keep local if needed): `.superpowers/`, `exports/`

**Interfaces:**
- Đảm bảo toàn bộ unit tests và `npm run typecheck` vượt qua 100%.

- [ ] **Step 1: Cập nhật `.gitignore` và gỡ bỏ tracking các file sinh tự động**

Thêm `.superpowers/` và `exports/*.xlsx` vào `.gitignore`, sau đó chạy `git rm -r --cached .superpowers exports/cca-f-questions.xlsx` để giữ lại file trên máy local nhưng không làm nặng lịch sử Git.

- [ ] **Step 2: Chạy toàn bộ Unit Tests và Typecheck**

Run: `npx jest src/plugins/cert-crawler src/infra/database/schemas/cert-question.schema.spec.ts && npm run typecheck`
Expected: Tất cả 6 test suites PASS và `tsc --noEmit` không có lỗi.

- [ ] **Step 3: Commit Task 5**

```bash
git add .gitignore
git commit -m "chore(repo): ignore generated exports and sdd state files"
```

---
*Made by Anh Tu - Share to be share*


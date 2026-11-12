# Cert Crawler Dashboard Batch Campaign Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp `cert-crawler` vào Dashboard (`admin-ui`) theo mô hình **Batch Campaign Aggregator**: gom hàng trăm câu hỏi của một lượt cào thành duy nhất **1 Campaign Log** trên Dashboard, điều tiết nhịp phát sự kiện SSE thời gian thực qua Redis Pub/Sub, ghi nhận thời gian thực thi vào MongoDB `agent_exec_logs`, và đảm bảo an toàn tuyệt đối (Fail-Safe) cho luồng cào cốt lõi.

**Architecture:** Tạo `CertCrawlerCampaignService` làm tầng điều phối quan sát (Observability Layer). Khi bắt đầu sync, tạo 1 bản ghi `AgentExecLog` và phát `JOB_STARTED`. Processor tăng tiến độ và chỉ phát `JOB_STEP` theo nhịp (throttled heartbeat mỗi 20 câu hoặc 10%) nhằm chống bão tin nhắn (Message Flooding). Khi đợt cào hoàn thành (hoặc chạm Circuit Breaker 429), cập nhật đúng bản ghi ban đầu thành `completed` hoặc `failed` và phát `JOB_COMPLETED`/`JOB_FAILED`. Đăng ký `CertCrawlerPlugin` vào `PluginRegistryService` để Dashboard nhận diện metadata.

**Tech Stack:** NestJS 11, TypeScript, Redis Pub/Sub, BullMQ, Mongoose (`AHA_MIND_CONNECTION`), RxJS, Jest.

**Spec:** `docs/superpowers/specs/2026-11-02-cert-crawler-agent-design.md`

## Global Constraints

- Mọi file mã nguồn phải tuân thủ TypeScript strict/typecheck, ESLint và Prettier.
- Mọi tương tác với `RedisPubSubService` và `AgentExecLogModel` phải tuân thủ nguyên tắc **Fail-Safe (Fire-and-Forget bọc try/catch)**: Dù Redis PubSub lag hoặc MongoDB `aha_mind` nghẽn, tiến trình cào và lưu câu hỏi vào `cert_questions` **VẪN PHẢI CHẠY THÀNH CÔNG 100%**.
- 1 lượt bấm Sync (dù 50 hay 200 câu) chỉ tạo **DUY NHẤT 1 bản ghi log** trong `agent_exec_logs`, tuyệt đối không ghi log DB theo từng câu hỏi đơn lẻ để tránh gây ô nhiễm log và quá tải I/O.
- Tất cả các file tạo mới hoặc chỉnh sửa phải giữ nguyên dòng bản quyền `Made by Anh Tu - Share to be share` ở phần header/footer.

## Review Focus

1. **No Log Flooding (Chống rác log):** Khi cào 190 câu, kiểm tra bảng `agent_exec_logs` chỉ xuất hiện đúng 1 dòng log đại diện cho cả chiến dịch (`jobId = sync-{certId}-{timestamp}`), không có 190 dòng log rác.
2. **Throttled SSE Heartbeat (Chống giật lag UI):** Sự kiện `JOB_STEP` chỉ được phát theo nhịp gom (mỗi 20 câu hoặc câu cuối cùng), không phát dồn dập ở mỗi câu hỏi đơn lẻ.
3. **Circuit Breaker Synchronization:** Khi Worker chạm trần 429 và kích hoạt Circuit Breaker, bản ghi Campaign Log trên Dashboard phải được đánh dấu `failed` với lý do chạm trần rate limit kèm sự kiện `JOB_FAILED`.
4. **Fail-Safe Isolation:** Giả lập lỗi khi gọi `agentExecLogModel.create()` hoặc `redisPubSub.publishEvent()`, tiến trình cào câu hỏi và lưu vào `cert_questions` vẫn phải chạy hoàn tất mà không bị văng lỗi.
5. **Dashboard Metadata Visibility:** Agent `cert-crawler` xuất hiện đầy đủ thông tin tên, mô tả và pipelines khi gọi `GET /api/v1/agents`.

---

### Task 1: Định nghĩa `CertCrawlerPlugin` & Đăng ký vào `PluginRegistryService`

**Files:**
- Create: `src/plugins/cert-crawler/cert-crawler.plugin.ts`
- Create: `src/plugins/cert-crawler/cert-crawler.plugin.spec.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.module.ts`

**Interfaces:**
- Consumes: `AgentPlugin`, `PluginRegistryService`
- Produces:
  - `CertCrawlerPlugin.metadata`: `{ id: 'cert-crawler', displayName: 'Cert Crawler Agent', ... }`
  - Tự động đăng ký vào `PluginRegistryService` khi khởi tạo module.

- [ ] **Step 1: Viết unit test cho `CertCrawlerPlugin` (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Hiện thực `CertCrawlerPlugin` (GREEN)**
- [ ] **Step 4: Đăng ký vào `CertCrawlerModule` và chạy test PASS**
- [ ] **Step 5: Commit Task 1**

---

### Task 2: Xây dựng `CertCrawlerCampaignService` (Batch Session Tracker)

**Files:**
- Create: `src/plugins/cert-crawler/services/cert-crawler-campaign.service.ts`
- Create: `src/plugins/cert-crawler/services/cert-crawler-campaign.service.spec.ts`
- Modify: `src/plugins/cert-crawler/interfaces/cert-crawler.interface.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.constants.ts`

**Interfaces:**
- Consumes:
  - `@InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION) Model<AgentExecLog>`
  - `RedisPubSubService`
  - `@InjectQueue(CERT_CRAWLER_QUEUE) Queue`
- Produces:
  - `startCampaign(certId: string, totalQuestions: number): Promise<string>`
  - `recordProgress(campaignId: string, certId: string, totalQuestions: number): Promise<void>`
  - `finishCampaign(campaignId: string, certId: string, successCount: number): Promise<void>`
  - `failCampaign(campaignId: string, certId: string, errorMsg: string): Promise<void>`

- [ ] **Step 1: Viết test cho `CertCrawlerCampaignService` với các kịch bản start, progress (throttle 20 câu), finish, fail và fail-safe (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Hiện thực `CertCrawlerCampaignService` (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: Tích hợp Campaign Tracking vào `CertCrawlerProducerService`

**Files:**
- Modify: `src/plugins/cert-crawler/interfaces/cert-crawler.interface.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.spec.ts`

**Interfaces:**
- Consumes: `CertCrawlerCampaignService`
- Behavior:
  - Khi bắt đầu sync: gọi `campaignService.startCampaign(certId, pendingIds.length)` để nhận `campaignId`.
  - Gắn `campaignId` và `totalInBatch` vào từng payload `CrawlQuestionJobData`.
  - Nếu `pendingIds.length === 0`: kết thúc ngay campaign bằng `finishCampaign`.
  - Trả về `campaignId` trong kết quả của `triggerSync`.

- [ ] **Step 1: Viết test cho Producer tích hợp Campaign Service (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Cập nhật `CertCrawlerProducerService` (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: Tích hợp Tiến độ & Circuit Breaker vào `CertCrawlerProcessor`

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.spec.ts`

**Interfaces:**
- Consumes: `CertCrawlerCampaignService`
- Behavior:
  - Khi lưu xong 1 câu: gọi `campaignService.recordProgress(campaignId, certId, totalInBatch)`.
  - Khi câu hỏi đạt mốc hoàn tất toàn bộ: gọi `campaignService.finishCampaign(campaignId, certId, totalInBatch)`.
  - Khi chạm Circuit Breaker 429: gọi `campaignService.failCampaign(campaignId, certId, msg)` trước khi xả hàng đợi.

- [ ] **Step 1: Viết test cho Processor gọi Campaign Service tương ứng (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Cập nhật `CertCrawlerProcessor` (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 4**

---

### Task 5: Đăng ký Module Wiring, Kiểm thử Toàn diện & Nghiệm thu

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.module.ts`
- Test toàn bộ: `src/plugins/cert-crawler/`

- [ ] **Step 1: Đăng ký `AHA_MIND_CONNECTION`, `AgentExecLog`, `RedisPubSubService` vào `CertCrawlerModule`**
- [ ] **Step 2: Chạy toàn bộ test suites của `cert-crawler`**
- [ ] **Step 3: Chạy kiểm tra TypeScript (`npm run typecheck`)**
- [ ] **Step 4: Commit Task 5**

---
*Made by Anh Tu - Share to be share*


# Source-Scoped Circuit Breaker & Resumable Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực hóa cơ chế Cầu dao tự ngắt đa nguồn (Source-Scoped Circuit Breaker) và Giãn cách hạn ngạch (Quota Cooldown) trong `CertCrawlerModule`. Khi chạm trần 200 câu/giờ (HTTP 429), hệ thống tự động khóa nguồn đó trong Redis (mặc định 60 phút) và xả sạch (drain) hàng đợi BullMQ để chấm dứt tình trạng spam lỗi, đồng thời cho phép tái sử dụng cờ cho các nguồn cào khác nhau mà không gây khóa chéo.

**Architecture:** Tạo `CertCrawlerCooldownService` dùng Redis client từ BullMQ quản lý trạng thái khóa theo từng `source` (`cert_crawler:cooldown:{source}`). `CertCrawlerProcessor` kích hoạt `setCooldown` và `drain(true)` khi gặp lỗi 429 quota. `CertCrawlerProducerService` chặn ngay tại cửa trước khi tải batch đề bài nếu nguồn đang bị khóa. `CertCrawlerController` cung cấp trạng thái cooldown và endpoint reset khóa khi đổi cookie mới.

**Tech Stack:** NestJS 11, TypeScript, BullMQ, Redis (ioredis), Mongoose, Axios, Jest.

**Spec:** `docs/superpowers/specs/2026-11-02-cert-crawler-agent-design.md`

## Global Constraints

- Mọi file mã nguồn phải tuân thủ TypeScript strict/typecheck, ESLint và Prettier.
- Trạng thái Cooldown trong Redis phải có namespace theo `source` (mặc định `'hoccungsushi.com'`), đảm bảo không gây khóa chéo (Cross-Source Contamination) khi mở rộng cào các nguồn khác trong tương lai.
- Tất cả các file tạo mới hoặc chỉnh sửa phải giữ nguyên dòng bản quyền `Made by Anh Tu - Share to be share` ở phần header/footer.

## Review Focus

1. **Source Isolation:** Khóa cooldown của nguồn `'hoccungsushi.com'` không được gây ảnh hưởng hoặc chặn tiến trình đồng bộ của nguồn khác (ví dụ: `'examtopics.com'`).
2. **Instant Queue Draining on 429:** Khi gặp HTTP 429 chạm trần 200, toàn bộ các job đang chờ trong hàng đợi BullMQ phải được dọn sạch (`drain(true)`) ngay lập tức để không có câu hỏi nào tiếp tục gửi request lên server.
3. **Producer Gatekeeping:** Khi gọi `POST /api/crawler/cert/sync` trong thời gian cooldown, hệ thống phải ném lỗi HTTP 429 báo rõ số phút còn lại mà không thực hiện gọi API nguồn hay nạp thêm job.
4. **Manual Cooldown Reset:** Hỗ trợ reset cooldown thủ công qua endpoint `POST /api/crawler/cert/cooldown/reset` hoặc qua cờ `resetCooldown: true` trong `SyncCertDto` khi người dùng thay cookie mới.
5. **No Regression:** Toàn bộ các tính năng trước đó (Delta Sync, Export Excel, Detailed Status) tiếp tục hoạt động chính xác 100%.

---

### Task 1: Xây dựng `CertCrawlerCooldownService` quản lý cờ Cooldown trong Redis theo từng Source

**Files:**
- Create: `src/plugins/cert-crawler/services/cert-crawler-cooldown.service.ts`
- Create: `src/plugins/cert-crawler/services/cert-crawler-cooldown.service.spec.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.constants.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.module.ts`

**Interfaces:**
- Consumes: `@InjectQueue(CERT_CRAWLER_QUEUE) Queue`
- Produces:
  - `setCooldown(source?: string, durationMs?: number): Promise<void>`
  - `getCooldownStatus(source?: string): Promise<{ isLocked: boolean; remainingMinutes: number; lockedUntil: Date | null; source: string }>`
  - `resetCooldown(source?: string): Promise<void>`

- [ ] **Step 1: Viết test cho `CertCrawlerCooldownService` (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Hiện thực `CertCrawlerCooldownService` (GREEN)**
- [ ] **Step 4: Đăng ký Service vào `CertCrawlerModule` và chạy test PASS**
- [ ] **Step 5: Commit Task 1**

---

### Task 2: Tích hợp Circuit Breaker (Xả hàng đợi & Đặt khóa) trong `CertCrawlerProcessor`

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.processor.spec.ts`

**Interfaces:**
- Consumes: `CertCrawlerCooldownService`, `@InjectQueue(CERT_CRAWLER_QUEUE) Queue`
- Behavior:
  - Khi `error.response?.status === 429` và thông điệp chứa `"trần 200"` hoặc `"quá nhiều trong một giờ"`:
    - Gọi `cooldownService.setCooldown(DEFAULT_SOURCE, 3600000)` (60 phút).
    - Gọi `this.crawlerQueue.drain(true)` để hủy mọi job đang chờ trong hàng đợi.
    - Log cảnh báo đỏ nổi bật.

- [ ] **Step 1: Viết test cho hành vi Circuit Breaker khi gặp 429 quota (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Hiện thực logic Circuit Breaker trong `CertCrawlerProcessor` (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: Bổ sung Cổng Chặn Cooldown tại `CertCrawlerProducerService` & Cập nhật DTO

**Files:**
- Modify: `src/plugins/cert-crawler/dto/sync-cert.dto.ts`
- Modify: `src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.producer.spec.ts`

**Interfaces:**
- Consumes: `CertCrawlerCooldownService`
- Produces:
  - `SyncCertDto` thêm `resetCooldown?: boolean`
  - `triggerSync(certId: string, force?: boolean, resetCooldown?: boolean): Promise<...>`

- [ ] **Step 1: Viết test cho DTO và Producer khi Cooldown đang hoạt động (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Cập nhật DTO và Producer Service (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: Bổ sung Trạng thái Cooldown & Endpoint Reset trong `CertCrawlerController`

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.spec.ts`

**Interfaces:**
- Produces:
  - `GET /api/crawler/cert/status`: trả về trường `cooldown: { isLocked, remainingMinutes, lockedUntil, source }`
  - `POST /api/crawler/cert/cooldown/reset`: endpoint mở khóa thủ công

- [ ] **Step 1: Viết test cho Controller bổ sung cooldown status và reset endpoint (RED)**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Hiện thực các endpoints mới trong Controller (GREEN)**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Commit Task 4**

---

### Task 5: Kiểm thử Tổng thể & Nghiệm thu Toàn diện

**Files:**
- Test toàn bộ: `src/plugins/cert-crawler/`

- [ ] **Step 1: Chạy tất cả test suites của cert-crawler**
- [ ] **Step 2: Chạy kiểm tra TypeScript (`npm run typecheck`)**
- [ ] **Step 3: Commit Task 5**

---
*Made by Anh Tu - Share to be share*


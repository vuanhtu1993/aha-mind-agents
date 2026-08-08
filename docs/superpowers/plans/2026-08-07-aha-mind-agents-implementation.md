# aha-mind-agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống backend quản lý và điều phối AI Agent độc lập `aha-mind-agents` dựa trên NestJS, BullMQ (Redis), MongoDB Atlas, LangGraph State Machine và SSE Streaming.

**Architecture:** Mô hình Hybrid Deployment tách biệt: API Gateway chạy trên NestJS (Vercel Serverless) nhận request và trả JobID trong <200ms; Background Worker Pool (Railway/Docker) rút job từ BullMQ Queue, thực thi đồ thị LangGraph với cơ chế Checkpointing qua MongoDB và phát sự kiện tiến độ thời gian thực qua Redis Pub/Sub đến SSE endpoint.

**Tech Stack:** NestJS, TypeScript, BullMQ, Redis (ioredis), MongoDB (Mongoose), LangChain/LangGraph, Google Gemini AI (với Rate Limiter & Key Rotation), Google TTS, Zod, RxJS.

---

## Task 1: Khởi Tạo Dự Án & Bộ Khung NestJS Framework

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/main.ts`
- Create: `src/app.module.ts`
- Create: `src/common/config/env.validation.ts`
- Test: `test/app.e2e-spec.ts`

- [ ] **Step 1: Khởi tạo package.json với toàn bộ dependencies cần thiết**
- [ ] **Step 2: Tạo tsconfig.json hỗ trợ decorators và strict TypeScript**
- [ ] **Step 3: Tạo `src/common/config/env.validation.ts` với Zod schema xác thực biến môi trường**
- [ ] **Step 4: Tạo `src/app.module.ts` và `src/main.ts` khởi động NestJS HTTP server trên port 3001**
- [ ] **Step 5: Viết E2E test kiểm tra endpoint health check cơ bản**
- [ ] **Step 6: Chạy kiểm thử xác nhận NestJS boot thành công**

---

## Task 2: Hạ Tầng Cơ Sở Dữ Liệu & Hàng Đợi (MongoDB Atlas + BullMQ Redis)

**Files:**
- Create: `src/infra/database/database.module.ts`
- Create: `src/common/schemas/execution-log.schema.ts`
- Create: `src/common/schemas/job-result.schema.ts`
- Create: `src/common/schemas/agent-config.schema.ts`
- Create: `src/infra/redis/redis.module.ts`
- Create: `src/infra/redis/event-publisher.service.ts`
- Create: `src/infra/database/mongo-checkpointer.service.ts`
- Test: `test/infra/checkpointer.spec.ts`

- [ ] **Step 1: Viết test cho `MongoCheckpointerService` (Lưu snapshot & Tải snapshot)**
- [ ] **Step 2: Cấu hình `DatabaseModule` kết nối MongoDB Atlas với Connection Pooling tối ưu**
- [ ] **Step 3: Định nghĩa các Mongoose Schemas (`AgentExecutionLog`, `AgentJobResult`, `AgentConfig`)**
- [ ] **Step 4: Cấu hình `RedisModule` & BullMQ Module với connection reuse**
- [ ] **Step 5: Xây dựng `EventPublisherService` phát sự kiện qua Redis Pub/Sub channel**
- [ ] **Step 6: Triển khai `MongoCheckpointerService` kế thừa `BaseCheckpointSaver` của LangGraph**
- [ ] **Step 7: Chạy test xác nhận ghi nhận checkpoint và Redis events hoạt động chính xác**

---

## Task 3: Tầng Cổng Công Cụ (Tool Gateway Layer)

**Files:**
- Create: `src/core/tools/gemini.tool.ts`
- Create: `src/core/tools/tts.tool.ts`
- Create: `src/core/tools/youtube.tool.ts`
- Create: `src/core/tools/scraper.tool.ts`
- Test: `test/core/tools.spec.ts`

- [ ] **Step 1: Viết Unit Test cho các Tool (Gemini Structured Output, TTS generation mock, YouTube parser)**
- [ ] **Step 2: Đóng gói `GeminiTool` tích hợp với `utils/gemini/gemini-service.ts` (Key rotation + Rate limiter)**
- [ ] **Step 3: Xây dựng `TTSTool` chuyển văn bản thành âm thanh & sinh phiên âm IPA**
- [ ] **Step 4: Xây dựng `YouTubeTool` trích xuất transcript, subtitle có timestamp từ video URL**
- [ ] **Step 5: Xây dựng `ScraperTool` trích xuất văn bản từ URL bài viết**
- [ ] **Step 6: Chạy test kiểm thử các tool**

---

## Task 4: Story Shadowing LangGraph Engine (State Machine)

**Files:**
- Create: `src/core/state/story-shadowing.state.ts`
- Create: `src/core/graphs/story-shadowing/nodes/sentence-splitter.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/tts-generator.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/keyword-identifier.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/keyword-enricher.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/youtube-fetcher.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/youtube-consolidator.node.ts`
- Create: `src/core/graphs/story-shadowing/nodes/youtube-suggester.node.ts`
- Create: `src/core/graphs/story-shadowing/text-pipeline.graph.ts`
- Create: `src/core/graphs/story-shadowing/youtube-pipeline.graph.ts`
- Test: `test/core/story-shadowing-graph.spec.ts`

- [ ] **Step 1: Viết test cho Story Shadowing StateGraph (Text pipeline & YouTube pipeline)**
- [ ] **Step 2: Định nghĩa `StoryShadowingState` với Zod Schema và Channel Reducers**
- [ ] **Step 3: Port và chuẩn hóa 4 Nodes cho Text Pipeline (`sentence-splitter`, `tts-generator`, `keyword-identifier`, `keyword-enricher`)**
- [ ] **Step 4: Port và chuẩn hóa 3 Nodes cho YouTube Pipeline (`youtube-fetcher`, `youtube-consolidator`, `youtube-suggester`)**
- [ ] **Step 5: Xây dựng và biên dịch `TextPipelineGraph` và `YouTubePipelineGraph` gắn với `MongoCheckpointer`**
- [ ] **Step 6: Chạy test kiểm thử luồng StateGraph hoàn chỉnh**

---

## Task 5: Background Worker Pool & Event-Driven Streaming

**Files:**
- Create: `src/workers/workers.module.ts`
- Create: `src/workers/story-shadowing.worker.ts`
- Create: `src/worker.main.ts`
- Test: `test/workers/story-shadowing.worker.spec.ts`

- [ ] **Step 1: Viết test cho `StoryShadowingWorker` (xử lý job, emit progress events, lưu kết quả)**
- [ ] **Step 2: Xây dựng `StoryShadowingWorker` kế thừa `WorkerHost` lắng nghe queue `agent-story-shadowing`**
- [ ] **Step 3: Tích hợp phát event tiến độ (0% -> 100%) qua `EventPublisherService` sau mỗi Node**
- [ ] **Step 4: Lưu kết quả hoàn tất vào `AgentJobResult` và log chi tiết vào `AgentExecutionLog`**
- [ ] **Step 5: Xây dựng entry point `src/worker.main.ts` để chạy Worker độc lập trong container**
- [ ] **Step 6: Chạy test kiểm thử Worker xử lý Job thành công**

---

## Task 6: API Gateway Layer & Real-time SSE Stream

**Files:**
- Create: `src/api/agents/dto/story-shadowing.dto.ts`
- Create: `src/api/agents/agents.controller.ts`
- Create: `src/api/agents/agents.service.ts`
- Create: `src/api/agents/agents.module.ts`
- Create: `src/api/status/status.controller.ts`
- Create: `src/api/status/status.service.ts`
- Create: `src/api/status/status.module.ts`
- Create: `src/api/results/results.controller.ts`
- Create: `src/api/results/results.service.ts`
- Create: `src/api/results/results.module.ts`
- Test: `test/api/agents.controller.spec.ts`

- [ ] **Step 1: Viết test cho API Gateway endpoints (POST 202, SSE stream, GET result)**
- [ ] **Step 2: Xây dựng DTOs với Zod validation pipe**
- [ ] **Step 3: Xây dựng `AgentsController` & `AgentsService` nhận request, đẩy BullMQ Job và trả HTTP 202 `{ jobId, status: "QUEUED" }`**
- [ ] **Step 4: Xây dựng `StatusController` với endpoint `@Sse('/api/status/stream')` subscribe Redis Pub/Sub và stream RxJS `Observable`**
- [ ] **Step 5: Xây dựng `ResultsController` trả về kết quả JSON cuối cùng từ `AgentJobResult`**
- [ ] **Step 6: Chạy test E2E kiểm tra toàn bộ luồng API Gateway**

---

## Task 7: Observability Dashboard & Dynamic Config API

**Files:**
- Create: `src/api/dashboard/dashboard.controller.ts`
- Create: `src/api/dashboard/dashboard.service.ts`
- Create: `src/api/dashboard/dashboard.module.ts`
- Create: `src/dashboard-ui/views/index.html`
- Test: `test/api/dashboard.spec.ts`

- [ ] **Step 1: Viết test cho Dashboard metrics & configs endpoints**
- [ ] **Step 2: Triển khai `DashboardService` tổng hợp metrics (Job count, Success rate, Latency, Token consumption) qua MongoDB Aggregation**
- [ ] **Step 3: Xây dựng `DashboardController` cung cấp API cho Overview, Traces, và Config Manager**
- [ ] **Step 4: Xây dựng giao diện Dashboard UI trực quan tại route `/dashboard`**
- [ ] **Step 5: Chạy test kiểm thử Dashboard API và UI render**

---

## Task 8: Serverless Gateway Packaging & aha-tools Integration

**Files:**
- Create: `api/index.ts`
- Create: `vercel.json`
- Create: `Dockerfile.worker`
- Test: `test/integration/full-system.spec.ts`

- [ ] **Step 1: Tạo `api/index.ts` và `vercel.json` cho Vercel Serverless Deployment**
- [ ] **Step 2: Tạo `Dockerfile.worker` cho Railway/Render Container Deployment**
- [ ] **Step 3: Viết script kiểm thử End-to-End toàn bộ hệ thống**
- [ ] **Step 4: Chạy verification suite và xác nhận tất cả tiêu chí nghiệm thu đạt yêu cầu**

---
*Made by Anh Tu - Share to be share*

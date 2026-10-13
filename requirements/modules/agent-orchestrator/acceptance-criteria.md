# Module Agent Orchestrator — Acceptance Criteria (Gherkin & Boundary Rules)

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `ORCH` | **Đối tượng:** Product Owner, Developer, QA Automation Engineer  
> **Tài liệu liên kết:** [API Contract](api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Mục Đích & Nguồn Gốc Biên Giới (Purpose & Derivation)

Acceptance Criteria của Module Orchestrator bảo vệ tính toàn vẹn của nền tảng điều phối lõi. Đảm bảo 100% các Agent tuân thủ chuẩn giao tiếp SSE, cơ chế phòng chống ngắt kết nối Vercel Serverless (Heartbeat 15s) và kênh phát tán kép (Dual Emit Pattern).

---

## 2. Kịch Bản Chấp Nhận Chi Tiết (Gherkin Scenarios)

### AC-ORCH-01: Tự động phát hiện và tra cứu danh sách Plugin
- **API Endpoint:** [`GET /api/agents`](api-contract.md#11-get-apiagents)

```gherkin
Scenario: Tra cứu danh sách các Agent Plugin đang kích hoạt
  Given hệ thống đã nạp các plugin "story-shadowing" và "speaking-quiz"
  When Client gửi "GET /api/agents"
  Then Hệ thống phản hồi HTTP 200 OK
    And Danh sách trả về chứa đầy đủ metadata của từng Agent và danh sách pipelines
```

---

### AC-ORCH-02: Thực thi Pipeline qua Unified Gateway
- **User Story tương ứng:** [`US-ORCH-01`](spec.md#us-orch-01)
- **API Endpoint:** [`POST /api/agents/:agentId/:pipeline`](api-contract.md#13-post-apiagentsagentidpipeline)

```gherkin
Scenario: Thực thi pipeline hợp nhất trả về stream SSE
  Given agentId "story-shadowing" và pipeline "youtube" tồn tại
  When Client gửi "POST /api/agents/story-shadowing/youtube" kèm payload hợp lệ
  Then Hệ thống mở kết nối SSE với Content-Type "text/event-stream"
    And Sự kiện đầu tiên phát ra là "init" chứa mảng các bước thực hiện
    And Các sự kiện tiếp theo phát ra "progress" với % tiến trình tăng dần
```

---

### AC-ORCH-03: Bảo toàn kết nối Serverless bằng xung nhịp Heartbeat 15 giây
- **User Story tương ứng:** [`US-ORCH-01`](spec.md#us-orch-01)
- **Quy tắc Nghiệp vụ:** [`BR-04`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Nhận tín hiệu Ping định kỳ mỗi 15 giây trong khi Node LLM đang suy luận
  Given kết nối SSE đang mở và Node LLM mất 40 giây để xử lý
  When thời gian trôi qua mỗi 15 giây
  Then Hệ thống tự động gửi event "ping" với dữ liệu chứa timestamp
    And Kết nối HTTP trên Vercel không bị ngắt quãng giữa chừng
```

---

### AC-ORCH-04: Đảm bảo cơ chế phát tán kép (Dual Emit Pattern)
- **User Story tương ứng:** [`US-ORCH-01`](spec.md#us-orch-01)
- **Quy tắc Nghiệp vụ:** [`BR-05`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Sự kiện tiến trình được bắn đồng thời cho Client và Redis Pub/Sub
  Given một sự kiện ProgressEvent phát sinh từ LangGraph StateGraph
  When phương thức writeSseEvent được gọi
  Then Dữ liệu được ghi thẳng vào HTTP SSE stream của người gọi
    And Đồng thời phương thức redisPubSub.publishEvent đẩy dữ liệu lên channel "dashboard:events"
```

---

### AC-ORCH-05: Điều tiết tốc độ gọi LLM phòng chống lỗi 429 Quota
- **Quy tắc Nghiệp vụ:** [`BR-07`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Hàng đợi Rate Limiter tự động xếp hàng khi số lượng yêu cầu vượt ngưỡng RPM
  Given hệ thống đang nhận nhiều yêu cầu đồng thời chạm ngưỡng RPM của Google Gemini
  When yêu cầu tiếp theo được gửi tới GeminiService
  Then GeminiRateLimiterService xếp yêu cầu vào hàng đợi chờ thay vì báo lỗi HTTP 429
    And Yêu cầu được tự động giải phóng thực thi ngay khi hạn ngạch có sẵn
```

---

*Made by Anh Tu - Share to be share*

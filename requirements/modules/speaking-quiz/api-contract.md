# Module Speaking Quiz — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)
> **Mã Module:** `QUIZ` | **Phạm vi:** Backend HTTP REST Endpoints & SSE Streaming
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md) | [Hợp đồng gốc](../../../docs/contracts/speaking-quiz-api-contract.md)
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `POST /api/agents/speaking-quiz/jobs`

- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-QUIZ-01`](spec.md#2-yeu-cau-chuc-nang), [`FR-QUIZ-02`](spec.md#2-yeu-cau-chuc-nang), [`FR-QUIZ-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-QUIZ-01`](acceptance-criteria.md#ac-quiz-01), [`AC-QUIZ-03`](acceptance-criteria.md#ac-quiz-03)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-02 (Dependency & Idempotency)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-03 (PREP Integrity)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Đẩy tác vụ sinh câu hỏi Speaking Quiz và giàn giáo thích ứng vào hàng đợi BullMQ hoặc trả kết quả ngay nếu đã tồn tại.
* **Request Headers:** `Content-Type: application/json`
* **Request Body (JSON Payload):**
  ```json
  {
    "storybookId": "67cbef89a123456789abcdef",
    "topic": "Chủ đề tự do nếu không có storybookId",
    "level": "B2",
    "forceRegenerate": false
  }
  ```
* **Success Response 1 — Khởi tạo Job mới (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "data": {
      "jobId": "quiz-1712345678-xyz99",
      "status": "queued",
      "estimatedDurationSeconds": 15,
      "sseUrl": "/api/agents/speaking-quiz/jobs/quiz-1712345678-xyz99/progress"
    }
  }
  ```
* **Success Response 2 — Trúng Idempotency Cache (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "data": {
      "jobId": "existing-67cbf9999abc",
      "status": "completed",
      "existingQuestionId": "67cbf9999abcdef012345678",
      "sseUrl": null
    }
  }
  ```
* **Failure Responses:**
  * `400 Bad Request`: `{ "error": "storybookId must be a valid Mongo ObjectId or topic must be provided" }`

---

### 1.2 `GET /api/agents/speaking-quiz/jobs/:jobId/progress`

- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-QUIZ-04`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-QUIZ-04`](acceptance-criteria.md#ac-quiz-04)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-04 (Heartbeat)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-05 (Dual Emit)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Theo dõi tiến trình sinh câu hỏi theo thời gian thực qua Server-Sent Events.
* **Headers yêu cầu:** `Accept: text/event-stream`
* **Sự kiện SSE phát ra (Stream Data):**
  ```text
  event: connected
  data: {"jobId":"quiz-123","status":"streaming_ready"}

  event: progress
  data: {"jobId":"quiz-123","status":"running","stage":"context_resolved","progress":25,"message":"Đã đọc ngữ cảnh bài học..."}

  event: progress
  data: {"jobId":"quiz-123","status":"running","stage":"prep_synthesized","progress":80,"message":"Đang hoàn tất giàn giáo tư duy thích ứng..."}

  event: completed
  data: {"jobId":"quiz-123","status":"completed","progress":100,"result":{"questionId":"67cbf9999abcdef012345678"}}
  ```

---

### 1.3 `GET /api/agents/speaking-quiz/questions/:id`

- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-QUIZ-05`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-QUIZ-05`](acceptance-criteria.md#ac-quiz-05)

* **Mục đích:** Lấy dữ liệu chi tiết câu hỏi phản xạ, bộ cụm từ bản xứ và giàn giáo thích ứng từ CSDL `speaking_questions`.
* **Path Parameters:** `id` (MongoDB ObjectId).
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67cbf9999abcdef012345678",
      "storybookId": "67cbef89a123456789abcdef",
      "topic": "Small Talk in Professional Environments",
      "question": "How can junior professionals use small talk to break the ice with senior leaders?",
      "level": "B2",
      "targetKeywords": [
        {
          "word": "rapport",
          "ipa": "/ræˈpɔːr/",
          "meaning": "Mối quan hệ hòa hợp, thấu hiểu lẫn nhau",
          "srsStatus": "unsaved",
          "isInjected": false
        }
      ],
      "adaptiveScaffold": {
        "frameworkType": "PAR",
        "frameworkName": "PAR (Problem - Advice - Result)",
        "frameworkDescription": "Khung giải pháp tối ưu cho câu hỏi đề xuất lời khuyên và hành động thực tiễn",
        "topicCollocations": [
          { "phrase": "break the ice", "meaning": "phá vỡ sự ngại ngùng ban đầu" },
          { "phrase": "build rapport", "meaning": "xây dựng mối quan hệ thấu hiểu" }
        ],
        "stages": {
          "stage1": {
            "stageKey": "problem",
            "title": "Problem Identification",
            "signposts": ["The main hurdle is", "Often juniors feel"],
            "hint": "Chỉ ra sự e ngại khi tiếp cận lãnh đạo cấp cao.",
            "modelAnswer": "The main hurdle is that junior staff often feel intimidated to speak with senior leaders."
          },
          "stage2": {
            "stageKey": "advice",
            "title": "Actionable Advice",
            "signposts": ["A practical approach is", "They should try to"],
            "hint": "Đưa ra lời khuyên bắt đầu bằng câu chuyện thường ngày.",
            "modelAnswer": "A practical approach is to break the ice with genuine questions about weekend hobbies or shared projects."
          },
          "stage3": {
            "stageKey": "alternative",
            "title": "Pragmatic Tip",
            "signposts": ["Equally important", "Another tip is"],
            "hint": "Lắng nghe chân thành để tạo thiện cảm tự nhiên.",
            "modelAnswer": "Equally important is active listening, which helps build rapport without appearing overly eager."
          },
          "stage4": {
            "stageKey": "result",
            "title": "Expected Outcome",
            "signposts": ["Ultimately", "As a result"],
            "hint": "Đúc kết lợi ích lâu dài cho sự nghiệp.",
            "modelAnswer": "Ultimately, this creates a friendly, lasting impression that opens doors to mentorship."
          }
        }
      },
      "prepScaffold": {
        "point": {
          "stage": "point",
          "title": "Problem Identification",
          "signposts": ["The main hurdle is", "Often juniors feel"],
          "hint": "Chỉ ra sự e ngại khi tiếp cận lãnh đạo cấp cao.",
          "modelAnswer": "The main hurdle is that junior staff often feel intimidated to speak with senior leaders."
        },
        "reason": {
          "stage": "reason",
          "title": "Actionable Advice",
          "signposts": ["A practical approach is", "They should try to"],
          "hint": "Đưa ra lời khuyên bắt đầu bằng câu chuyện thường ngày.",
          "modelAnswer": "A practical approach is to break the ice with genuine questions about weekend hobbies or shared projects."
        },
        "example": {
          "stage": "example",
          "title": "Pragmatic Tip",
          "signposts": ["Equally important", "Another tip is"],
          "hint": "Lắng nghe chân thành để tạo thiện cảm tự nhiên.",
          "modelAnswer": "Equally important is active listening, which helps build rapport without appearing overly eager."
        },
        "conclusion": {
          "stage": "conclusion",
          "title": "Expected Outcome",
          "signposts": ["Ultimately", "As a result"],
          "hint": "Đúc kết lợi ích lâu dài cho sự nghiệp.",
          "modelAnswer": "Ultimately, this creates a friendly, lasting impression that opens doors to mentorship."
        }
      },
      "status": "active"
    }
  }
  ```

---

*Made by Anh Tu - Share to be share*

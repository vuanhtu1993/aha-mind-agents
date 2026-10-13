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

* **Mục đích:** Đẩy tác vụ sinh câu hỏi Speaking Quiz và giàn giáo PREP vào hàng đợi BullMQ hoặc trả kết quả ngay nếu đã tồn tại.
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
  data: {"jobId":"quiz-123","status":"running","stage":"prep_synthesized","progress":80,"message":"Đang hoàn tất giàn giáo tư duy PREP..."}

  event: completed
  data: {"jobId":"quiz-123","status":"completed","progress":100,"result":{"questionId":"67cbf9999abcdef012345678"}}
  ```

---

### 1.3 `GET /api/agents/speaking-quiz/questions/:id`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-QUIZ-05`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-QUIZ-05`](acceptance-criteria.md#ac-quiz-05)

* **Mục đích:** Lấy dữ liệu chi tiết câu hỏi phản xạ và giàn giáo tư duy PREP từ CSDL `speaking_questions`.
* **Path Parameters:** `id` (MongoDB ObjectId).
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67cbf9999abcdef012345678",
      "storybookId": "67cbef89a123456789abcdef",
      "topic": "Small Talk in Professional Environments",
      "question": "Do you believe mastering small talk is essential for career advancement? Why or why not?",
      "level": "B2",
      "targetKeywords": [
        {
          "word": "rapport",
          "ipa": "/ræˈpɔːr/",
          "meaning": "Mối quan hệ hòa hợp, thấu hiểu lẫn nhau",
          "srsStatus": "due",
          "isInjected": true
        }
      ],
      "prepScaffold": {
        "point": {
          "stage": "point",
          "title": "State your direct stance",
          "signposts": ["In my opinion", "From my perspective"],
          "hint": "Nêu rõ quan điểm của bạn ngay từ câu đầu tiên.",
          "modelAnswer": "In my opinion, small talk is absolutely essential for building professional rapport."
        },
        "reason": {
          "stage": "reason",
          "title": "Explain the core reason",
          "signposts": ["The primary reason is that", "This is because"],
          "hint": "Giải thích tại sao bạn lại nghĩ như vậy.",
          "modelAnswer": "This is because it breaks the ice and helps colleagues feel comfortable working together."
        },
        "example": {
          "stage": "example",
          "title": "Illustrate with real-world proof",
          "signposts": ["For instance", "A clear example of this is"],
          "hint": "Đưa ra dẫn chứng thực tế hoặc kinh nghiệm cá nhân.",
          "modelAnswer": "For instance, casual conversations by the coffee machine often turn into successful collaboration opportunities."
        },
        "conclusion": {
          "stage": "conclusion",
          "title": "Reinforce your final thought",
          "signposts": ["To sum up", "Therefore"],
          "hint": "Khẳng định lại lập trường và đúc kết ý kiến.",
          "modelAnswer": "Therefore, developing small talk skills is an indispensable asset for any professional."
        }
      },
      "status": "active"
    }
  }
  ```

---

*Made by Anh Tu - Share to be share*

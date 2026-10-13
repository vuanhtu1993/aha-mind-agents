# Module Story Shadowing — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `SHADOW` | **Phạm vi:** Backend HTTP REST Endpoints & SSE Streaming  
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md) | [Hợp đồng gốc](../../../docs/contracts/story-shadowing-api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `POST /api/agents/story-shadowing/jobs`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-SHADOW-01`](spec.md#2-yeu-cau-chuc-nang), [`FR-SHADOW-02`](spec.md#2-yeu-cau-chuc-nang), [`FR-SHADOW-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-SHADOW-01`](spec.md#us-shadow-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-SHADOW-01`](acceptance-criteria.md#ac-shadow-01), [`AC-SHADOW-02`](acceptance-criteria.md#ac-shadow-02), [`AC-SHADOW-03`](acceptance-criteria.md#ac-shadow-03)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-01 (Idempotency)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Đẩy tác vụ sinh bài tập Shadowing vào hàng đợi nền (BullMQ Queue) hoặc trả ngay kết quả nếu trúng Idempotency Cache.
* **Xác thực:** Không bắt buộc (Public / Internal API).
* **Request Headers:** `Content-Type: application/json`
* **Request Body (JSON Payload):**
  ```json
  {
    "pipeline": "youtube",
    "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "text": "Nội dung văn bản nếu pipeline là text",
    "title": "Tiêu đề tùy chọn",
    "level": "medium",
    "voice": "en-US-Neural2-F",
    "speakingRate": 0.9,
    "forceRegenerate": false
  }
  ```
* **Success Response 1 — Khởi tạo Job mới (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "data": {
      "jobId": "shadow-1712345678-abcde",
      "status": "queued",
      "pipeline": "youtube",
      "estimatedDurationSeconds": 25,
      "sseUrl": "/api/agents/story-shadowing/jobs/shadow-1712345678-abcde/progress"
    }
  }
  ```
* **Success Response 2 — Trúng Idempotency Cache (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "data": {
      "jobId": "existing-67cbef89a123",
      "status": "completed",
      "existingStoryId": "67cbef89a123456789abcdef",
      "sseUrl": null
    }
  }
  ```
* **Failure Responses:**
  * `400 Bad Request`: `{ "error": "Validation failed: youtubeUrl must be a valid YouTube link" }`
  * `500 Internal Server Error`: `{ "error": "Redis Queue connection unavailable" }`

---

### 1.2 `GET /api/agents/story-shadowing/jobs/:jobId/progress`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-SHADOW-04`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-SHADOW-02`](spec.md#us-shadow-02)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-SHADOW-04`](acceptance-criteria.md#ac-shadow-04)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-04 (Heartbeat)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-05 (Dual Emit)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Mở kênh Server-Sent Events (SSE) theo dõi tiến trình thực thi của Job nền.
* **Headers yêu cầu:** `Accept: text/event-stream`
* **Response Headers:**
  * `Content-Type: text/event-stream; charset=utf-8`
  * `Cache-Control: no-cache, no-transform`
  * `Connection: keep-alive`
* **Các sự kiện SSE phát ra (Event Stream Data):**
  ```text
  event: connected
  data: {"jobId":"shadow-123","status":"streaming_ready"}

  event: ping
  data: {"timestamp":1786162340}

  event: progress
  data: {"jobId":"shadow-123","status":"running","stage":"phoneticAligner","progress":45,"message":"Căn chỉnh phiên âm IPA từng từ..."}

  event: completed
  data: {"jobId":"shadow-123","status":"completed","progress":100,"result":{"storyId":"67cbef89a123456789abcdef"}}
  ```

---

### 1.3 `GET /api/agents/story-shadowing/stories/:id`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-SHADOW-05`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-SHADOW-05`](acceptance-criteria.md#ac-shadow-05)

* **Mục đích:** Lấy dữ liệu bài học hoàn chỉnh từ CSDL `storybooks`.
* **Path Parameters:** `id` (MongoDB ObjectId).
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67cbef89a123456789abcdef",
      "title": "Mastering Small Talk in English",
      "originalText": "Hi there! How are you doing today? Great to see you.",
      "level": "medium",
      "voice": "en-US-Neural2-F",
      "speakingRate": 0.9,
      "sourceType": "youtube",
      "youtubeVideoId": "dQw4w9WgXcQ",
      "sentences": [
        {
          "id": 1,
          "text": "Hi there! How are you doing today?",
          "audioBase64": "UklGRi...",
          "words": [
            { "word": "Hi", "ipa": "/haɪ/" },
            { "word": "there", "ipa": "/ðɛr/" }
          ]
        }
      ],
      "keywords": [
        {
          "word": "small talk",
          "ipa": "/ˈsmɔːl tɔːk/",
          "explanation": "Cuộc trò chuyện ngắn, thân mật về các chủ đề thường nhật.",
          "level": "A2"
        }
      ]
    }
  }
  ```
* **Failure Responses:**
  * `404 Not Found`: `{ "error": "Storybook with id 67cbef... not found" }`

---

*Made by Anh Tu - Share to be share*

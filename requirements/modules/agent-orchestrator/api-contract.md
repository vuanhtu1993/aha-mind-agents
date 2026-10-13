# Module Agent Orchestrator — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `ORCH` | **Phạm vi:** Core Gateway & Orchestration Endpoints  
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `GET /api/agents`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-ORCH-01`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-ORCH-01`](acceptance-criteria.md#ac-orch-01)

* **Mục đích:** Liệt kê toàn bộ các Agent Plugin đang được kích hoạt trong hệ thống.
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "story-shadowing",
        "displayName": "Story Shadowing Agent",
        "description": "Tác nhân tạo bài tập luyện nói theo phương pháp Speech Shadowing",
        "pipelines": [
          { "id": "youtube", "displayName": "YouTube Video to Shadowing" },
          { "id": "text", "displayName": "Raw Text to Shadowing" }
        ]
      },
      {
        "id": "speaking-quiz",
        "displayName": "Speaking Quiz Agent",
        "description": "Tác nhân sinh câu hỏi luyện nói và giàn giáo phản biện PREP",
        "pipelines": [
          { "id": "generate-quiz", "displayName": "Generate PREP Quiz" }
        ]
      }
    ]
  }
  ```

---

### 1.2 `GET /api/agents/:agentId`
* **Mục đích:** Xem chi tiết metadata, danh sách Node, Edges và cấu hình mặc định của một Agent cụ thể.
* **Path Parameters:** `agentId` (ví dụ: `story-shadowing`).
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "story-shadowing",
      "displayName": "Story Shadowing Agent",
      "pipelines": [
        {
          "id": "youtube",
          "nodes": [
            { "id": "youtubeFetcher", "type": "tool", "displayName": "Fetch YouTube Transcript" },
            { "id": "youtubeConsolidator", "type": "llm", "displayName": "Consolidate Text" },
            { "id": "phoneticAligner", "type": "tool", "displayName": "Align IPA" },
            { "id": "ttsGenerator", "type": "tool", "displayName": "Generate Audio" },
            { "id": "keywordIdentifier", "type": "llm", "displayName": "Extract Vocabulary" }
          ],
          "edges": [
            { "source": "youtubeFetcher", "target": "youtubeConsolidator" },
            { "source": "youtubeConsolidator", "target": "phoneticAligner" },
            { "source": "phoneticAligner", "target": "ttsGenerator" },
            { "source": "ttsGenerator", "target": "keywordIdentifier" }
          ]
        }
      ]
    }
  }
  ```

---

### 1.3 `POST /api/agents/:agentId/:pipeline`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-ORCH-02`](spec.md#2-yeu-cau-chuc-nang), [`FR-ORCH-03`](spec.md#2-yeu-cau-chuc-nang), [`FR-ORCH-04`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-ORCH-01`](spec.md#us-orch-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-ORCH-02`](acceptance-criteria.md#ac-orch-02), [`AC-ORCH-03`](acceptance-criteria.md#ac-orch-03), [`AC-ORCH-04`](acceptance-criteria.md#ac-orch-04)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-04 (Heartbeat)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-05 (Dual Emit)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Kích hoạt luồng chạy trực tiếp In-Process SSE cho một pipeline cụ thể.
* **Path Parameters:**
  * `agentId`: Định danh agent (`story-shadowing`, `speaking-quiz`).
  * `pipeline`: Tên pipeline (`youtube`, `text`).
* **Headers yêu cầu:** `Accept: text/event-stream`, `Content-Type: application/json`
* **Request Body:** Phụ thuộc vào từng Agent Plugin đã khai báo.
* **Response:** Stream chuỗi sự kiện SSE:
  * `event: init`: Danh sách các bước dự kiến (`steps`).
  * `event: ping`: Gửi mỗi 15s giữ kết nối Vercel.
  * `event: progress`: Tiến trình từng Node (`stepId`, `progress`, `message`).
  * `event: done`: Kết quả cuối cùng hoàn tất.

---

*Made by Anh Tu - Share to be share*

# Module Dashboard & Observability — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `DASH` | **Phạm vi:** Admin Observability & Management Endpoints  
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `GET /api/v1/dashboard/events`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-DASH-01`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-DASH-01`](spec.md#us-dash-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-DASH-01`](acceptance-criteria.md#ac-dash-01)

* **Mục đích:** Kênh SSE Fan-out nhận toàn bộ sự kiện của các Agent đang chạy trong toàn hệ thống qua kênh Redis Pub/Sub (`dashboard:events`).
* **Headers yêu cầu:** `Accept: text/event-stream`
* **Response:** Stream sự kiện SSE liên tục cho giao diện Admin Dashboard.

---

### 1.2 `GET /api/v1/dashboard/metrics`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-DASH-02`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-DASH-02`](acceptance-criteria.md#ac-dash-02)

* **Mục đích:** Thống kê tổng số lượng tác vụ, tỉ lệ hoàn thành, thời gian chạy trung bình và tổng Token tiêu thụ.
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "totalExecutions": 1420,
      "completedCount": 1385,
      "failedCount": 35,
      "successRate": 0.975,
      "avgDurationMs": 14250,
      "totalTokensUsed": 2450000,
      "avgTokensPerJob": 1725
    }
  }
  ```

---

### 1.3 `GET /api/v1/dashboard/logs`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-DASH-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-DASH-03`](acceptance-criteria.md#ac-dash-03)

* **Mục đích:** Truy vấn phân trang nhật ký chạy chi tiết của các Agent.
* **Query Parameters:**
  * `page` (number, mặc định: 1)
  * `limit` (number, mặc định: 20)
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "jobId": "shadow-1712345678-abcde",
          "agentId": "story-shadowing",
          "pipeline": "youtube",
          "status": "completed",
          "durationMs": 18230,
          "tokenUsage": {
            "promptTokens": 1200,
            "completionTokens": 450,
            "totalTokens": 1650
          },
          "createdAt": "2026-09-30T10:15:30.000Z"
        }
      ],
      "total": 1420,
      "page": 1,
      "limit": 20
    }
  }
  ```

---

### 1.4 `GET / PUT /api/v1/dashboard/configs/:agentId`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-DASH-04`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-DASH-04`](acceptance-criteria.md#ac-dash-04)

* **Mục đích:** Đọc và ghi đè cấu hình động (Model, Temperature, Prompt) cho một Agent cụ thể.
* **PUT Request Body:**
  ```json
  {
    "defaultModel": "gemini-3.5-flash",
    "temperature": 0.2,
    "maxRetries": 3,
    "isActive": true
  }
  ```
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Configuration updated successfully",
    "data": {
      "agentId": "story-shadowing",
      "defaultModel": "gemini-3.5-flash",
      "temperature": 0.2,
      "maxRetries": 3,
      "isActive": true
    }
  }
  ```

---

*Made by Anh Tu - Share to be share*

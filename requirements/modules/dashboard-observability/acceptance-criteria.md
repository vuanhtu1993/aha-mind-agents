# Module Dashboard & Observability — Acceptance Criteria (Gherkin & Boundary Rules)

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `DASH` | **Đối tượng:** Product Owner, Developer, QA Automation Engineer  
> **Tài liệu liên kết:** [API Contract](api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Mục Đích & Nguồn Gốc Biên Giới (Purpose & Derivation)

Acceptance Criteria của Module Dashboard thiết lập tiêu chí kiểm định cho khả năng quan sát hệ thống (Observability) và quản trị tham số động. Đảm bảo toàn bộ luồng sự kiện được truyền phát trung thực và các cấu hình ghi đè có hiệu lực tức thời mà không gây gián đoạn dịch vụ.

---

## 2. Kịch Bản Chấp Nhận Chi Tiết (Gherkin Scenarios)

### AC-DASH-01: Lắng nghe thành công luồng sự kiện Real-time qua Redis Pub/Sub
- **User Story tương ứng:** [`US-DASH-01`](spec.md#us-dash-01)
- **API Endpoint:** [`GET /api/v1/dashboard/events`](api-contract.md#11-get-apiv1dashboardevents)

```gherkin
Scenario: Admin kết nối SSE stream và nhận sự kiện phát sóng từ các Worker
  Given quản trị viên mở màn hình Admin Dashboard
  When trình duyệt kết nối tới "GET /api/v1/dashboard/events" với "Accept: text/event-stream"
  Then kết nối SSE được thiết lập thành công
    And khi có bất kỳ Agent nào hoạt động và publish event lên Redis channel "dashboard:events"
    And màn hình Admin lập tức nhận được event đó qua SSE stream mà không cần reload trang
```

---

### AC-DASH-02: Truy vấn số liệu thống kê hệ thống (Metrics)
- **API Endpoint:** [`GET /api/v1/dashboard/metrics`](api-contract.md#12-get-apiv1dashboardmetrics)

```gherkin
Scenario: Lấy thống kê tổng số tác vụ và token tiêu thụ
  Given hệ thống đã ghi nhận các lượt chạy trong "agent_exec_logs"
  When Client gửi "GET /api/v1/dashboard/metrics"
  Then Hệ thống phản hồi HTTP 200 OK
    And Dữ liệu trả về chứa tổng lượt chạy "totalExecutions", tỉ lệ thành công "successRate", và "totalTokensUsed"
```

---

### AC-DASH-03: Phân trang nhật ký chạy Agent
- **API Endpoint:** [`GET /api/v1/dashboard/logs`](api-contract.md#13-get-apiv1dashboardlogs)

```gherkin
Scenario: Truy vấn lịch sử chạy có phân trang
  Given có 50 bản ghi log trong CSDL
  When Client gửi "GET /api/v1/dashboard/logs?page=2&limit=10"
  Then Hệ thống trả về chính xác 10 bản ghi thuộc trang số 2
    And Thuộc tính pagination chứa "total": 50, "page": 2, "limit": 10
```

---

### AC-DASH-04: Cập nhật cấu hình Agent động
- **API Endpoint:** [`PUT /api/v1/dashboard/configs/:agentId`](api-contract.md#14-get-put-apiv1dashboardconfigsagentid)

```gherkin
Scenario: Cập nhật model và temperature của một Agent
  Given agent "story-shadowing" đang chạy với model "gemini-3.5-flash"
  When Admin gửi "PUT /api/v1/dashboard/configs/story-shadowing" với:
    """
    {
      "defaultModel": "gemini-2.5-pro",
      "temperature": 0.2
    }
    """
  Then Hệ thống cập nhật thành công vào CSDL "agent_configs"
    And Các lượt thực thi tiếp theo của "story-shadowing" tự động áp dụng cấu hình mới
```

---

*Made by Anh Tu - Share to be share*

# ADR-003: Kiến Trúc Xử Lý Hàng Đợi Bất Đồng Bộ & Redis Pub/Sub (Asynchronous Request-Reply Pattern)

> **Trạng thái:** `Accepted`  
> **Ngày phê duyệt:** 2026-10-13  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer  
> **Ràng buộc kiến trúc:** `CON-03`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Context & Problem Statement)
Khi số lượng học viên đồng thời kích hoạt các tác vụ xử lý video hoặc tạo câu hỏi Speaking Quiz tăng cao, việc thực thi toàn bộ logic suy luận LLM và gọi API Google Cloud TTS trong cùng tiến trình HTTP Request của Gateway (In-Process) sẽ dẫn đến:
1. **Nghẽn cổng Gateway:** Các tiến trình HTTP bị chiếm dụng tài nguyên CPU/RAM trong thời gian dài.
2. **Khó kiểm soát lỗi cục bộ:** Nếu tiến trình Vercel bị khởi động lại (Cold Start hoặc Recycle), toàn bộ các tác vụ đang chạy dở sẽ bị hủy mà không có cơ chế tự động thử lại (*Retry Mechanism*).
3. **Màn hình Admin Dashboard không nhận được thông tin:** Cần một cơ chế phát tán sự kiện tập trung không phụ thuộc vào kết nối HTTP đơn lẻ của người dùng.

---

## 2. Quyết Định Kiến Trúc (Decision Outcome)
Thiết lập kiến trúc **Asynchronous Request-Reply Pattern** dựa trên **BullMQ** và **Redis Pub/Sub (Upstash)**:
* **Khởi tạo Job không nghẽn (Non-blocking Enqueuing):** Client gọi `POST /api/agents/:agentId/jobs`, Gateway đẩy ngay Job vào hàng đợi BullMQ tương ứng và phản hồi mã `HTTP 202 Accepted` kèm `jobId` và `sseUrl` trong $< 100\text{ms}$.
* **Tiến trình Worker chuyên trách (`Worker Process`):** Nhận Job từ Redis Queue, thực thi đồ thị LangGraph StateGraph độc lập, tự động retry tối đa 2 lần nếu gặp lỗi mạng hoặc lỗi API ngoài.
* **Kênh phát tán kép (Dual Emit Pattern):** Tiến trình Worker phát sự kiện tiến độ qua kênh Redis Pub/Sub (`dashboard:events` và `job:progress:jobId`), cho phép cả Gateway SSE Controller và Admin Dashboard cùng đăng ký nhận dữ liệu thời gian thực.

---

## 3. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)
### Tác động tích cực (+):
* **Khả năng chịu tải vượt trội (High Concurrency & Resilience):** Gateway luôn phản hồi ngay lập tức, không bao giờ bị nghẽn mạng do các tác vụ AI chạy lâu.
* **Tự phục hồi sau sự cố (Fault Tolerance):** BullMQ lưu trữ trạng thái Job trên Redis; nếu worker gặp sự cố, Job vẫn được bảo toàn để xử lý lại.
* **Kiến trúc phát tán đa điểm (Fan-out):** Mọi sự kiện của Worker đều đến được Admin Dashboard một cách minh bạch.

### Đánh đổi & Thách thức (-):
* Đòi hỏi thêm thành phần Redis (kết nối qua Redis Upstash hoặc Redis Server).
* Phức tạp hơn về mặt luồng tương tác: Client cần thực hiện 2 bước (gửi request lấy `jobId` $\rightarrow$ mở kết nối SSE lắng nghe kết quả).

---

*Made by Anh Tu - Share to be share*

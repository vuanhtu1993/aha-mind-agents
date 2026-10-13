# ADR-005: Cơ Chế Hàng Đợi Token Rate Limiter Phòng Ngừa Lỗi 429 Quota

> **Trạng thái:** `Accepted`  
> **Ngày phê duyệt:** 2026-10-13  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer  
> **Ràng buộc kiến trúc:** `CON-05`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Context & Problem Statement)
Google Gemini API áp đặt các hạn mức nghiêm ngặt về tần suất gọi:
* **Hạn mức số yêu cầu (RPM - Requests Per Minute):** Giới hạn số lượng request tối đa trong 60 giây.
* **Hạn mức số lượng Token (TPM - Tokens Per Minute):** Giới hạn tổng số token nạp vào và sinh ra trong 60 giây.

Khi có nhiều học viên đồng thời kích hoạt Agent hoặc khi một pipeline LangGraph có nhiều Node cùng gọi LLM liên tiếp, việc bắn request trực tiếp không có sự điều tiết sẽ dẫn đến việc chạm trần hạn ngạch. Hậu quả là Google API trả về mã lỗi `HTTP 429 Too Many Requests (RESOURCE_EXHAUSTED)`, khiến pipeline bị đứt gãy đột ngột và người dùng nhận thông báo lỗi thất bại.

---

## 2. Quyết Định Kiến Trúc (Decision Outcome)
Xây dựng lớp dịch vụ điều tiết **`GeminiRateLimiterService`** đóng vai trò là "Cổng bảo vệ" trước khi bất kỳ yêu cầu nào được chuyển tới Google Gemini API:
* **Thuật toán Token Bucket In-Memory:** Duy trì bộ đếm token và request theo cửa sổ trượt (Sliding Window).
* **Hàng đợi Xếp hàng Tự động (Asynchronous Queueing):** Khi phát hiện số lượng request trong phút hiện tại tiệm cận ngưỡng trần, yêu cầu mới không bị từ chối mà được đưa vào hàng đợi chờ.
* **Lũy thừa lùi dần khi gặp sự cố (Exponential Backoff with Jitter):** Nếu API vẫn phát sinh lỗi 429 ngoài dự kiến, hệ thống tự động tạm dừng một khoảng thời gian ngắn có bổ sung độ trễ ngẫu nhiên (*Jitter*) và thử lại tối đa 3 lần trước khi đánh dấu thất bại.
* **Xoay vòng Khóa API (API Key Rotation):** Hỗ trợ danh sách nhiều API Key Gemini dự phòng; khi một key chạm ngưỡng, hệ thống tự động chuyển sang key tiếp theo.

---

## 3. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)
### Tác động tích cực (+):
* **Miễn nhiễm với lỗi 429:** Hệ thống tự động hấp thụ các đợt tải đột biến mà không làm hỏng chu trình chạy của LangGraph.
* **Bảo vệ tính ổn định toàn hệ thống:** Các tác vụ chạy mượt mà, đạt tỷ lệ thành công $> 98\%$.
* **Tận dụng tối đa hạn ngạch miễn phí:** Phân bổ đều đặn các lệnh gọi qua nhiều API key.

### Đánh đổi & Thách thức (-):
* Vào giờ cao điểm khi hạn ngạch bị đầy, thời gian phản hồi của tác vụ có thể tăng thêm từ vài giây đến nửa phút do phải xếp hàng chờ giải phóng token.
* Cần tinh chỉnh tham số cấu hình RPM/TPM chính xác theo từng loại Model (Gemini 2.5 Flash vs Gemini 2.5 Pro).

---

*Made by Anh Tu - Share to be share*

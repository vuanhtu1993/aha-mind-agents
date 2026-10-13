# ADR-001: Kiến Trúc Decoupled Multi-Agent Engine & Direct SSE Streaming

> **Trạng thái:** `Accepted`  
> **Ngày phê duyệt:** 2026-10-13  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer  
> **Ràng buộc kiến trúc:** `CON-01`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Context & Problem Statement)
Trước đây, logic gọi AI thường được đặt trực tiếp bên trong API Routes của ứng dụng Next.js PWA (`aha-tools`). Khi các tác vụ xử lý video YouTube, bóc tách phụ đề, tách câu, tổng hợp âm thanh TTS và xây dựng giàn giáo PREP kéo dài từ **15 đến 45 giây**, hệ thống liên tục gặp phải các vấn đề nghiêm trọng:
1. **Lỗi HTTP 504 Gateway Timeout:** Do môi trường Serverless của Vercel mặc định ngắt kết nối khi hàm chạy quá lâu hoặc không có dữ liệu trả về liên tục.
2. **Khó kiểm soát tài nguyên:** Lộ API Key AI, không có cơ chế điều tiết Rate Limit tập trung, và khó tái sử dụng logic AI cho các nền tảng khác (Mobile App, Admin Dashboard).
3. **Chi phí hạ tầng:** Nếu sử dụng kiến trúc v1 (Queue + Dedicated Worker chạy 24/7 trên Railway), chi phí phát sinh hàng tháng từ $15-30 dù lượng người dùng chưa đạt đỉnh.

---

## 2. Quyết Định Kiến Trúc (Decision Outcome)
Xây dựng `aha-mind-agents` thành một **Backend Engine độc lập (Decoupled Micro-Backend)** viết bằng **NestJS 11** kết hợp **LangGraph StateGraph**, áp dụng mô hình **v2 Pragmatic Hybrid Architecture**:
* **Direct SSE Streaming (In-Process):** Cho phép Client kết nối trực tiếp qua Server-Sent Events từ Vercel Serverless (`maxDuration = 300s`).
* **Keep-Alive Heartbeat 15s:** Tự động phát sự kiện `ping` mỗi 15 giây để ngăn chặn triệt để Idle Connection Timeout của Vercel.
* **Plugin Architecture:** Chuẩn hóa giao diện `AgentPlugin` để dễ dàng chuyển giao sang BullMQ Queue & Dedicated Worker khi lượng người dùng tăng đột biến mà không phải viết lại logic nghiệp vụ.

---

## 3. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)
### Tác động tích cực (+):
* **Chi phí tối ưu (0 đồng phát sinh):** Tận dụng tối đa tài nguyên miễn phí của Vercel Serverless và MongoDB Atlas.
* **Trải nghiệm người dùng mượt mà:** Người học thấy thanh tiến trình nhích dần theo từng Node thay vì nhìn màn hình xoay tròn chờ đợi.
* **Tách rời trách nhiệm (Separation of Concerns):** Đội ngũ Frontend tập trung vào UI/UX; đội ngũ AI/Backend tập trung vào tối ưu hóa Prompt và độ chính xác của Agent.

### Đánh đổi & Thách thức (-):
* Bắt buộc phải duy trì nghiêm ngặt cơ chế Heartbeat 15 giây; nếu quên phát ping, Vercel sẽ tự động cắt luồng sau 30-60 giây im lặng.
* Vercel Serverless có giới hạn thời gian thực thi tối đa 300 giây (5 phút), phù hợp cho các video YouTube độ dài dưới 15 phút.

---

*Made by Anh Tu - Share to be share*

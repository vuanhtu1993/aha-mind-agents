# Governance — Non-Functional Requirements (NFR)

> **Tài liệu cha:** [Requirement Analysis Package](../README.md)  
> **Phiên bản:** 1.0 (Baseline — Enterprise Granular Architecture)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Ma Trận Yêu Cầu Phi Chức Năng (Non-Functional Requirements Matrix)

Hệ thống `aha-mind-agents` áp dụng chuẩn mực kỹ thuật cao nhằm đảm bảo tính ổn định, độ trễ thấp và khả năng mở rộng trong môi trường Multi-Agent phân tán:

| Mã NFR | Hạng mục (Category) | Chi tiết Yêu cầu Phi Chức Năng | Chỉ số Đo lường (SLA Target) | Giải pháp Kỹ thuật Thực thi |
|---|---|---|---|---|
| **NFR-01** | **Hiệu năng (Performance)** | Độ trễ phản hồi khi trúng Idempotency Cache | $p95 \le 50\text{ms}$ | Truy vấn chỉ mục MongoDB Index trên `youtubeVideoId` / Hash; trả về ngay trước khi dispatch |
| **NFR-02** | **Độ bền kết nối (Longevity)** | Khả năng duy trì luồng SSE trên Serverless | Duy trì ổn định tới 300s (5 phút) | RxJS interval ping mỗi 15 giây chống Idle Timeout của Vercel |
| **NFR-03** | **Phòng vệ Hạn ngạch (Quota Defense)**| Tỉ lệ lỗi HTTP 429 Quota Exceeded của Gemini | **0.0%** lỗi 429 lọt về phía Client | `GeminiRateLimiterService` áp dụng thuật toán Token Bucket và tự động chờ đợi |
| **NFR-04** | **Cô lập Dữ liệu (Isolation)** | Cách ly CSDL Nghiệp vụ và Quản trị | 100% dữ liệu tách biệt vật lý | Mô hình Dual Database Connection: `aha-tools` (Học tập) và `aha-mind` (Vận hành) |
| **NFR-05** | **Độ tin cậy (Reliability)** | Tự động thử lại khi LLM hoặc mạng lỗi | Tỉ lệ hoàn tất tác vụ $\ge 99.0\%$ | BullMQ retry logic tối đa 2 lần kèm Exponential Backoff và Zod Parser Validation |
| **NFR-06** | **Khả năng quan sát (Observability)**| Độ trễ phát sóng sự kiện về Admin Dashboard | Độ trễ chênh lệch $< 50\text{ms}$ | Dual Emit Pattern phát trực tiếp qua Redis Pub/Sub channel `dashboard:events` |
| **NFR-07** | **Khả năng bảo trì (Maintainability)**| Mở rộng Agent mới không sửa code lõi | 100% tuân thủ Open-Closed Principle | Chuẩn hóa interface `AgentPlugin`; nạp plugin động qua `PluginRegistryService` |
| **NFR-08** | **Tối ưu chi phí (Cost Efficiency)** | Giảm thiểu lãng phí Token cho nội dung trùng | Tiết kiệm $\ge 85\%$ chi phí Token lặp | Content-Aware Idempotency Protocol (`videoId`, `textHash`, `storybookId`) |
| **NFR-09** | **Khả năng kiểm toán (Auditability)** | Ghi nhận chi tiết lượng tiêu thụ tài nguyên | 100% lượt chạy có bản ghi kiểm toán | Mongoose Post-Execution Interceptor ghi vào collection `agent_exec_logs` |
| **NFR-10** | **Chuẩn hóa Giao thức (Standardization)**| Tuân thủ chuẩn mở REST & EventSource | 100% tương thích W3C EventSource | Response Header chuẩn `text/event-stream`, tài liệu hóa qua Swagger UI `/api/docs` |

---

*Made by Anh Tu - Share to be share*

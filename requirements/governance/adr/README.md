# Architecture Decision Records (ADR) Repository

> **Tài liệu cha:** [Requirement Analysis Package](../../README.md)  
> **Tiêu chuẩn:** Michael Nygard / MADR (Markdown Architectural Decision Records)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Mục Các Bản Ghi Quyết Định Kiến Trúc (ADR Index)

| Bản ghi | Tên Quyết Định Kiến Trúc | Trạng Thái | Ngày Phê Duyệt | Ràng Buộc Kỹ Thuật (Constraint) |
|---|---|---|---|---|
| [ADR-001](001-initial-architecture.md) | Kiến Trúc Decoupled Multi-Agent Engine & Direct SSE Streaming | `Accepted` | 2026-10-13 | `CON-01`: Độc lập hóa backend khỏi Next.js PWA & SSE Heartbeat |
| [ADR-002](002-dual-database-cluster-strategy.md) | Chiến Lược Phân Tách CSDL Kép (aha-tools ⟷ aha-mind) | `Accepted` | 2026-10-13 | `CON-02`: Cô lập CSDL nghiệp vụ học tập và CSDL logs/ops |
| [ADR-003](003-redis-bullmq-execution.md) | Kiến Trúc Xử Lý Hàng Đợi Bất Đồng Bộ & Redis Pub/Sub | `Accepted` | 2026-10-13 | `CON-03`: Tách biệt Enqueuing và Background Worker Stream |
| [ADR-004](004-context-idempotency-protocol.md) | Giao Thức Cache Idempotency Dựa Trên Dấu Vân Tay Dữ Liệu | `Accepted` | 2026-10-13 | `CON-04`: Tiết kiệm 100% chi phí token cho nội dung trùng lặp |
| [ADR-005](005-gemini-rate-limiter-queue.md) | Cơ Chế Hàng Đợi Token Rate Limiter Phòng Ngừa Lỗi 429 Quota | `Accepted` | 2026-10-13 | `CON-05`: Điều tiết tốc độ RPM/TPM và xoay vòng API Key |

---

*Made by Anh Tu - Share to be share*

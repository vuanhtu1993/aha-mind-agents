# AI Coding Agent Context Routing Rules: aha-mind-agents

> **Mục tiêu:** Thiết lập kỷ luật nạp ngữ cảnh Just-in-Time (JIT) bắt buộc cho toàn bộ AI Coding Agent (Claude, Gemini, Cursor, Copilot).  
> **Nguyên tắc cốt lõi:** TUYỆT ĐỐI KHÔNG nạp toàn bộ thư mục `requirements/` vào context cùng lúc. Phòng ngừa lãng phí token và hiện tượng *Lost in the Middle*.  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 🧭 Ma Trận Phân Định Ngữ Cảnh Theo Tác Vụ (Task-to-Context Mapping Matrix)

Khi AI Agent nhận một nhiệm vụ cụ thể trong mã nguồn của `aha-mind-agents`, chỉ được phép nạp các tệp tin theo quy định nghiêm ngặt dưới đây:

| Tác vụ / Phạm vi Mã Nguồn | Tệp BẮT BUỘC Phải Nạp | Tệp TÙY CHỌN (Khi cần) | Nghiêm Cấm Nạp (Cấm Gây Nhiễu) |
|---|---|---|---|
| **Lập trình Agent Story Shadowing**<br>(`src/plugins/story-shadowing/`) | 1. `requirements/global/business-rules.md`<br>2. `requirements/modules/story-shadowing/api-contract.md` | `requirements/global/domain-models.md` | `spec.md` và `acceptance-criteria.md` của các module khác |
| **Lập trình Agent Speaking Quiz**<br>(`src/plugins/speaking-quiz/`) | 1. `requirements/global/business-rules.md`<br>2. `requirements/modules/speaking-quiz/api-contract.md` | `requirements/global/domain-models.md` | Tài liệu của Story Shadowing hoặc Dashboard |
| **Lập trình Bộ Điều Phối & SSE Engine**<br>(`src/api/agents/`, `src/core/`) | 1. `requirements/modules/agent-orchestrator/api-contract.md`<br>2. `requirements/governance/adr/001-initial-architecture.md`<br>3. `requirements/governance/adr/005-gemini-rate-limiter-queue.md` | `requirements/global/business-rules.md` | Giao diện Admin UI hoặc chi tiết Prompt của từng bài tập |
| **Lập trình Admin Dashboard**<br>(`src/api/dashboard/`, `admin-ui/`) | 1. `requirements/modules/dashboard-observability/api-contract.md`<br>2. `requirements/modules/dashboard-observability/spec.md` | `requirements/governance/adr/003-redis-bullmq-execution.md` | Thuật toán tách âm IPA hoặc xử lý audio TTS |
| **Viết Kiểm Thử Tự Động (Unit / E2E)**<br>(`test/`, `*.spec.ts`) | 1. `requirements/modules/<target-module>/acceptance-criteria.md`<br>2. `requirements/modules/<target-module>/api-contract.md` | `requirements/global/business-rules.md` | Toàn bộ tài liệu ngoài phạm vi module đang test |
| **Chỉnh Sửa Schema & MongoDB Models**<br>(`src/infra/database/schemas/`) | 1. `requirements/global/domain-models.md`<br>2. `requirements/governance/adr/002-dual-database-cluster-strategy.md` | `requirements/global/business-rules.md` | UI template, file CSS hoặc controller endpoints |
| **Đánh Giá & Kiểm Toán Kiến Trúc** | 1. `requirements/governance/adr/`<br>2. `requirements/governance/traceability-matrix.md`<br>3. `requirements/governance/nfr.md` | `requirements/global/overview.md` | Từng kịch bản chi tiết của test cases |

---

## ⛔ Quy Định Cấm & Chế Tài Vi Phạm (Forbidden Actions)

1. **Tuyệt đối không Dump toàn bộ thư mục (No Greedy Globbing):** Không được sử dụng lệnh đọc file hàng loạt dạng `view_file` trên toàn bộ cây thư mục `requirements/**/*.md`.
2. **Không tự ý thay đổi Quy tắc Bất biến (No Arbitrary Rule Alteration):** Nếu phát hiện sự không đồng nhất giữa code hiện tại và `global/business-rules.md`, Agent BẮT BUỘC phải hỏi ý kiến người dùng thay vì tự ý sửa đổi quy tắc nghiệp vụ.
3. **Tuân thủ Tiền lệ Quyết định Kiến trúc (Precedent ADR Compliance):** Không được tự ý đưa vào các thư viện bên thứ ba hoặc thay đổi chiến lược lưu trữ (ví dụ đổi sang PostgreSQL hoặc Prisma) mà không tham chiếu và viết ADR mới trong `governance/adr/`.

---

*Made by Anh Tu - Share to be share*

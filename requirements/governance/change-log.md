# Governance — Change Control & Version History

> **Tài liệu cha:** [Requirement Analysis Package](../README.md)  
> **Phiên bản:** 1.0 (Baseline — Enterprise Granular Architecture)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Nhật Ký Phiên Bản (Version History Log)

| Phiên bản | Ngày phát hành | Tác giả / Vai trò | Tóm tắt Nội dung Thay đổi |
|---|---|---|---|
| **1.0.0** | 2026-10-13 | Anh Tú (Technical Architect) | Khởi tạo hoàn chỉnh bộ đặc tả kiến trúc Option C (Enterprise Granular Architecture) cho `aha-mind-agents`: 3 tầng cấu trúc (`global/`, `modules/`, `governance/`), 4 Bounded Contexts, 5 ADRs và quy tắc JIT routing. |

---

## 2. Quy Trình Thay Đổi Đặc Tả (Change Request - CR Protocol)

Để bảo vệ tính toàn vẹn của hệ thống khi có yêu cầu thay đổi tính năng từ phía PO, Khách hàng hoặc Đội ngũ AI:

1. **Đề xuất Thay đổi (Change Proposal):** Soạn thảo đề xuất nêu rõ mục tiêu nghiệp vụ, lý do tại sao cần thay đổi và phạm vi tác động dự kiến.
2. **Phân tích Tác động (Impact Analysis):** Tra cứu Ma trận Truy xuất RTM (`governance/traceability-matrix.md`) để xác định toàn bộ các tài liệu spec, hợp đồng API, và test suite bị ảnh hưởng.
3. **Thảo luận & Phê duyệt (Review & Sign-off):** Thống nhất với Tech Lead trước khi tiến hành chỉnh sửa mã nguồn. Nếu thay đổi liên quan đến kiến trúc nền tảng, bắt buộc phải viết một bản ghi ADR mới trong `governance/adr/`.
4. **Cập nhật Đặc tả Đồng bộ (Sync Specs):** Cập nhật bộ ba tài liệu của module bị ảnh hưởng: `spec.md`, `api-contract.md`, và `acceptance-criteria.md`.
5. **Nghiệm thu Quản trị (Governance Sign-off):** Cập nhật lại chỉ mục RTM và ghi nhận vào `change-log.md`.

---

*Made by Anh Tu - Share to be share*

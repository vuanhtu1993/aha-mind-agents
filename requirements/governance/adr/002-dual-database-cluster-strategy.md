# ADR-002: Chiến Lược Phân Tách CSDL Kép (aha-tools ⟷ aha-mind)

> **Trạng thái:** `Accepted`  
> **Ngày phê duyệt:** 2026-10-13  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer  
> **Ràng buộc kiến trúc:** `CON-02`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Context & Problem Statement)
Hệ thống `aha-mind-agents` xử lý hai nhóm dữ liệu có vòng đời và mục đích sử dụng hoàn toàn khác nhau:
1. **Dữ liệu Nghiệp vụ Học tập (Learning Business Data):** Bài học Shadowing (`storybooks`), câu hỏi và giàn giáo phản biện (`speaking_questions`). Đây là dữ liệu phục vụ trực tiếp cho người học trên ứng dụng `aha-tools` PWA, đòi hỏi tốc độ đọc nhanh, độ ổn định cao và lưu trữ lâu dài.
2. **Dữ liệu Vận hành & Giám sát (Operations & Observability Data):** Nhật ký kiểm toán chạy từng Node (`agent_exec_logs`), lượng token tiêu thụ, lỗi hệ thống, và cấu hình ghi đè Prompt (`agent_configs`). Nhóm dữ liệu này phát sinh với tần suất cao (hàng ngàn log mỗi ngày) và chỉ phục vụ cho đội ngũ Admin/AI Engineer.

Nếu gom chung toàn bộ vào một CSDL duy nhất của ứng dụng người dùng, cơ sở dữ liệu sẽ nhanh chóng bị phình to (*Database Bloat*), làm chậm các thao tác backup, đồng thời tăng nguy cơ bảo mật khi người dùng có thể vô tình đọc được dữ liệu log nội bộ.

---

## 2. Quyết Định Kiến Trúc (Decision Outcome)
Áp dụng mô hình **Dual Database Connection** trên cùng một Cluster MongoDB Atlas thông qua `@nestjs/mongoose`:
* **Database `aha-tools` (Production Data):** Chứa các collection `storybooks` và `speaking_questions`. Client PWA đọc trực tiếp từ đây.
* **Database `aha-mind` (Management & Observability):** Chứa các collection `agent_exec_logs` và `agent_configs`. Chỉ `aha-mind-agents` và Admin Dashboard có quyền truy cập.

---

## 3. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)
### Tác động tích cực (+):
* **Bảo vệ toàn vẹn dữ liệu người dùng:** Dữ liệu log dung lượng lớn không làm ảnh hưởng đến hiệu năng truy vấn của người học trên PWA.
* **Phân quyền và bảo mật nghiêm ngặt:** Quyền hạn ghi/đọc dữ liệu log và cấu hình prompt được cô lập hoàn toàn.
* **Chi phí lưu trữ tối ưu:** Dễ dàng áp dụng cơ chế TTL Index (Time-To-Live) tự động xóa log cũ trên `aha-mind` mà không lo ảnh hưởng đến `aha-tools`.

### Đánh đổi & Thách thức (-):
* Cấu hình NestJS cần khởi tạo 2 kết nối Mongoose riêng biệt (`DATABASE_TOOLS_URI` và `DATABASE_MIND_URI`) thay vì một kết nối mặc định.
* Không thể thực hiện các phép join cấp độ CSDL (MongoDB `$lookup`) chéo giữa 2 database khác nhau; mọi liên kết phải được xử lý ở tầng Application Service.

---

*Made by Anh Tu - Share to be share*

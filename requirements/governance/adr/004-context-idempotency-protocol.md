# ADR-004: Giao Thức Cache Idempotency Dựa Trên Dấu Vân Tay Dữ Liệu (Content-Aware Idempotency)

> **Trạng thái:** `Accepted`  
> **Ngày phê duyệt:** 2026-10-13  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer  
> **Ràng buộc kiến trúc:** `CON-04`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Context & Problem Statement)
Trong ứng dụng giáo dục học tiếng Anh, xu hướng người dùng học theo các video bài giảng nổi tiếng hoặc các đoạn hội thoại mẫu là rất phổ biến. Nếu 100 học viên cùng dán một đường link video YouTube (ví dụ: video TED Talk về kỹ năng giao tiếp):
1. **Lãng phí Token nghiêm trọng:** Hệ thống sẽ gọi Google Gemini 100 lần để làm cùng một việc (tóm tắt, phân tích ngữ pháp, bóc tách từ vựng), tiêu tốn hàng triệu Token không cần thiết.
2. **Chi phí GPU/TTS tăng vọt:** Hàng trăm câu thoại giống nhau sẽ bị gửi tới Google Cloud TTS để sinh file MP3 base64 lặp đi lặp lại.
3. **Trải nghiệm chờ đợi không đáng có:** Mỗi học viên đều phải chờ 20-30 giây cho một nội dung mà hệ thống đã từng xử lý hoàn chỉnh từ trước.

---

## 2. Quyết Định Kiến Trúc (Decision Outcome)
Áp dụng **Giao thức Idempotency thông minh theo dấu vân tay dữ liệu (Content-Aware Idempotency Protocol)**:
* **Dấu vân tay cho Video YouTube:** Bóc tách mã `videoId` (11 ký tự chuẩn) từ URL. Kiểm tra chỉ mục duy nhất `youtubeVideoId` trong collection `storybooks`.
* **Dấu vân tay cho Văn bản thô (Text):** Tính toán mã băm SHA-256 từ nội dung văn bản sau khi chuẩn hóa khoảng trắng.
* **Dấu vân tay cho Speaking Quiz:** Sử dụng khóa ngoại `storybookId` kết hợp cấp độ CEFR (`level: B1 | B2 | C1`).
* **Cơ chế Phản hồi Tức thì:** Nếu tìm thấy bản ghi hợp lệ và cờ `forceRegenerate === false`, Gateway lập tức trả về mã `HTTP 202 Accepted` với `status: 'completed'` và `existingStoryId` / `existingQuestionId` trong **dưới 50 mili-giây**, bỏ qua hoàn toàn việc gọi LLM và đưa vào Queue.
* **Cơ chế Ghi đè Chủ động:** Cho phép truyền tham số `forceRegenerate: true` khi giáo viên hoặc quản trị viên muốn áp dụng Prompt mới để tạo lại nội dung.

---

## 3. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)
### Tác động tích cực (+):
* **Tiết kiệm 100% chi phí Token:** Đối với mọi yêu cầu trùng lặp, chi phí gọi LLM và TTS bằng 0.
* **Tốc độ phản hồi tức thì ($< 50\text{ms}$):** Học viên nhận được bài học ngay lập tức, nâng cao trải nghiệm ứng dụng.
* **Giảm tải cho hạ tầng AI:** Giảm bớt số lượng request gửi lên Google Gemini, hạn chế chạm trần Rate Limit.

### Đánh đổi & Thách thức (-):
* Cần quản lý đánh chỉ mục Index chính xác trong MongoDB để đảm bảo các truy vấn tìm kiếm dấu vân tay diễn ra nhanh chóng.
* Cần có cơ chế xóa cache/bản ghi khi cấu hình System Prompt toàn hệ thống có sự thay đổi lớn về mặt ngữ nghĩa.

---

*Made by Anh Tu - Share to be share*

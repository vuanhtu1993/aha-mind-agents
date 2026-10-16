# Module Fun Feed — Acceptance Criteria & Test Scenarios

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `FEED` | **Phạm vi:** Tiêu chí kiểm thử nghiệm thu (Given-When-Then Scenarios)  
> **Tài liệu liên kết:** [API Contract](api-contract.md) | [Hợp đồng tích hợp Frontend](../../../docs/contracts/fun-feed-api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Tiêu Chí Chấp Nhận Chi Tiết (Given-When-Then)

### AC-FEED-01: Lướt xem Feed với phân trang con trỏ (Cursor Pagination)
- **Ánh xạ Yêu cầu:** [`FR-FEED-01`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-01`](spec.md#us-feed-01)
- **Ánh xạ Endpoint:** [`GET /api/funny-feed`](api-contract.md#11-get-apifunny-feed)

#### Kịch bản 1.1: Tải trang đầu tiên không kèm tham số con trỏ
* **Given (Bối cảnh):** Trong cơ sở dữ liệu có 25 bản ghi nội dung có `status = 'published'` với các chủ đề khác nhau.
* **When (Hành động):** Client gửi yêu cầu `GET /api/funny-feed?limit=10`.
* **Then (Kỳ vọng):**
  1. Trả về mã trạng thái `HTTP 200 OK`.
  2. Mảng `items` chứa đúng 10 bản ghi mới nhất, sắp xếp giảm dần theo thời gian `publishedAt`.
  3. Mỗi item phải có đầy đủ: `mediaUrl`, `whyFunny`, `youLearned`, `status: 'published'`.
  4. Thuộc tính `hasMore` có giá trị `true`.
  5. Thuộc tính `nextCursor` bằng giá trị `publishedAt` (chuỗi ISO Date) của bản ghi thứ 10.

#### Kịch bản 1.2: Lướt sang trang tiếp theo bằng `cursor`
* **Given (Bối cảnh):** Học viên đã xem xong 10 items của trang 1 và nhận được `nextCursor = "2026-10-16T08:30:00.000Z"`.
* **When (Hành động):** Client gửi yêu cầu `GET /api/funny-feed?cursor=2026-10-16T08:30:00.000Z&limit=10`.
* **Then (Kỳ vọng):**
  1. Trả về đúng 10 bản ghi tiếp theo có `publishedAt < 2026-10-16T08:30:00.000Z`.
  2. Không có bất kỳ bản ghi nào của trang 1 bị lặp lại trong kết quả trang 2.

#### Kịch bản 1.3: Lọc nội dung theo chủ đề (`topic`)
* **Given (Bối cảnh):** Database có nội dung thuộc cả 5 chủ đề (`grammar`, `vocabulary`, `idiom`, v.v.).
* **When (Hành động):** Client gửi yêu cầu `GET /api/funny-feed?topic=grammar&limit=5`.
* **Then (Kỳ vọng):**
  1. Tất cả các bản ghi trong `items` đều có `topic: 'grammar'`.

---

### AC-FEED-02: Tương tác người dùng và cơ chế Tự Ẩn (Auto-hide Community Moderation)
- **Ánh xạ Yêu cầu:** [`FR-FEED-02`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-01`](spec.md#us-feed-01)
- **Ánh xạ Endpoint:** [`POST /api/funny-feed/:id/interact`](api-contract.md#12-post-apifunny-feedidinteract)

#### Kịch bản 2.1: Thả tim (Like) bài viết
* **Given (Bối cảnh):** Nội dung có ID `media_123` đang có `stats.likes = 5`.
* **When (Hành động):** Client gửi yêu cầu `POST /api/funny-feed/media_123/interact` với body `{ "action": "like" }`.
* **Then (Kỳ vọng):**
  1. Trả về `HTTP 201 Created` với `{ "success": true }`.
  2. Trường `stats.likes` của bản ghi trong database tăng lên `6`.
  3. Tạo 1 bản ghi mới trong collection `user_interactions` lưu vết hành động.

#### Kịch bản 2.2: Báo cáo vi phạm đạt ngưỡng tự ẩn ($\ge 3$ reports)
* **Given (Bối cảnh):** Nội dung có ID `media_bad` đang có `stats.reports = 2` và `status = 'published'`.
* **When (Hành động):** Một học viên thứ 3 gửi báo cáo `POST /api/funny-feed/media_bad/interact` với body `{ "action": "report", "reportReason": "Nội dung phản cảm" }`.
* **Then (Kỳ vọng):**
  1. Hệ thống đếm tổng số report cho `media_bad` đạt mốc $\ge 3$.
  2. Trường `status` của `media_bad` trong collection `aha_media_contents` lập tức chuyển thành `'hidden'`.
  3. Ghi log cảnh báo mức WARN: `Content [media_bad] bị ẩn tự động do nhận >= 3 reports.`
  4. Các lượt gọi `GET /api/funny-feed` sau đó tuyệt đối không còn trả về nội dung này nữa.

---

### AC-FEED-03: Kích hoạt Ingestion từ Vercel Cron
- **Ánh xạ Yêu cầu:** [`FR-FEED-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-02`](spec.md#us-feed-02)
- **Ánh xạ Endpoint:** [`GET /api/funny-feed/cron-ingest`](api-contract.md#13-get-apifunny-feedcron-ingest)

#### Kịch bản 3.1: Từ chối truy cập khi sai hoặc thiếu Token
* **Given (Bối cảnh):** Server có cấu hình biến môi trường `CRON_SECRET = "secret_key_123"`.
* **When (Hành động):** Kẻ tấn công gửi `GET /api/funny-feed/cron-ingest` không có header hoặc gửi `Authorization: Bearer wrong_token`.
* **Then (Kỳ vọng):**
  1. Trả về mã lỗi `HTTP 401 Unauthorized`.
  2. Toàn bộ logic cào dữ liệu không được kích hoạt.

#### Kịch bản 3.2: Kích hoạt thành công từ Vercel Cron
* **Given (Bối cảnh):** Vercel Cron Scheduler gửi kèm header `Authorization: Bearer secret_key_123`.
* **When (Hành động):** Gửi yêu cầu `GET /api/funny-feed/cron-ingest`.
* **Then (Kỳ vọng):**
  1. Hệ thống xác thực thành công.
  2. Bốc ngẫu nhiên 1 từ khóa trong danh mục (ví dụ `english grammar`).
  3. Cào media từ GIPHY và YouTube, kiểm tra trùng lặp (`dedup`).
  4. Gọi AI phân tích và lưu vào MongoDB với `status = 'published'`.
  5. Toàn bộ thời gian xử lý kết thúc trong vòng **< 10 giây** để tránh lỗi Vercel Timeout.
  6. Trả về `HTTP 200 OK` với thống kê `{ fetched, deduped, saved }`.

---

*Made by Anh Tu - Share to be share*

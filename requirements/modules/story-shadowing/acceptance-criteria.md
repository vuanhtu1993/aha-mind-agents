# Module Story Shadowing — Acceptance Criteria (Gherkin & Boundary Rules)

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `SHADOW` | **Đối tượng:** Product Owner, Developer, QA Automation Engineer  
> **Tài liệu liên kết:** [API Contract](api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Mục Đích & Nguồn Gốc Biên Giới (Purpose & Derivation)

Acceptance Criteria định nghĩa ranh giới **Definition of Done (DoD)** bất biến cho từng User Story của Module Story Shadowing. Mỗi kịch bản được chuyển hóa trực tiếp từ **Global Business Rules (BR-01, BR-04, BR-05)** và **Functional Requirements**, tạo thành bộ hợp đồng kiểm thử tự động (Automated Test Suite) trước khi merge vào nhánh chính.

---

## 2. Kịch Bản Chấp Nhận Chi Tiết (Gherkin Scenarios)

### AC-SHADOW-01: Tạo thành công bài tập Shadowing từ YouTube URL
- **User Story tương ứng:** [`US-SHADOW-01`](spec.md#us-shadow-01)
- **API Endpoint:** [`POST /api/agents/story-shadowing/jobs`](api-contract.md#11-post-apiagentsstory-shadowingjobs)
- **Quy tắc Nghiệp vụ:** [`BR-01`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Khởi tạo Job xử lý video YouTube mới chưa có trong hệ thống
  Given video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" chưa từng được xử lý trong collection "storybooks"
  When Client gửi yêu cầu "POST /api/agents/story-shadowing/jobs" với payload:
    """
    {
      "pipeline": "youtube",
      "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "level": "medium",
      "voice": "en-US-Neural2-F"
    }
    """
  Then Hệ thống phản hồi mã trạng thái HTTP 202 Accepted
    And Payload phản hồi chứa "status": "queued"
    And Payload phản hồi chứa trường "jobId" và đường dẫn "sseUrl"
    And Job được đưa thành công vào Redis queue "story-shadowing-queue"
```

---

### AC-SHADOW-02: Tạo thành công bài tập Shadowing từ văn bản thô
- **User Story tương ứng:** [`US-SHADOW-01`](spec.md#us-shadow-01)
- **API Endpoint:** [`POST /api/agents/story-shadowing/jobs`](api-contract.md#11-post-apiagentsstory-shadowingjobs)

```gherkin
Scenario: Khởi tạo Job xử lý từ đoạn văn bản thô
  Given Client cung cấp một đoạn văn bản tiếng Anh hợp lệ từ 10 đến 2000 từ
  When Client gửi "POST /api/agents/story-shadowing/jobs" với "pipeline": "text"
  Then Hệ thống phản hồi mã HTTP 202 Accepted
    And Job thực thi phân tách câu và tổng hợp giọng đọc audioBase64 cho từng câu
```

---

### AC-SHADOW-03: Tái sử dụng bài học khi trúng Idempotency Cache
- **User Story tương ứng:** [`US-SHADOW-01`](spec.md#us-shadow-01)
- **API Endpoint:** [`POST /api/agents/story-shadowing/jobs`](api-contract.md#11-post-apiagentsstory-shadowingjobs)
- **Quy tắc Nghiệp vụ:** [`BR-01`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Tái sử dụng bài học cũ khi video đã tồn tại và không ép buộc sinh lại
  Given video "https://www.youtube.com/watch?v=dQw4w9WgXcQ" đã có bài học trong "storybooks" với ID "67cbef89a123"
  When Client gửi yêu cầu "POST /api/agents/story-shadowing/jobs" với "forceRegenerate": false
  Then Hệ thống phản hồi trong thời gian dưới 50 mili-giây
    And Mã phản hồi là HTTP 202 Accepted
    And Payload chứa "status": "completed" và "existingStoryId": "67cbef89a123"
    And Hệ thống KHÔNG gọi API Google Gemini hay đưa Job vào BullMQ
```

---

### AC-SHADOW-04: Luồng SSE truyền phát tiến độ và duy trì Heartbeat Ping 15s
- **User Story tương ứng:** [`US-SHADOW-02`](spec.md#us-shadow-02)
- **API Endpoint:** [`GET /api/agents/story-shadowing/jobs/:jobId/progress`](api-contract.md#12-get-apiagentsstory-shadowingjobsjobidprogress)
- **Quy tắc Nghiệp vụ:** [`BR-04`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-05`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Theo dõi luồng sự kiện SSE và nhận heartbeat giữ kết nối
  Given một Job hợp lệ đang thực thi ngầm
  When Client kết nối vào "GET /api/agents/story-shadowing/jobs/:jobId/progress" với "Accept: text/event-stream"
  Then Client nhận được event "connected" ngay lập tức
    And Định kỳ mỗi 15 giây Client nhận được event "ping"
    And Mỗi khi một Node hoàn tất, Client nhận event "progress" với % tiến độ tăng dần
    And Khi toàn bộ chuỗi hoàn tất, Client nhận event "completed" kèm "storyId" và kết nối tự động đóng
```

---

### AC-SHADOW-05: Truy vấn dữ liệu bài học Storybook hoàn chỉnh
- **User Story tương ứng:** [`US-SHADOW-01`](spec.md#us-shadow-01)
- **API Endpoint:** [`GET /api/agents/story-shadowing/stories/:id`](api-contract.md#13-get-apiagentsstory-shadowingstoriesid)

```gherkin
Scenario: Lấy dữ liệu bài học Storybook theo ID
  Given bài học với ID "67cbef89a123" tồn tại trong CSDL
  When Client gửi "GET /api/agents/story-shadowing/stories/67cbef89a123"
  Then Hệ thống trả về HTTP 200 OK
    And Mảng "sentences" chứa các từ có thuộc tính "word" và phiên âm "ipa"
    And Mỗi câu có chuỗi âm thanh "audioBase64"
    And Mảng "keywords" chứa từ vựng trọng tâm kèm cấp độ và giải thích
```

---

*Made by Anh Tu - Share to be share*

# Module Speaking Quiz — Acceptance Criteria (Gherkin & Boundary Rules)

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `QUIZ` | **Đối tượng:** Product Owner, Developer, QA Automation Engineer  
> **Tài liệu liên kết:** [API Contract](api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Mục Đích & Nguồn Gốc Biên Giới (Purpose & Derivation)

Acceptance Criteria định nghĩa ranh giới nghiệm thu **Definition of Done (DoD)** cho Module Speaking Quiz. Tiêu chí bắt buộc bảo vệ tính chuẩn tắc của phương pháp tư duy PREP (Point - Reason - Example - Conclusion) theo quy tắc nghiệp vụ toàn cục **BR-02 và BR-03**, đảm bảo không có câu hỏi khuyết tật nào lọt vào CSDL production.

---

## 2. Kịch Bản Chấp Nhận Chi Tiết (Gherkin Scenarios)

### AC-QUIZ-01: Tạo thành công câu hỏi Speaking Quiz kèm đủ 4 thành phần PREP
- **User Story tương ứng:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **API Endpoint:** [`POST /api/agents/speaking-quiz/jobs`](api-contract.md#11-post-apiagentsspeaking-quizjobs)
- **Quy tắc Nghiệp vụ:** [`BR-03`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Sinh câu hỏi Speaking Quiz mới từ bài học Storybook
  Given bài học Storybook với ID "67cbef89a123" tồn tại hợp lệ trong collection "storybooks"
  When Client gửi yêu cầu "POST /api/agents/speaking-quiz/jobs" với payload:
    """
    {
      "storybookId": "67cbef89a123",
      "level": "B2"
    }
    """
  Then Hệ thống phản hồi mã trạng thái HTTP 202 Accepted
    And Hàng đợi BullMQ nhận được Job thực thi LangGraph
    And Kết quả lưu vào CSDL phải chứa đầy đủ 4 trường "point", "reason", "example", "conclusion"
```

---

### AC-QUIZ-02: Từ chối dữ liệu và kích hoạt cơ chế retry khi LLM sinh thiếu PREP
- **User Story tương ứng:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **Quy tắc Nghiệp vụ:** [`BR-03`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Ngăn chặn lưu bản ghi khuyết tật vào CSDL khi Gemini trả về thiếu cấu trúc
  Given Worker đang thực thi Node "prep_synthesized"
  When Mô hình ngôn ngữ trả về JSON thiếu một trong 4 giai đoạn (ví dụ thiếu "example")
  Then Zod Schema Validator từ chối bản ghi
    And Hệ thống kích hoạt cơ chế Retry tối đa 2 lần với lời nhắc điều chỉnh
    And Tuyệt đối KHÔNG lưu bản ghi không hợp lệ vào collection "speaking_questions"
```

---

### AC-QUIZ-03: Tái sử dụng câu hỏi khi trúng Idempotency Cache
- **User Story tương ứng:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **API Endpoint:** [`POST /api/agents/speaking-quiz/jobs`](api-contract.md#11-post-apiagentsspeaking-quizjobs)
- **Quy tắc Nghiệp vụ:** [`BR-02`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Phản hồi tức thì câu hỏi đã tồn tại cho cùng storybookId
  Given bài học "67cbef89a123" đã có sẵn câu hỏi "67cbf9999abc" trong "speaking_questions"
  When Client gửi yêu cầu "POST /api/agents/speaking-quiz/jobs" với "forceRegenerate": false
  Then Hệ thống phản hồi trong thời gian dưới 50 mili-giây
    And Mã trạng thái là HTTP 202 Accepted
    And Payload chứa "status": "completed" và "existingQuestionId": "67cbf9999abc"
    And Không tiêu tốn bất kỳ lượt gọi nào đến Google Gemini
```

---

### AC-QUIZ-04: Theo dõi luồng SSE tiến độ sinh câu hỏi
- **User Story tương ứng:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **API Endpoint:** [`GET /api/agents/speaking-quiz/jobs/:jobId/progress`](api-contract.md#12-get-apiagentsspeaking-quizjobsjobidprogress)
- **Quy tắc Nghiệp vụ:** [`BR-04`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi), [`BR-05`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Nhận dữ liệu tiến độ thời gian thực của tác vụ sinh câu hỏi
  Given Job sinh câu hỏi đang được xử lý bởi Worker
  When Client kết nối vào "GET /api/agents/speaking-quiz/jobs/:jobId/progress"
  Then Client nhận lần lượt các sự kiện stage "context_resolved", "question_formulated", "prep_synthesized"
    And Sự kiện cuối cùng là "completed" chứa "questionId" hợp lệ
```

---

### AC-QUIZ-05: Truy vấn chi tiết câu hỏi theo ID
- **API Endpoint:** [`GET /api/agents/speaking-quiz/questions/:id`](api-contract.md#13-get-apiagentsspeaking-quizquestionsid)

```gherkin
Scenario: Truy vấn chi tiết câu hỏi và giàn giáo phản xạ
  Given câu hỏi với ID "67cbf9999abc" tồn tại trong CSDL
  When Client gửi "GET /api/agents/speaking-quiz/questions/67cbf9999abc"
  Then Hệ thống trả về HTTP 200 OK
    And Dữ liệu trả về chứa câu hỏi "question", cấp độ "level", và object "prepScaffold" hoàn chỉnh
```

---

### AC-QUIZ-06: Lồng ghép từ vựng FSRS đến hạn vào giàn giáo PREP
- **User Story tương ứng:** [`US-QUIZ-01`](spec.md#us-quiz-01)
- **Quy tắc Nghiệp vụ:** [`BR-03`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Tự động bơm từ vựng FSRS cần ôn vào giàn giáo câu trả lời mẫu
  Given hệ thống có từ vựng đến hạn ôn tập từ "VocabReviewService.getCandidateDueVocab"
  When Worker thực thi LangGraph sinh câu hỏi Speaking Quiz
  Then Danh sách "targetKeywords" chứa từ vựng được bơm với "isInjected": true và "srsStatus": "due"
    And Toàn bộ câu trả lời mẫu "modelAnswer" của 4 giai đoạn PREP phải tự nhiên lồng ghép ít nhất 2 từ vựng mục tiêu
    And Bản ghi được lưu hợp lệ vào collection "speaking_questions"
```

---

*Made by Anh Tu - Share to be share*


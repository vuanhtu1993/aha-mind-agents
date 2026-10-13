# Module Vocab Review — Acceptance Criteria (Gherkin & Boundary Rules)

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `VOCAB` | **Đối tượng:** Product Owner, Developer, QA Automation Engineer  
> **Tài liệu liên kết:** [API Contract](api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Mục Đích & Nguồn Gốc Biên Giới (Purpose & Derivation)

Tài liệu Acceptance Criteria định nghĩa ranh giới nghiệm thu **Definition of Done (DoD)** cho Module Vocab Review. Các kịch bản kiểm thử bảo đảm tính chính xác của thuật toán giãn cách **FSRS v4**, tính công bằng của các phương án gây nhiễu (Distractors không bị trùng đáp án đúng và không trùng lặp nhau), cùng sự liền mạch khi chuyển tiếp từ vựng đến hạn sang Module Speaking Quiz.

---

## 2. Kịch Bản Chấp Nhận Chi Tiết (Gherkin Scenarios)

### AC-VOCAB-01: Khởi tạo phiên trắc nghiệm với 3 phương án gây nhiễu 3-tier
- **User Story tương ứng:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **API Endpoint:** [`GET /api/vocab/review/session`](api-contract.md#11-get-apivocabreviewsession)
- **Quy tắc Nghiệp vụ:** [`BR-06`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

```gherkin
Scenario: Sinh phiên câu hỏi ôn tập có đầy đủ 4 phương án lựa chọn và chế độ thi phù hợp
  Given người dùng có ít nhất 1 thẻ từ vựng trong collection "vocab_cards"
  When Client gửi yêu cầu "GET /api/vocab/review/session?limit=10"
  Then Hệ thống phản hồi mã trạng thái HTTP 200 OK
    And Danh sách "questions" chứa tối đa 10 phần tử
    And Mỗi câu hỏi có mảng "options" chứa chính xác 4 lựa chọn (id: A, B, C, D)
    And Duy nhất 1 lựa chọn có "isCorrect" bằng true
    And 3 phương án gây nhiễu (isCorrect = false) không được trùng với nghĩa của từ mục tiêu
    And Nếu thẻ có trường "exampleSentences" chứa câu có từ mục tiêu thì "quizMode" là "cloze"
    And Nếu thẻ không có câu ví dụ hợp lệ thì "quizMode" là "multiple_choice"
```

---

### AC-VOCAB-02: Nộp kết quả và tính toán chính xác FSRS State & Audit Logging
- **User Story tương ứng:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **API Endpoint:** [`POST /api/vocab/review/submit`](api-contract.md#12-post-apivocabreviewsubmit)

```gherkin
Scenario Outline: Cập nhật chu kỳ FSRS và ghi vết lịch sử khi người dùng trả lời
  Given thẻ từ vựng với "cardId" tồn tại trong collection "vocab_cards"
  When Client gửi yêu cầu "POST /api/vocab/review/submit" với "<isCorrect>" và thời gian "<responseTimeMs>"
  Then Hệ thống phản hồi HTTP 200 OK
    And Điểm đánh giá "rating" được tính tương ứng là <expectedRating>
    And Trạng thái FSRS của thẻ được cập nhật với "reps" tăng 1 và "due" mới trong tương lai
    And Một bản ghi nhật ký mới được tạo trong collection "vocab_review_logs" ghi nhận chi tiết lượt ôn tập

  Examples:
    | isCorrect | responseTimeMs | expectedRating | Ghi chú |
    | true      | 2500           | 3              | Trả lời đúng trong thời gian bình thường (Rating = Good) |
    | false     | 5000           | 1              | Trả lời sai (Rating = Again, kích hoạt relearning) |
```

---

### AC-VOCAB-03: Thống kê số lượng thẻ đến hạn và phân loại trạng thái FSRS
- **User Story tương ứng:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **API Endpoint:** [`GET /api/vocab/review/due-count`](api-contract.md#13-get-apivocabreviewdue-count)

```gherkin
Scenario: Lấy thống kê số lượng thẻ cần ôn tập
  Given cơ sở dữ liệu có các thẻ từ vựng với các mốc thời gian "due" và "stability" khác nhau
  When Client gửi yêu cầu "GET /api/vocab/review/due-count"
  Then Hệ thống phản hồi HTTP 200 OK
    And "dueCount" bằng chính xác số lượng thẻ có "fsrs.due <= thời gian hiện tại"
    And "totalCount" bằng tổng số lượng thẻ đang lưu trong hệ thống
    And Tổng của "newCount", "learningCount" và "masteredCount" bằng với "totalCount"
```

---

### AC-VOCAB-04: Trích xuất danh sách từ vựng ứng viên cho Speaking Quiz
- **User Story tương ứng:** [`US-VOCAB-02`](spec.md#us-vocab-02)
- **Phương thức nội bộ:** `VocabReviewService.getCandidateDueVocab`

```gherkin
Scenario: Cung cấp từ vựng đến hạn cho Worker sinh câu hỏi Speaking Quiz
  Given hệ thống có 2 thẻ đến hạn (due <= now) và nhiều thẻ khác đang học
  When Node "ContextResolverNode" gọi "getCandidateDueVocab({ limit: 3 })"
  Then Hệ thống ưu tiên chọn 2 thẻ đã đến hạn và gắn nhãn "srsStatus" là "due"
    And Bổ sung thêm 1 thẻ có độ ổn định "stability" thấp nhất trong số thẻ còn lại
    And Toàn bộ danh sách trả về có đầy đủ các trường "word", "explanation", "level", "srsStatus"
    And Tổng số lượng phần tử trả về không vượt quá giới hạn 3
```

---

*Made by Anh Tu - Share to be share*

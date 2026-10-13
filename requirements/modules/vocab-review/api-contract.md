# Module Vocab Review — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `VOCAB` | **Phạm vi:** Backend HTTP REST Endpoints & Internal Service API  
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md) | [Hợp đồng gốc](../../../docs/contracts/vocab-review-api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `GET /api/vocab/review/session`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-VOCAB-01`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-VOCAB-01`](acceptance-criteria.md#ac-vocab-01)
- **Quy tắc Nghiệp vụ Chi phối:** [`BR-06 (FSRS Review Consistency)`](../../global/business-rules.md#2-danh-muc-quy-tac-nghiep-vu-cot-loi)

* **Mục đích:** Cung cấp danh sách các câu hỏi trắc nghiệm ngữ nghĩa và câu hỏi điền từ cloze test phục vụ một phiên ôn tập của học viên.
* **Request Headers:** `Content-Type: application/json`
* **Query Parameters:**
  | Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
  |---|---|---|---|---|
  | `limit` | `number` | Không | `15` | Số lượng câu hỏi tối đa trong phiên (kẹp trong khoảng 1 đến 30). |
  | `practiceAll` | `boolean` | Không | `false` | Nếu `true`, lấy toàn bộ từ vựng mà không phân biệt thẻ đã đến hạn hay chưa. |

* **Success Response (HTTP 200 OK):**
  ```json
  {
    "questions": [
      {
        "cardId": "670a1b2c3d4e5f6a7b8c9d0e",
        "word": "sustainable",
        "ipa": "/səˈsteɪ.nə.bəl/",
        "audioUrl": "https://storage.googleapis.com/.../sustainable.mp3",
        "level": "B2",
        "wordFamily": [],
        "collocations": [],
        "sourceStorybookTitle": "The Future of Clean Energy",
        "explanation": "Có thể duy trì lâu dài, bền vững",
        "options": [
          { "id": "A", "text": "Có thể duy trì lâu dài, bền vững", "isCorrect": true },
          { "id": "B", "text": "Phức tạp và khó giải quyết", "isCorrect": false },
          { "id": "C", "text": "Nhanh chóng biến mất", "isCorrect": false },
          { "id": "D", "text": "Tạm thời không xác định", "isCorrect": false }
        ],
        "exampleSentences": [
          { "sentence": "Solar energy is a ___ source of power.", "answer": "sustainable" }
        ],
        "quizMode": "cloze",
        "fsrsState": {
          "due": "2026-10-13T06:00:00.000Z",
          "reps": 3,
          "stability": 2.4
        }
      }
    ],
    "totalDue": 12,
    "sessionLimit": 15,
    "totalSaved": 145
  }
  ```
* **Failure Responses:**
  * `400 Bad Request`: `{ "statusCode": 400, "message": "limit must be a number between 1 and 30" }`

---

### 1.2 `POST /api/vocab/review/submit`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-VOCAB-02`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-VOCAB-02`](acceptance-criteria.md#ac-vocab-02)

* **Mục đích:** Ghi nhận kết quả trả lời từng câu hỏi của học viên, chạy thuật toán `ts-fsrs` v4 để cập nhật chu kỳ ôn tập kế tiếp và lưu vết vào `vocab_review_logs`.
* **Request Headers:** `Content-Type: application/json`
* **Request Body (JSON Payload):**
  ```json
  {
    "cardId": "670a1b2c3d4e5f6a7b8c9d0e",
    "isCorrect": true,
    "responseTimeMs": 3200
  }
  ```
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "cardId": "670a1b2c3d4e5f6a7b8c9d0e",
    "word": "sustainable",
    "isCorrect": true,
    "rating": 3,
    "nextDue": "2026-10-18T10:00:00.000Z",
    "stability": 4.8,
    "difficulty": 4.2,
    "reps": 4,
    "lapses": 0
  }
  ```
* **Failure Responses:**
  * `400 Bad Request`: `{ "statusCode": 400, "message": "cardId must be a valid MongoDB ObjectId" }`
  * `404 Not Found`: `{ "statusCode": 404, "message": "Vocab card not found" }`

---

### 1.3 `GET /api/vocab/review/due-count`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-VOCAB-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-VOCAB-01`](spec.md#us-vocab-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-VOCAB-03`](acceptance-criteria.md#ac-vocab-03)

* **Mục đích:** Thống kê số lượng từ đến hạn ôn tập và phân loại thẻ theo trạng thái ghi nhớ, phục vụ hiển thị huy hiệu (Badge) trên thanh điều hướng hoặc màn hình chính.
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "dueCount": 12,
    "totalCount": 145,
    "newCount": 18,
    "learningCount": 65,
    "masteredCount": 62,
    "nextDueTimestamp": "2026-10-13T15:30:00.000Z"
  }
  ```

---

## 2. Giao Diện Dịch Vụ Nội Bộ (Inter-Module Internal Service Contract)

### 2.1 Phương Thức: `VocabReviewService.getCandidateDueVocab`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-VOCAB-04`](spec.md#2-yeu-cau-chuc-nang)
- **Mã Tiêu chí Chấp nhận:** [`AC-VOCAB-04`](acceptance-criteria.md#ac-vocab-04)
- **Consumer:** `SpeakingQuiz` plugin (`ContextResolverNode`)

* **Mục đích:** Trích xuất các từ vựng cần ưu tiên ôn tập để bơm vào danh sách `targetKeywords` của đề Speaking Quiz.
* **Chữ ký hàm (Signature):**
  ```typescript
  public async getCandidateDueVocab(options?: {
    limit?: number;
  }): Promise<CandidateVocabItem[]>
  ```
* **Cấu trúc Dữ liệu Trả về (`CandidateVocabItem`):**
  ```typescript
  export interface CandidateVocabItem {
    word: string;
    explanation: string;
    level: string; // 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
    srsStatus: 'due' | 'learning' | 'mastered' | 'new';
  }
  ```
* **Thuật toán Tuyển chọn (Selection Strategy):**
  1. **Tầng 1 (Ưu tiên tuyệt đối):** Thẻ có ngày đến hạn `fsrs.due <= now`, sắp xếp theo `fsrs.due ASC`.
  2. **Tầng 2 (Bổ sung dự phòng):** Nếu số lượng thẻ chưa đủ `limit`, lấy thêm thẻ chưa thuộc danh sách có `fsrs.stability ASC` và `fsrs.reps ASC`.
  3. **Gắn nhãn trạng thái (`srsStatus`):**
     * `due`: Thẻ có `due <= now`.
     * `mastered`: Thẻ có `stability >= 30` ngày.
     * `new`: Thẻ có `reps === 0`.
     * `learning`: Các trường hợp còn lại.

---

## 3. Cấu Trúc Lớp Dữ Liệu Trao Đổi (TypeScript DTOs & Interfaces)

```typescript
export interface ReviewOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

export interface ReviewQuestionItem {
  cardId: string;
  word: string;
  ipa?: string;
  audioUrl?: string;
  level: string;
  sourceStorybookTitle?: string;
  explanation: string;
  options: ReviewOption[];
  exampleSentences: Array<{ sentence: string; answer: string }>;
  quizMode: 'multiple_choice' | 'cloze';
  fsrsState: {
    due: string;
    reps: number;
    stability: number;
  };
}

export interface ReviewSessionResponse {
  questions: ReviewQuestionItem[];
  totalDue: number;
  sessionLimit: number;
  totalSaved: number;
}
```

---

*Made by Anh Tu - Share to be share*

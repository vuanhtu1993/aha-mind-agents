# Global 03 — Domain Models & Schema: aha-mind-agents

> **Tài liệu cha:** [Requirement Analysis Package](../README.md)  
> **Phiên bản:** 1.0 (Baseline — Enterprise Granular Architecture)  
> **Tầng kiến trúc:** `global/` (Domain Models, Ubiquitous Language & Schemas)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Thuật Ngữ Nghiệp Vụ Toàn Cục (Ubiquitous Language / Glossary)

| Thuật ngữ (English) | Định nghĩa Kỹ thuật / Học thuật | Ý nghĩa Nghiệp vụ trong aha-mind-agents |
|---|---|---|
| **Storybook** | Thực thể bài học đa phương tiện hoàn chỉnh bao gồm danh sách câu, từ vựng trọng tâm, audio base64 và căn chỉnh phiên âm IPA. | Đơn vị học tập cốt lõi cho tính năng Speech Shadowing trên PWA `aha-tools`. |
| **Phonetic Alignment (IPA)** | Ánh xạ 1:1 từng từ trong câu văn với chuỗi ký tự bảng phiên âm quốc tế (International Phonetic Alphabet). | Hỗ trợ giao diện Client tô sáng từ ngữ theo thời gian thực (*Word-by-word highlighting*) khi phát âm thanh. |
| **Speaking Question** | Thực thể câu hỏi luyện nói phản xạ kèm theo giàn giáo lập luận đa tầng. | Kích thích phản xạ tư duy và giúp người học rèn luyện kỹ năng nói độc thoại hoặc đối thoại. |
| **PREP Scaffold** | Mô hình giàn giáo 4 pha: Point (Luận điểm) $\rightarrow$ Reason (Luận cứ) $\rightarrow$ Example (Dẫn chứng) $\rightarrow$ Conclusion (Kết luận). | Chuẩn hóa tư duy phản biện quốc tế cho câu trả lời của học viên theo các bậc CEFR (B1, B2, C1). |
| **Agent Exec Log** | Bản ghi nhật ký kiểm toán ghi nhận toàn bộ chu kỳ thực thi của một tác vụ Agent. | Phục vụ Observability, giám sát Token tiêu thụ, độ trễ từng Node và truy vết lỗi. |
| **Agent Config** | Cấu hình tham số điều khiển và System Prompt động theo từng Node của Agent. | Cho phép Admin ghi đè model LLM, temperature và prompt mà không cần sửa code. |
| **Dual Emit Pattern** | Mẫu phát tán sự kiện kép: một luồng trực tiếp về HTTP SSE của Client, một luồng phát sóng qua Redis Pub/Sub. | Đảm bảo tính khả dụng cao cho người dùng cuối đồng thời phục vụ màn hình giám sát tập trung. |

---

## 2. Sơ Đồ Quan Hệ Thực Thể (Entity Relationship Diagram - ERD)

Hệ thống quản lý dữ liệu trên mô hình **Dual Database Cluster** (MongoDB Atlas) phân định rõ ranh giới giữa Dữ liệu Nghiệp vụ Học tập (`aha-tools`) và Dữ liệu Vận hành / Giám sát (`aha-mind`):

```mermaid
erDiagram
    %% DATABASE: aha-tools (Production Learning Data)
    STORYBOOKS ||--o{ SPEAKING_QUESTIONS : "referenced by storybookId"
    STORYBOOKS {
        ObjectId _id PK
        string title
        string originalText
        string level "easy | medium | hard"
        string voice
        number speakingRate
        string sourceType "text | youtube"
        string youtubeVideoId "Indexed"
        Array sentences "StorybookSentence[]"
        Array keywords "StorybookKeyword[]"
        timestamp createdAt
        timestamp updatedAt
    }

    SPEAKING_QUESTIONS {
        ObjectId _id PK
        ObjectId storybookId FK "Optional Index"
        string topic "Indexed"
        string question
        string level "B1 | B2 | C1"
        Array targetKeywords "TargetKeywordItem[]"
        Object prepScaffold "Point, Reason, Example, Conclusion"
        string status "active | archived"
        string generatedByModel
        timestamp createdAt
        timestamp updatedAt
    }

    %% DATABASE: aha-mind (Management & Observability Data)
    AGENT_CONFIGS ||--o{ AGENT_EXEC_LOGS : "governs execution"
    AGENT_CONFIGS {
        ObjectId _id PK
        string agentId UK "story-shadowing | speaking-quiz"
        string defaultModel "gemini-3.5-flash"
        Object nodeOverrides "Prompt, Model, Temp per Node"
        number temperature "0.0 - 1.0"
        number maxRetries
        boolean isActive
        timestamp updatedAt
    }

    AGENT_EXEC_LOGS {
        ObjectId _id PK
        string jobId UK "Indexed UUID"
        string agentId "Indexed"
        string pipeline "text | youtube"
        string status "pending | running | completed | failed"
        number durationMs
        Object tokenUsage "prompt, completion, totalTokens"
        Array timeline "TimelineEvent[] per Node"
        Object error "Error details if failed"
        timestamp createdAt
    }
```

---

## 3. Từ Điển Dữ Liệu & Ràng Buộc Toàn Vẹn (Data Dictionary)

### 3.1. Thực thể: `storybooks` (Database: `aha-tools`)
* `_id` (`ObjectId`, PK): Định danh duy nhất của bài học.
* `title` (`string`, Bắt buộc): Tiêu đề bài đọc hoặc tiêu đề video YouTube.
* `originalText` (`string`, Bắt buộc): Văn bản gốc toàn bài.
* `youtubeVideoId` (`string`, Tùy chọn, Đánh chỉ mục Index): ID video YouTube 11 ký tự dùng cho cơ chế Idempotency kiểm tra trùng lặp.
* `sentences` (`Array<StorybookSentence>`, Bắt buộc): Mảng danh sách các câu đã tách. Mỗi câu chứa:
  * `id` (`number`): Số thứ tự câu (1, 2, ...).
  * `text` (`string`): Văn bản của câu.
  * `audioBase64` (`string`): File âm thanh MP3 mã hóa Base64 phục vụ phát audio ngay trên Client.
  * `words` (`Array<{ word: string, ipa?: string }>`): Danh sách từ ngữ kèm ký tự ngữ âm IPA.
  * `startMs` / `endMs` (`number`): Mốc thời gian bắt đầu và kết thúc (nếu bóc tách từ video).
* `keywords` (`Array<StorybookKeyword>`): Danh sách từ vựng trọng tâm kèm giải thích tiếng Việt, cấp độ CEFR, Word Family và Collocations.
* `level` (`string`, Enum: `easy | medium | hard`): Độ khó phân loại bài học.
* `sourceType` (`string`, Enum: `text | youtube`): Nguồn tài nguyên đầu vào.

### 3.2. Thực thể: `speaking_questions` (Database: `aha-tools`)
* `_id` (`ObjectId`, PK): Định danh duy nhất của câu hỏi.
* `storybookId` (`ObjectId`, FK, Đánh chỉ mục Index): Tham chiếu đến bài học Storybook nguồn.
* `topic` (`string`, Bắt buộc): Chủ đề thảo luận bài nói.
* `question` (`string`, Bắt buộc): Câu hỏi kích thích tư duy phản biện.
* `level` (`string`, Enum: `B1 | B2 | C1`, Bắt buộc): Cấp độ năng lực ngôn ngữ theo khung CEFR.
* `prepScaffold` (`Object`, Bắt buộc): Cấu trúc giàn giáo tư duy PREP, bắt buộc chứa 4 giai đoạn (`point`, `reason`, `example`, `conclusion`), mỗi giai đoạn có:
  * `stage` (`string`): Tên giai đoạn (`point | reason | example | conclusion`).
  * `title` (`string`): Tiêu đề giai đoạn.
  * `signposts` (`string[]`): Các liên từ dẫn dắt câu (Signpost words, ví dụ: *"First and foremost", "For instance"*).
  * `hint` (`string`): Gợi ý phản xạ cho người học.
  * `modelAnswer` (`string`): Câu trả lời mẫu chuẩn ngữ pháp và phát âm.

### 3.3. Thực thể: `agent_configs` (Database: `aha-mind`)
* `_id` (`ObjectId`, PK): Định danh bản ghi cấu hình.
* `agentId` (`string`, Unique, Bắt buộc): Mã tác nhân định danh duy nhất (`story-shadowing`, `speaking-quiz`).
* `defaultModel` (`string`, Mặc định: `'gemini-3.5-flash'`): Mô hình LLM mặc định.
* `nodeOverrides` (`Object`): Ánh xạ ghi đè theo từng Node (`systemPrompt`, `model`, `temperature`).
* `temperature` (`number`, `0.0 - 1.0`): Độ sáng tạo suy luận.
* `maxRetries` (`number`, Mặc định: `2`): Số lần thử lại tối đa khi LLM lỗi.

### 3.4. Thực thể: `agent_exec_logs` (Database: `aha-mind`)
* `_id` (`ObjectId`, PK): Định danh log.
* `jobId` (`string`, Unique, Bắt buộc): Mã tác vụ duy nhất dạng UUID.
* `agentId` (`string`, Bắt buộc): Tên agent thực thi.
* `pipeline` (`string`, Bắt buộc): Pipeline cụ thể (`youtube`, `text`, `generate-quiz`).
* `status` (`string`, Enum: `'pending' | 'running' | 'completed' | 'failed'`): Trạng thái cuối cùng.
* `durationMs` (`number`): Tổng thời gian thực thi (mili-giây).
* `tokenUsage` (`Object`): Thống kê `promptTokens`, `completionTokens`, `totalTokens`.
* `timeline` (`Array<TimelineEvent>`): Dòng thời gian chi tiết từng Node (`nodeName`, `status`, `durationMs`, `timestamp`).

---

## 4. Ánh Xạ Ràng Buộc Kiến Trúc & Quyết Định (ADR Mapping)
* 📄 [ADR-001: Kiến Trúc Hybrid Micro-Backend & Direct SSE Streaming](../governance/adr/001-initial-architecture.md)
* 📄 [ADR-002: Dual-Cluster Database Persistence Strategy (aha-tools ⟷ aha-mind)](../governance/adr/002-dual-database-cluster-strategy.md)
* 📄 [ADR-003: Redis Pub/Sub & BullMQ Decoupled Job Execution Pattern](../governance/adr/003-redis-bullmq-execution.md)
* 📄 [ADR-004: Context Idempotency Caching Protocol](../governance/adr/004-context-idempotency-protocol.md)
* 📄 [ADR-005: Gemini Rate Limiter Queue for 429 Prevention](../governance/adr/005-gemini-rate-limiter-queue.md)

---

*Made by Anh Tu - Share to be share*

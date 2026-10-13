# Speaking Quiz Agent — API Integration Contract (aha-tools ⟷ aha-mind-agents)

> **Document Version:** 1.2.0  
> **Release Date:** 2026-10-13  
> **Status:** Active / Production Ready  
> **Target Audience:** Frontend/Backend Engineers tại `aha-tools` (Next.js) và `aha-mind-agents` (NestJS)  
> **Base URL (Local):** `http://localhost:3001/api`  
> **Base URL (Staging):** `https://agents-staging.aha.vn/api`  
> **Swagger UI:** `http://localhost:3001/api/docs`  
> **Author:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Khái Niệm & Kiến Trúc Tổng Quan (Architecture & Concept Anatomy)

### 1.1. Giải Phẫu Khái Niệm Cốt Lõi (Definition Anatomy)

> **API Contract (Hợp đồng Tích hợp Giao diện & Tác nhân)** là thỏa thuận giao thức kỹ thuật chuẩn hóa, bất biến giữa bên cung cấp dịch vụ (**Service Provider** — `aha-mind-agents`) và bên tiêu thụ (**Consumer** — `aha-tools`). Hợp đồng này quy định rõ cấu trúc dữ liệu gửi lên (Payload), các mã phản hồi HTTP (Status Codes), định dạng dữ liệu trả về (Response Schemas) và cơ chế truyền thông thời gian thực (HTTP REST & Server-Sent Events).

* **Asynchronous Queue Model (Mô hình Hàng đợi Bất đồng bộ):** Do tác vụ sinh câu hỏi kết hợp phản biện và tổng hợp giàn giáo PREP qua mô hình ngôn ngữ lớn (LLM — Gemini 2.5) mất từ **10 – 25 giây**, hệ thống không giữ kết nối HTTP thông thường (tránh HTTP 504 Gateway Timeout) mà sử dụng **BullMQ + Redis Pub/Sub** để xử lý nền và phát sóng tiến độ theo từng chặng.
* **Idempotency (Tính Bất biến theo Ngữ cảnh):** Khi `aha-tools` gửi yêu cầu cho cùng một bài học `storybookId`, hệ thống kiểm tra và tái sử dụng ngay kết quả đã lưu trong CSDL MongoDB (`speaking_questions`), phản hồi ngay trong **$< 50\text{ms}$** và tiết kiệm 100% token LLM.
* **PREP Framework (Giàn giáo Tư duy Phản biện Quốc tế):**
  * **P (Point):** Luận điểm chính, nêu trực diện quan điểm trong câu đầu tiên.
  * **R (Reason):** Luận cứ & giải thích lý do sâu xa tại sao lại có quan điểm đó.
  * **E (Example):** Dẫn chứng, số liệu hoặc kinh nghiệm thực tiễn để bảo vệ quan điểm.
  * **P/C (Point / Conclusion):** Kết luận, khẳng định lại lập trường và đúc kết ý kiến.
* **SRS-to-Speaking Active Recall Injection (Cơ chế Bơm Từ Vựng SRS Kích Hoạt Trí Nhớ Chủ Động):**
  * *Tại sao cần tính năng này (Why):* Người học thường rơi vào trạng thái *Passive Recall* — nhận biết từ vựng khi đọc hiểu hoặc làm trắc nghiệm, nhưng "bế tắc" khi nói độc thoại.
  * *Cơ chế hoạt động:* Trong Node `context_resolved`, hệ thống tự động trích xuất các từ vựng đến hạn ôn tập (`fsrs.due <= now`) hoặc từ vựng đang học có độ vững chắc thấp (`stability` thấp) từ `VocabReviewService.getCandidateDueVocab({ limit: 3 })`.
  * *Ràng buộc tích hợp:* Các từ vựng này được gắn cờ `isInjected = true` và `srsStatus = 'due' | 'learning' | 'mastered' | 'new'`. Node `prep_synthesized` bắt buộc LLM phải lồng ghép tự nhiên **tối thiểu 2 từ vựng mục tiêu** vào các câu trả lời mẫu (`modelAnswer`) của 4 giai đoạn PREP.

---

### 1.2. Sơ Đồ Luồng Tích Hợp Đa Tác Nhân (Integration Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Learner as Học viên / Next.js UI (aha-tools)
    participant ClientSDK as SpeakingQuizClient (Next.js)
    participant GW as Gateway Controller (/api/agents/speaking-quiz/*)
    participant Redis as Redis Queue & Pub/Sub
    participant Worker as SpeakingQuizWorker (LangGraph)
    participant VocabSvc as VocabReviewService (FSRS Engine)
    participant Gemini as Google Gemini 2.5
    participant DB as MongoDB (speaking_questions)

    Note over Learner, GW: BƯỚC 1: KÍCH HOẠT JOB SINH ĐỀ BÀI
    Learner->>ClientSDK: Mở bài luyện nói (Speak Your Mind)
    ClientSDK->>GW: POST /api/agents/speaking-quiz/jobs { storybookId, level: 'B2' }
    GW->>DB: Kiểm tra xem đã có câu hỏi cho storybookId chưa?
    
    alt Đã tồn tại & forceRegenerate = false (Idempotency Cache)
        DB-->>GW: Trả về câu hỏi có sẵn
        GW-->>ClientSDK: HTTP 202 { status: 'completed', existingQuestionId: '...' }
        ClientSDK->>GW: GET /api/agents/speaking-quiz/questions/:existingQuestionId
        GW-->>ClientSDK: HTTP 200 OK (Chi tiết câu hỏi + giàn giáo PREP)
        ClientSDK-->>Learner: Hiển thị giao diện luyện nói ngay lập tức (< 50ms)
    else Chưa tồn tại hoặc forceRegenerate = true
        GW->>Redis: Đẩy Job vào hàng đợi 'speaking-quiz-queue'
        GW-->>ClientSDK: HTTP 202 { jobId, status: 'queued', sseUrl }
        
        Note over ClientSDK, Redis: BƯỚC 2: THEO DÕI TIẾN TRÌNH REAL-TIME QUA SSE
        ClientSDK->>GW: GET /api/agents/speaking-quiz/jobs/:jobId/progress (Accept: text/event-stream)
        QueueWorker: Worker nhận Job và khởi chạy LangGraph StateGraph
        
        %% Node 1: context_resolved & Vocab Injection
        Worker->>DB: Đọc nội dung Storybook
        Worker->>VocabSvc: getCandidateDueVocab({ limit: 3 })
        VocabSvc-->>Worker: Trả về danh sách từ vựng FSRS đến hạn
        Worker->>Worker: Hợp nhất targetKeywords (gắn srsStatus & isInjected = true)
        Worker->>Redis: Publish SSE { stage: 'context_resolved', progress: 25 }
        Redis-->>GW-->>ClientSDK: Event: progress 25% (Đã phân giải bài học & nạp từ vựng SRS)
        
        %% Node 2: question_formulated
        Worker->>Gemini: question_formulator: Đặt câu hỏi tranh luận sâu sắc
        Gemini-->>Worker: Topic & Debate Question
        Worker->>Redis: Publish SSE { stage: 'question_formulated', progress: 50 }
        Redis-->>GW-->>ClientSDK: Event: progress 50% (Đã tạo xong câu hỏi thảo luận)
        
        %% Node 3: prep_synthesized
        Worker->>Gemini: prep_synthesizer: Xây dựng giàn giáo PREP (ép lồng ghép từ vựng)
        Gemini-->>Worker: 4 giai đoạn Point, Reason, Example, Conclusion chứa từ vựng
        Worker->>Redis: Publish SSE { stage: 'prep_synthesized', progress: 80 }
        Redis-->>GW-->>ClientSDK: Event: progress 80% (Đang hoàn thiện giàn giáo PREP)
        
        %% Node 4: persister
        Worker->>DB: Lưu vào collection 'speaking_questions'
        Worker->>Redis: Publish SSE { status: 'done', progress: 100, payload: { questionId } }
        Redis-->>GW-->>ClientSDK: Event: done 100%
        
        Note over ClientSDK, DB: BƯỚC 3: TRUY VẤN DỮ LIỆU ĐỀ BÀI HOÀN CHỈNH
        ClientSDK->>ClientSDK: Đóng kết nối EventSource (sse.close())
        ClientSDK->>GW: GET /api/agents/speaking-quiz/questions/:questionId
        GW-->>ClientSDK: HTTP 200 OK (Câu hỏi, từ vựng gắn nhãn SRS & giàn giáo PREP)
        ClientSDK-->>Learner: Hiển thị giao diện SpeakYourMindPlayer
    end
```

---

## 2. Chi Tiết Đặc Tả Endpoints (API Endpoints Specification)

### 2.1. Kích hoạt Job sinh câu hỏi Speaking Quiz

* **Method:** `POST`
* **Path:** `/api/agents/speaking-quiz/jobs`
* **Content-Type:** `application/json`
* **Status Code:** `202 Accepted`

#### Request Body
| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Ý nghĩa & Mô tả |
| :--- | :--- | :---: | :---: | :--- |
| `storybookId` | `string` | Không | `null` | MongoDB ObjectId của bài học trong `aha-tools` (vd: `"679c1a2b3c4d5e6f7a8b9c0d"`). |
| `customTopic` | `string` | Không | `null` | Chủ đề tự do nếu không thuộc Storybook (vd: `"Remote Work vs Office Work"`). |
| `level` | `string` | Không | `"B2"` | Chuẩn CEFR: `"B1"`, `"B2"`, hoặc `"C1"`. |
| `targetKeywords` | `string[]` | Không | `[]` | Mảng từ khóa bắt buộc bổ sung thêm. Nếu để trống, hệ thống sẽ tự động trích xuất từ Storybook và bơm từ vựng FSRS đến hạn. |
| `forceRegenerate` | `boolean` | Không | `false` | Nếu `true`, ép AI sinh lại câu hỏi mới dù `storybookId` đã có sẵn bài tập trong DB. |

> **Quy tắc Nghiệp vụ (Validation Rule):** Bắt buộc phải cung cấp ít nhất một trong hai trường: `storybookId` HOẶC `customTopic`.

#### Request Example (Theo bài Storybook):
```json
{
  "storybookId": "679c1a2b3c4d5e6f7a8b9c0d",
  "level": "B2",
  "forceRegenerate": false
}
```

#### Request Example (Theo chủ đề tự do kèm từ khóa tùy biến):
```json
{
  "customTopic": "Artificial Intelligence in Education",
  "level": "C1",
  "targetKeywords": ["pedagogical", "automation"],
  "forceRegenerate": true
}
```

#### Response Example 1 — Khởi tạo Job mới thành công (HTTP 202 Accepted):
```json
{
  "jobId": "4",
  "status": "queued",
  "sseUrl": "/api/agents/speaking-quiz/jobs/4/progress",
  "createdAt": "2026-10-13T09:30:00.000Z"
}
```

#### Response Example 2 — Trúng Idempotency Cache (HTTP 202 Accepted — Phản hồi tức thì):
```json
{
  "jobId": "existing-6abdc5cae5d0b4f316e5516c",
  "status": "completed",
  "existingQuestionId": "6abdc5cae5d0b4f316e5516c",
  "createdAt": "2026-10-13T08:15:30.000Z"
}
```

---

### 2.2. Lắng nghe tiến trình thời gian thực qua SSE

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/jobs/:jobId/progress`
* **Request Headers:** `Accept: text/event-stream`
* **Response Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`

#### Danh sách các Stage sự kiện
| Stage | Progress (%) | Mô tả trạng thái xử lý |
| :--- | :---: | :--- |
| `context_resolved` | 25% | Đã phân giải bài học Storybook và nạp từ vựng FSRS đến hạn |
| `question_formulated`| 50% | Đã sinh câu hỏi tranh biện kích thích tư duy phản biện |
| `prep_synthesized` | 80% | Đã hoàn tất giàn giáo 4 pha PREP lồng ghép từ vựng mục tiêu |
| `completed` | 100% | Đã lưu bản ghi hợp lệ vào collection `speaking_questions` |

#### Luồng dữ liệu mẫu trên kết nối SSE (Stream Payload):
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no

data: {"jobId":"4","stepId":"contextResolver","stepName":"context_resolved","status":"completed","progress":25,"message":"Context resolved successfully"}

data: {"jobId":"4","stepId":"questionFormulator","stepName":"question_formulated","status":"completed","progress":50,"message":"Debate question formulated"}

data: {"jobId":"4","stepId":"prepSynthesizer","stepName":"prep_synthesized","status":"completed","progress":80,"message":"PREP scaffold synthesized"}

data: {"jobId":"4","stepId":"persister","stepName":"completed","status":"completed","progress":100,"message":"Speaking quiz successfully created and saved","payload":{"questionId":"6abdc5cae5d0b4f316e5516c"}}

data: {"jobId":"4","status":"done","progress":100,"message":"Speaking quiz generation completed","payload":{"questionId":"6abdc5cae5d0b4f316e5516c","topic":"The Future of Clean Energy","question":"Do you believe governments should mandate the total phase-out of fossil fuels by 2035?","level":"B2","tokenUsage":{"promptTokens":1250,"completionTokens":680,"totalTokens":1930}}}
```

> **Client Handling Note:** Khi nhận event có `status === "done"`, phía client đóng kết nối `EventSource` (`eventSource.close()`) và sử dụng `payload.questionId` để tải chi tiết bài học qua REST API.

---

### 2.3. Lấy chi tiết một câu hỏi theo ID

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/questions/:id`
* **Path Parameter:** `id` *(MongoDB ObjectId hợp lệ)*
* **Status Codes:**
  * `200 OK`: Trả về dữ liệu chi tiết câu hỏi, từ vựng và giàn giáo PREP.
  * `404 Not Found`: Không tìm thấy câu hỏi hoặc định dạng ObjectId không hợp lệ.

#### Response Example (HTTP 200 OK — Bao gồm các trường FSRS mới):
```json
{
  "id": "6abdc5cae5d0b4f316e5516c",
  "storybookId": "679c1a2b3c4d5e6f7a8b9c0d",
  "topic": "The Future of Clean Energy",
  "question": "Do you believe governments should mandate the total phase-out of fossil fuels by 2035? Why or why not?",
  "level": "B2",
  "targetKeywords": [
    {
      "word": "sustainable",
      "ipa": "/səˈsteɪ.nə.bəl/",
      "meaning": "Có thể duy trì lâu dài, bền vững",
      "srsStatus": "due",
      "isInjected": true
    },
    {
      "word": "transition",
      "ipa": "/trænˈzɪʃ.ən/",
      "meaning": "Quá trình chuyển đổi",
      "srsStatus": "learning",
      "isInjected": true
    },
    {
      "word": "subsidize",
      "ipa": "/ˈsʌb.sɪ.daɪz/",
      "meaning": "Trợ cấp, bao cấp tài chính",
      "srsStatus": "unsaved",
      "isInjected": false
    }
  ],
  "prepScaffold": {
    "point": {
      "stage": "point",
      "title": "State your direct stance",
      "signposts": ["In my opinion", "From my perspective", "I firmly believe that"],
      "hint": "Nêu rõ lập trường đồng ý hay phản đối việc loại bỏ hoàn toàn nhiên liệu hóa thạch vào năm 2035.",
      "modelAnswer": "In my opinion, governments must mandate the transition to renewable energy to secure a sustainable future."
    },
    "reason": {
      "stage": "reason",
      "title": "Explain the core reason",
      "signposts": ["The primary reason is that", "This is largely because", "Furthermore"],
      "hint": "Giải thích tác động của biến đổi khí hậu và lợi ích kinh tế lâu dài của năng lượng xanh.",
      "modelAnswer": "The primary reason is that continuing to burn fossil fuels accelerates climate change, whereas clean energy offers long-term economic stability."
    },
    "example": {
      "stage": "example",
      "title": "Illustrate with real-world proof",
      "signposts": ["For instance", "A clear illustration of this is", "Take the case of"],
      "hint": "Đưa ra dẫn chứng thực tế từ các quốc gia Bắc Âu hoặc các chính sách năng lượng mặt trời thành công.",
      "modelAnswer": "For instance, several European nations that stopped subsidizing coal have rapidly expanded their solar and wind grids without disrupting productivity."
    },
    "conclusion": {
      "stage": "conclusion",
      "title": "Reinforce your final thought",
      "signposts": ["To sum up", "Therefore", "Ultimately"],
      "hint": "Khẳng định lại tầm quan trọng của hành động quyết liệt và đúc kết thông điệp cuối cùng.",
      "modelAnswer": "Therefore, establishing a clear deadline by 2035 is an indispensable policy to drive sustainable innovation."
    }
  }
}
```

---

### 2.4. Truy vấn danh sách câu hỏi (Flexible Filters)

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/questions`
* **Query Parameters:**
  * `storybookId` *(Tùy chọn, string)*: Lọc theo Storybook ID.
  * `level` *(Tùy chọn, string)*: Lọc theo chuẩn CEFR (`B1`, `B2`, `C1`).
* **Status Code:** `200 OK`

#### Response Example:
```json
{
  "total": 1,
  "questions": [
    {
      "id": "6abdc5cae5d0b4f316e5516c",
      "storybookId": "679c1a2b3c4d5e6f7a8b9c0d",
      "topic": "The Future of Clean Energy",
      "question": "Do you believe governments should mandate the total phase-out of fossil fuels by 2035?",
      "level": "B2",
      "targetKeywords": [
        {
          "word": "sustainable",
          "ipa": "/səˈsteɪ.nə.bəl/",
          "meaning": "Có thể duy trì lâu dài, bền vững",
          "srsStatus": "due",
          "isInjected": true
        }
      ],
      "prepScaffold": {
        "point": { "...": "..." },
        "reason": { "...": "..." },
        "example": { "...": "..." },
        "conclusion": { "...": "..." }
      }
    }
  ]
}
```

---

## 3. TypeScript Interfaces Dành Cho Client `aha-tools`

Nhóm phát triển `aha-tools` có thể sao chép trực tiếp các Type definitions này vào `@/lib/types/speaking-quiz.ts`:

```typescript
/**
 * Chuẩn cấp độ năng lực ngôn ngữ CEFR
 */
export type CefrLevel = 'B1' | 'B2' | 'C1';

/**
 * Trạng thái Spaced Repetition của từ vựng
 * - due: Thẻ từ vựng đã đến hạn cần ôn tập (due <= now)
 * - learning: Thẻ đang trong chu kỳ học tập tích cực
 * - mastered: Thẻ đã đạt độ vững chắc cao (stability >= 30 ngày)
 * - new: Thẻ mới lưu, chưa qua lần ôn tập nào
 * - unsaved: Từ vựng được trích xuất từ bài học nhưng người học chưa lưu vào bộ từ
 */
export type SrsStatus = 'due' | 'learning' | 'mastered' | 'new' | 'unsaved';

/**
 * Cấu hình một chặng trong giàn giáo tư duy PREP
 */
export interface SpeakingScaffoldStage {
  stage: 'point' | 'reason' | 'example' | 'conclusion';
  title: string;
  signposts: string[];
  hint: string;
  modelAnswer: string;
}

/**
 * Trọn bộ giàn giáo PREP 4 chặng hoàn chỉnh
 */
export interface SpeakingPrepScaffold {
  point: SpeakingScaffoldStage;
  reason: SpeakingScaffoldStage;
  example: SpeakingScaffoldStage;
  conclusion: SpeakingScaffoldStage;
}

/**
 * Từ vựng trọng tâm kèm phát âm IPA, định nghĩa và nhãn FSRS
 */
export interface TargetKeywordItem {
  word: string;
  ipa?: string;
  meaning: string;
  /** Trạng thái ôn tập giãn cách FSRS của từ */
  srsStatus?: SrsStatus;
  /** Đánh dấu từ vựng được tự động bơm từ FSRS engine để kích hoạt phản xạ */
  isInjected?: boolean;
}

/**
 * Payload gửi lên để khởi tạo Job sinh đề bài Speaking Quiz
 */
export interface CreateSpeakingQuizJobRequest {
  storybookId?: string;
  customTopic?: string;
  level?: CefrLevel;
  targetKeywords?: string[];
  forceRegenerate?: boolean;
}

/**
 * Kết quả phản hồi khi tạo Job (HTTP 202)
 */
export interface CreateSpeakingQuizJobResponse {
  jobId: string;
  status: 'queued' | 'completed';
  sseUrl?: string;
  existingQuestionId?: string;
  createdAt: string;
}

/**
 * Trạng thái tra cứu chi tiết của Job trong BullMQ (REST Fallback)
 */
export interface SpeakingQuizJobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'queued';
  progress: number;
  result?: {
    questionId: string;
    topic?: string;
    question?: string;
    level?: CefrLevel;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  } | null;
  error?: string | null;
  createdAt: string;
}

/**
 * Chi tiết bản ghi đề bài Speaking Quiz hoàn chỉnh
 */
export interface SpeakingQuestionDetail {
  id: string;
  storybookId?: string;
  topic: string;
  question: string;
  level: CefrLevel;
  targetKeywords: TargetKeywordItem[];
  prepScaffold: SpeakingPrepScaffold;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt?: string;
}

/**
 * Kết quả truy vấn danh sách câu hỏi
 */
export interface SpeakingQuestionsListResponse {
  total: number;
  questions: SpeakingQuestionDetail[];
}

/**
 * Sự kiện tiến trình thời gian thực qua Server-Sent Events (SSE)
 */
export interface SpeakingQuizProgressEvent {
  type?: 'JOB_STARTED' | 'JOB_COMPLETED' | 'JOB_FAILED' | string;
  data?: any;
  jobId?: string;
  stepId?: string;
  stepName?:
    | 'context_resolved'
    | 'question_formulated'
    | 'prep_synthesized'
    | 'completed'
    | string;
  status?: 'completed' | 'done' | 'failed' | 'init';
  progress?: number;
  message?: string;
  payload?: {
    questionId?: string;
    topic?: string;
    question?: string;
    level?: CefrLevel;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

// -------------------------------------------------------------
// Alias đảm bảo 100% tương thích ngược với code UI hiện hành
// -------------------------------------------------------------
export type ITargetKeyword = TargetKeywordItem;
export type ISpeakingScaffoldStage = SpeakingScaffoldStage;
export type ISpeakingScaffold = SpeakingPrepScaffold;
export type ISpeakingQuestion = SpeakingQuestionDetail;
```

---

## 4. Code Mẫu Tích Hợp Client SDK (Next.js Implementation Example)

Đoạn mã mẫu sau triển khai toàn diện kết nối giữa `aha-tools` và `aha-mind-agents`, hỗ trợ tự động xử lý Idempotency, SSE streaming và gắn huy hiệu hiển thị từ vựng FSRS:

```typescript
import {
  CreateSpeakingQuizJobRequest,
  CreateSpeakingQuizJobResponse,
  SpeakingQuestionDetail,
  SpeakingQuizProgressEvent,
  TargetKeywordItem,
  SrsStatus,
} from '@/lib/types/speaking-quiz';

const AGENTS_BASE_URL = process.env.NEXT_PUBLIC_AGENTS_API_URL || 'http://localhost:3001/api';

/**
 * Kích hoạt sinh câu hỏi Speaking Quiz và lắng nghe SSE đến khi hoàn tất
 */
export async function generateSpeakingQuiz(
  request: CreateSpeakingQuizJobRequest,
  onProgress?: (progress: number, stageMessage: string) => void
): Promise<SpeakingQuestionDetail> {
  // 1. Gửi request tạo Job
  const res = await fetch(`${AGENTS_BASE_URL}/agents/speaking-quiz/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`Khởi tạo Job thất bại [${res.status}]: ${res.statusText}`);
  }

  const jobData: CreateSpeakingQuizJobResponse = await res.json();

  // 2. Nếu đã có sẵn câu hỏi (Idempotency Cache), tải ngay lập tức (< 50ms)
  if (jobData.status === 'completed' && jobData.existingQuestionId) {
    onProgress?.(100, 'Câu hỏi có sẵn đã sẵn sàng');
    return fetchQuestionById(jobData.existingQuestionId);
  }

  // 3. Mở luồng Server-Sent Events (SSE) theo dõi tiến độ
  return new Promise<SpeakingQuestionDetail>((resolve, reject) => {
    const sseUrl = jobData.sseUrl?.startsWith('http') 
      ? jobData.sseUrl 
      : `${AGENTS_BASE_URL.replace(/\/api$/, '')}${jobData.sseUrl}`;
    
    const sse = new EventSource(sseUrl);

    sse.onmessage = async (event) => {
      try {
        const data: SpeakingQuizProgressEvent = JSON.parse(event.data);

        if (data.progress !== undefined && data.message) {
          onProgress?.(data.progress, data.message);
        }

        // Khi tiến trình hoàn tất
        if (data.status === 'done' && data.payload?.questionId) {
          sse.close();
          const detail = await fetchQuestionById(data.payload.questionId);
          resolve(detail);
        } else if (data.status === 'failed') {
          sse.close();
          reject(new Error(data.message || 'Lỗi xử lý trong pipeline Agent'));
        }
      } catch (err) {
        sse.close();
        reject(err);
      }
    };

    sse.onerror = (err) => {
      sse.close();
      reject(new Error('Mất kết nối SSE với Agent Gateway'));
    };
  });
}

/**
 * Tải chi tiết câu hỏi theo ID
 */
export async function fetchQuestionById(id: string): Promise<SpeakingQuestionDetail> {
  const res = await fetch(`${AGENTS_BASE_URL}/agents/speaking-quiz/questions/${id}`);
  if (!res.ok) {
    throw new Error(`Không thể tải câu hỏi [${id}]: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Helper: Trích xuất nhãn và màu sắc hiển thị cho từ vựng FSRS
 */
export function getSrsBadgeConfig(keyword: TargetKeywordItem): {
  label: string;
  badgeClass: string;
  tooltip: string;
} {
  if (keyword.isInjected || keyword.srsStatus === 'due') {
    return {
      label: 'Cần Ôn Tập',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      tooltip: 'Từ vựng đến hạn ôn tập FSRS — Đã được lồng ghép vào câu hỏi này để bạn luyện phản xạ nói!',
    };
  }
  if (keyword.srsStatus === 'learning') {
    return {
      label: 'Đang Học',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      tooltip: 'Từ vựng đang trong chu kỳ củng cố trí nhớ',
    };
  }
  if (keyword.srsStatus === 'mastered') {
    return {
      label: 'Thành Thạo',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      tooltip: 'Từ vựng đã ghi nhớ vững chắc',
    };
  }
  return {
    label: 'Từ Khóa',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    tooltip: 'Từ vựng trọng tâm trong bài học',
  };
}
```

---

## 5. Bảng Mã Lỗi Thường Gặp (Error Handling Matrix)

| HTTP Code | Tình huống Lỗi | Nguyên nhân Kỹ thuật | Hướng Xử Lý Khuyến Nghị Cho Client |
| :---: | :--- | :--- | :--- |
| **`400`** | `Bad Request` | Thiếu cả `storybookId` lẫn `customTopic`, hoặc `level` không hợp lệ. | Kiểm tra lại DTO trước khi submit payload. |
| **`404`** | `Not Found` | Không tìm thấy câu hỏi với `id` cung cấp hoặc ObjectId sai format. | Thông báo cho học viên hoặc kích hoạt sinh câu hỏi mới. |
| **`429`** | `Too Many Requests` | Vượt ngưỡng Rate Limit quota của Gemini API. | BullMQ tự động retry 3 lần với Exponential Backoff; Client giữ kết nối SSE sẽ tự nhận kết quả khi retry hoàn tất. |
| **`500`** | `Internal Server Error` | Lỗi phân tích cú pháp Zod hoặc gián đoạn kết nối MongoDB Atlas. | Hiển thị thông báo thân thiện và cung cấp nút "Thử lại". |

---

*Made by Anh Tu - Share to be share*

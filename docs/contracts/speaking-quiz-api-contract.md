# Speaking Quiz Agent — API Integration Contract (aha-tools ⟷ aha-mind-agents)

> **Document Version:** 1.1.0  
> **Status:** Active / Production Ready  
> **Target Audience:** Frontend/Backend Engineers tại `aha-tools` và `aha-mind-agents`  
> **Base URL (Local):** `http://localhost:3001/api`  
> **Base URL (Staging):** `https://agents-staging.aha.vn/api`  
> **Swagger UI:** `http://localhost:3001/api/docs`  

---

## 1. Khái niệm & Kiến trúc Tổng quan (Architecture & Concept Anatomy)

### 1.1. Khái niệm cốt lõi (Definition Anatomy)

> **API Contract (Hợp đồng API)** là một thỏa thuận giao thức kỹ thuật chuẩn hóa, bất biến giữa bên cung cấp dịch vụ (**Service Provider** - `aha-mind-agents`) và bên tiêu thụ (**Consumer** - `aha-tools`). Hợp đồng này quy định rõ cấu trúc dữ liệu gửi lên (Payload), các mã phản hồi HTTP (Status Codes), định dạng dữ liệu trả về (Response Schemas) và cơ chế truyền thông (HTTP REST & Server-Sent Events).

- **Asynchronous Queue Model (Mô hình hàng đợi bất đồng bộ):** Do tác vụ sinh câu hỏi kết hợp phản biện và tổng hợp giàn giáo PREP qua mô hình ngôn ngữ lớn (LLM - Gemini 2.5) mất từ **10 – 25 giây**, hệ thống không giữ kết nối HTTP thông thường (tránh HTTP Timeout 504) mà sử dụng **BullMQ + Redis Pub/Sub** để xử lý nền và cập nhật trạng thái liên tục.
- **Idempotency (Tính bất biến theo ngữ cảnh):** Khi `aha-tools` gửi yêu cầu cho cùng một bài học `storybookId`, hệ thống kiểm tra và tái sử dụng ngay kết quả đã lưu trong CSDL MongoDB (`speaking_questions`), giúp phản hồi lập tức trong **< 50ms** và tiết kiệm 100% token LLM.
- **PREP Framework:** Phương pháp tư duy phản biện quốc tế:
  - **P (Point):** Luận điểm chính.
  - **R (Reason):** Luận cứ & giải thích lý do sâu xa.
  - **E (Example):** Dẫn chứng, số liệu hoặc câu chuyện minh họa.
  - **P (Point/Conclusion):** Kết luận, khẳng định lại lập trường và gợi mở hành động.

---

### 1.2. Sơ đồ Luồng Tích hợp (Integration Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    participant UI as aha-tools (Web / App)
    participant GW as aha-mind-agents (Gateway Controller)
    participant Redis as Redis Queue & PubSub
    participant Worker as SpeakingQuiz Worker (LangGraph)
    participant DB as MongoDB (speaking_questions)

    Note over UI, GW: Bước 1: Kích hoạt Job sinh câu hỏi
    UI->>GW: POST /api/agents/speaking-quiz/jobs { storybookId, level }
    GW->>DB: Kiểm tra xem đã có câu hỏi cho storybookId chưa?
    alt Đã tồn tại & forceRegenerate = false
        GW-->>UI: 202 Accepted { jobId: "existing-...", status: "completed", existingQuestionId }
        UI->>GW: GET /api/agents/speaking-quiz/questions/:id
        GW-->>UI: 200 OK (Dữ liệu câu hỏi + giàn giáo PREP hoàn chỉnh)
    else Chưa tồn tại hoặc forceRegenerate = true
        GW->>Redis: Đẩy Job vào 'speaking-quiz-queue'
        GW-->>UI: 202 Accepted { jobId, status: "queued", sseUrl }
        
        Note over UI, Redis: Bước 2: Lắng nghe tiến trình thời gian thực (SSE)
        UI->>GW: GET /api/agents/speaking-quiz/jobs/:jobId/progress (Accept: text/event-stream)
        Worker->>Redis: Lấy Job ra thực thi (LangGraph StateGraph)
        
        Worker->>Redis: Publish Event: context_resolved (25%)
        Redis-->>GW-->>UI: SSE Data: { progress: 25, stage: "context_resolved" }
        
        Worker->>Redis: Publish Event: question_formulated (50%)
        Redis-->>GW-->>UI: SSE Data: { progress: 50, stage: "question_formulated" }
        
        Worker->>Redis: Publish Event: prep_synthesized (80%)
        Redis-->>GW-->>UI: SSE Data: { progress: 80, stage: "prep_synthesized" }
        
        Worker->>DB: Lưu SpeakingQuestion { question, prepScaffold, ... }
        Worker->>Redis: Publish Event: completed (100%)
        Redis-->>GW-->>UI: SSE Data: { status: "done", progress: 100, payload: { questionId, ... } }
        
        Note over UI, DB: Bước 3: Lấy toàn bộ dữ liệu để người học bắt đầu nói
        UI->>GW: GET /api/agents/speaking-quiz/questions/:questionId
        GW-->>UI: 200 OK (Chi tiết đề bài & Model Answer)
    end
```

---

## 2. Chi tiết Đặc tả Endpoint (API Endpoints Specification)

### 2.1. Kích hoạt Job sinh câu hỏi Speaking Quiz

* **Method:** `POST`
* **Path:** `/api/agents/speaking-quiz/jobs`
* **Content-Type:** `application/json`
* **Status Code:** `202 Accepted`

#### Request Body
| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Ý nghĩa & Ví dụ |
| :--- | :--- | :---: | :---: | :--- |
| `storybookId` | `string` | Không | `null` | MongoDB ObjectId của bài học trong `aha-tools` (vd: `"679c1a2b3c4d5e6f7a8b9c0d"`). |
| `customTopic` | `string` | Không | `null` | Chủ đề tự do nếu không thuộc Storybook (vd: `"Artificial Intelligence and Human Creativity"`). |
| `level` | `string` | Không | `"B2"` | Chuẩn CEFR: `"B1"`, `"B2"`, hoặc `"C1"`. |
| `targetKeywords` | `string[]` | Không | `[]` | Mảng từ vựng trọng tâm cần ép AI đưa vào câu hỏi và giàn giáo (vd: `["productivity", "isolation"]`). |
| `forceRegenerate` | `boolean` | Không | `false` | Nếu `true`, ép AI sinh lại câu hỏi mới dù `storybookId` đã có sẵn bài tập trong DB. |

> **Quy tắc Nghiệp vụ:** Phải cung cấp ít nhất một trong hai trường: `storybookId` HOẶC `customTopic`.

#### Request Example (Theo bài Storybook):
```json
{
  "storybookId": "679c1a2b3c4d5e6f7a8b9c0d",
  "level": "B2",
  "targetKeywords": ["sustainable", "transition"],
  "forceRegenerate": false
}
```

#### Request Example (Theo chủ đề tự do):
```json
{
  "customTopic": "Work from Home vs Office Work",
  "level": "B1"
}
```

#### Response Example 1: Job mới được xếp hàng đợi (Queueing)
```json
{
  "jobId": "4",
  "status": "queued",
  "sseUrl": "/api/agents/speaking-quiz/jobs/4/progress",
  "createdAt": "2026-10-01T09:30:00.000Z"
}
```

#### Response Example 2: Đã có sẵn câu hỏi (Idempotent Hit — Trả kết quả ngay)
```json
{
  "jobId": "existing-6abdc5cae5d0b4f316e5516c",
  "status": "completed",
  "existingQuestionId": "6abdc5cae5d0b4f316e5516c",
  "createdAt": "2026-10-01T08:15:30.000Z"
}
```

---

### 2.2. Lắng nghe tiến trình thời gian thực qua SSE

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/jobs/:jobId/progress`
* **Headers:** `Accept: text/event-stream`
* **Response Content-Type:** `text/event-stream`

#### Danh sách các Stage sự kiện
| Stage | Progress (%) | Mô tả trạng thái |
| :--- | :---: | :--- |
| `context_resolved` | 25% | Đã phân giải xong bài học Storybook hoặc chủ đề tự do |
| `question_formulated`| 50% | Đã sinh xong câu hỏi tranh luận kích thích phản biện |
| `prep_synthesized` | 80% | Đã tổng hợp đầy đủ 4 chặng PREP và câu trả lời mẫu |
| `completed` | 100% | Đã kiểm duyệt định dạng Zod và lưu bản ghi vào CSDL |

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

data: {"jobId":"4","status":"done","progress":100,"message":"Speaking quiz generation completed","payload":{"questionId":"6abdc5cae5d0b4f316e5516c","topic":"Artificial Intelligence and Human Creativity","question":"Should AI-generated art be considered equal to human-made art, or does true creativity require human emotion and experience?","level":"B2","tokenUsage":{"promptTokens":1250,"completionTokens":680,"totalTokens":1930}}}
```

> **Client Handling Note:** Khi nhận event có `status === "done"`, phía client ngắt kết nối `EventSource` (`eventSource.close()`) và sử dụng `payload.questionId` để tải bài học chi tiết.

---

### 2.3. Truy vấn danh sách câu hỏi (Flexible Filters)

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/questions`
* **Query Parameters:**
  - `storybookId` *(optional, string)*: Lọc theo Storybook ID.
  - `level` *(optional, string)*: Lọc theo cấp độ CEFR (`B1`, `B2`, `C1`).
* **Status Code:** `200 OK`

#### Response Example:
```json
{
  "total": 1,
  "questions": [
    {
      "id": "6abdc5cae5d0b4f316e5516c",
      "storybookId": "679c1a2b3c4d5e6f7a8b9c0d",
      "topic": "The Future of Renewable Energy",
      "question": "Should governments completely phase out fossil fuel subsidies within five years?",
      "level": "B2",
      "targetKeywords": [
        {
          "word": "sustainable",
          "ipa": "/səˈsteɪ.nə.bəl/",
          "meaning": "Bền vững, thân thiện môi trường"
        },
        {
          "word": "transition",
          "ipa": "/trænˈzɪʃ.ən/",
          "meaning": "Quá trình chuyển đổi"
        }
      ],
      "prepScaffold": {
        "point": {
          "stage": "point",
          "title": "Main Point",
          "signposts": ["In my opinion", "I strongly believe that", "From my perspective"],
          "hint": "Nêu rõ quan điểm của bạn đồng ý hay phản đối việc loại bỏ trợ cấp",
          "modelAnswer": "In my opinion, governments must immediately phase out fossil fuel subsidies to accelerate the transition to green energy."
        },
        "reason": {
          "stage": "reason",
          "title": "Supporting Reason",
          "signposts": ["The primary reason is that", "This is largely because", "Furthermore"],
          "hint": "Giải thích tác động của việc trợ cấp đến giá năng lượng tái tạo và ngân sách quốc gia",
          "modelAnswer": "The primary reason is that continuing these subsidies distorts the market and slows down investments in sustainable alternatives."
        },
        "example": {
          "stage": "example",
          "title": "Specific Example",
          "signposts": ["For instance", "A clear illustration of this is", "Take the case of"],
          "hint": "Đưa ra dẫn chứng thực tế từ một quốc gia hoặc nghiên cứu đã giảm phát thải thành công",
          "modelAnswer": "For instance, European nations that reallocated subsidies toward wind and solar saw renewable adoption increase by over 40%."
        },
        "conclusion": {
          "stage": "conclusion",
          "title": "Conclusion / Restatement",
          "signposts": ["In conclusion", "Therefore", "Ultimately"],
          "hint": "Tóm lược lại luận điểm và nhấn mạnh tầm quan trọng của hành động khẩn cấp",
          "modelAnswer": "Therefore, redirecting financial resources away from fossil fuels is a vital step toward long-term environmental sustainability."
        }
      }
    }
  ]
}
```

---

### 2.4. Lấy chi tiết một câu hỏi theo ID

* **Method:** `GET`
* **Path:** `/api/agents/speaking-quiz/questions/:id`
* **Param:** `id` *(MongoDB ObjectId)*
* **Status Codes:**
  - `200 OK`: Trả về dữ liệu chi tiết đối tượng câu hỏi (Cấu trúc tương đồng phần tử trong mảng ở mục 2.3).
  - `404 Not Found`: Khi không tìm thấy câu hỏi hoặc `id` không hợp lệ (`{"statusCode":404,"message":"Không tìm thấy câu hỏi với ID: ..."}`).

---

## 3. TypeScript Interfaces dành cho Client `aha-tools`

Nhóm phát triển `aha-tools` có thể sao chép trực tiếp các Type definitions này vào codebase Frontend/Backend của mình:

```typescript
/**
 * Chuẩn cấp độ ngôn ngữ CEFR
 */
export type CefrLevel = 'B1' | 'B2' | 'C1';

/**
 * Payload khởi tạo Job sinh đề bài
 */
export interface CreateSpeakingQuizJobRequest {
  storybookId?: string;
  customTopic?: string;
  level?: CefrLevel;
  targetKeywords?: string[];
  forceRegenerate?: boolean;
}

/**
 * Kết quả phản hồi khi tạo Job
 */
export interface CreateSpeakingQuizJobResponse {
  jobId: string;
  status: 'queued' | 'completed';
  sseUrl?: string;
  existingQuestionId?: string;
  createdAt: string;
}

/**
 * Cấu trúc một chặng trong giàn giáo PREP
 */
export interface SpeakingScaffoldStage {
  stage: 'point' | 'reason' | 'example' | 'conclusion';
  title: string;
  signposts: string[];
  hint: string;
  modelAnswer: string;
}

/**
 * Trọn bộ giàn giáo PREP 4 chặng
 */
export interface SpeakingPrepScaffold {
  point: SpeakingScaffoldStage;
  reason: SpeakingScaffoldStage;
  example: SpeakingScaffoldStage;
  conclusion: SpeakingScaffoldStage;
}

/**
 * Từ vựng trọng tâm kèm phát âm IPA và định nghĩa
 */
export interface TargetKeywordItem {
  word: string;
  ipa?: string;
  meaning: string;
}

/**
 * Chi tiết đề bài Speaking Quiz
 */
export interface SpeakingQuestionDetail {
  id: string;
  storybookId?: string;
  topic: string;
  question: string;
  level: CefrLevel;
  targetKeywords: TargetKeywordItem[];
  prepScaffold: SpeakingPrepScaffold;
}

/**
 * Kết quả truy vấn danh sách câu hỏi
 */
export interface SpeakingQuestionsListResponse {
  total: number;
  questions: SpeakingQuestionDetail[];
}

/**
 * Sự kiện tiến trình SSE
 */
export interface SpeakingQuizProgressEvent {
  jobId?: string;
  stepId?: string;
  stepName?: string;
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
```

---

## 4. Code Mẫu Tích Hợp (SDK Integration Example)

Đoạn mã mẫu viết bằng TypeScript/JavaScript phía `aha-tools` thực hiện trọn vẹn chu trình: **Gửi Job $\rightarrow$ Bắt SSE Progress Bar $\rightarrow$ Nhận bài học**:

```typescript
import { 
  CreateSpeakingQuizJobRequest, 
  CreateSpeakingQuizJobResponse, 
  SpeakingQuestionDetail,
  SpeakingQuizProgressEvent 
} from './speaking-quiz.types';

const AGENTS_BASE_URL = 'http://localhost:3001/api';

/**
 * Kích hoạt sinh câu hỏi và lắng nghe đến khi hoàn tất
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
    throw new Error(`Tạo Job thất bại: ${res.statusText}`);
  }

  const jobData: CreateSpeakingQuizJobResponse = await res.json();

  // 2. Nếu đã có sẵn câu hỏi (Idempotency), lấy trực tiếp ngay lập tức
  if (jobData.status === 'completed' && jobData.existingQuestionId) {
    onProgress?.(100, 'Câu hỏi có sẵn đã sẵn sàng');
    return fetchQuestionById(jobData.existingQuestionId);
  }

  // 3. Nếu là Job mới, mở kết nối SSE lắng nghe tiến trình
  return new Promise<SpeakingQuestionDetail>((resolve, reject) => {
    const sse = new EventSource(`${AGENTS_BASE_URL}${jobData.sseUrl}`);

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
          reject(new Error(data.message || 'Lỗi xử lý trong Pipeline'));
        }
      } catch (err) {
        sse.close();
        reject(err);
      }
    };

    sse.onerror = (err) => {
      sse.close();
      reject(new Error('Mất kết nối Server-Sent Events với Agent Gateway'));
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
```

---

## 5. Bảng Mã Lỗi Thường Gặp (Error Handling Matrix)

| HTTP Code | Error Scenario | Nguyên nhân | Hướng xử lý cho client |
| :---: | :--- | :--- | :--- |
| **`400`** | `Bad Request` | Thiếu cả `storybookId` lẫn `customTopic`, hoặc `level` không thuộc `['B1', 'B2', 'C1']`. | Kiểm tra lại dữ liệu đầu vào theo DTO trước khi submit. |
| **`404`** | `Not Found` | Không tìm thấy câu hỏi với `id` được chỉ định hoặc format ObjectId sai. | Kiểm tra ID hoặc điều hướng người dùng tạo mới. |
| **`429`** | `Too Many Requests` | Vượt ngưỡng Rate Limit quota của Gemini API. | Hàng đợi BullMQ sẽ tự động retry tối đa 3 lần với Exponential Backoff. Client giữ kết nối SSE sẽ tự nhận kết quả khi retry thành công. |
| **`500`** | `Internal Server Error` | Lỗi phân tích cú pháp Zod hoặc CSDL MongoDB gián đoạn. | Hiển thị thông báo lỗi thân thiện cho người dùng, gửi lại yêu cầu. |

---

*Made by Anh Tu - Share to be share*

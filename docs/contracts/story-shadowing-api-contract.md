# Story Shadowing Agent — API Integration Contract (aha-tools ⟷ aha-mind-agents)

> **Document Version:** 2.0.0 (Asynchronous BullMQ + Redis Pub/Sub + GET SSE Architecture)  
> **Status:** Active / Production Ready  
> **Target Audience:** Frontend/Backend Engineers tại `aha-tools` và `aha-mind-agents`  
> **Base URL (Local):** `http://localhost:3001/api`  
> **Base URL (Staging):** `https://agents-staging.aha.vn/api`  
> **Swagger UI:** `http://localhost:3001/api/docs`  

---

## 1. Khái niệm & Kiến trúc Tổng quan (Architecture & Concept Anatomy)

### 1.1. Khái niệm cốt lõi (Definition Anatomy)

> **Story Shadowing Agent (Tác nhân Luyện Nói Phản Xạ qua Câu chuyện)** là một hệ thống Multi-Agent Pipeline tự động hóa, chuyển đổi văn bản thô (*Raw Text*) hoặc nội dung video đa phương tiện (*YouTube Video*) thành bài tập luyện phát âm chuẩn hóa theo phương pháp **Speech Shadowing**. Hệ thống kết hợp phân tích ngữ âm học (*Phonetic Alignment* với ký tự IPA), tổng hợp giọng nói tự nhiên (*Text-to-Speech*), và bóc tách từ vựng chuyên sâu (*Vocabulary Extraction & Enrichment*) nhằm tối ưu hóa nhịp điệu phát âm và vốn từ thực chiến cho người học.

Dưới góc nhìn sư phạm và kỹ thuật, khái niệm trên được cấu thành từ 4 trụ cột công nghệ then chốt:

1. **Speech Shadowing (Kỹ thuật Nói bóng):** Kỹ thuật rèn luyện phản xạ phát âm chuẩn bằng cách lắng nghe giọng người bản ngữ và lặp lại gần như đồng thời (với độ trễ chỉ từ **0.2 – 0.5 giây**). Cơ chế này ép não bộ tiếp thu trực tiếp ngữ điệu (*intonation*), trọng âm câu (*sentence stress*) và nối âm (*connected speech*) trong ngữ cảnh sống động thay vì học ngữ pháp thụ động.
2. **IPA Phonetic Alignment (Căn chỉnh phiên âm IPA từng từ):** Mỗi câu hoàn chỉnh được phân giải thành từng mẩu từ vựng đi kèm phiên âm chuẩn quốc tế (**IPA - International Phonetic Alphabet**). Phía giao diện học viên (`aha-tools`), dữ liệu này kết hợp cùng mốc thời gian để kích hoạt tính năng **Word-by-word Highlighting**, giúp người học nhận biết tức thì cách phát âm chính xác của từng âm tiết khó khi âm thanh vang lên.
3. **Asynchronous Request-Reply Pattern (Mô hình Hàng đợi Bất đồng bộ Phân tán):** Thay vì giữ kết nối HTTP chờ đợi kéo dài (dễ gây lỗi timeout 504 khi xử lý video YouTube dài hoặc sinh TTS hàng chục câu), hệ thống tách biệt thành 2 pha độc lập:
   - **Pha 1 (Enqueuing):** Client gửi yêu cầu tạo Job qua `POST /api/agents/story-shadowing/jobs` và nhận ngay mã `202 Accepted` kèm `jobId` và `sseUrl` (hoặc trả ngay bài có sẵn nếu trúng Idempotency).
   - **Pha 2 (Decoupled Progress Stream):** Worker nền (`StoryShadowingWorker`) kéo Job từ hàng đợi `story-shadowing-queue`, chạy LangGraph StateGraph và truyền phát sự kiện tiến độ qua **Redis Pub/Sub**. Client mở kết nối chuẩn `new EventSource(sseUrl)` qua giao thức GET để theo dõi thanh tiến trình.
4. **Idempotency (Tính bất biến theo ngữ cảnh):** Khi `aha-tools` gửi yêu cầu tạo bài học cho cùng một video YouTube (`youtubeUrl`), hệ thống tự động bóc tách `videoId`, kiểm tra CSDL MongoDB (`storybooks`). Nếu đã có bài học từ trước và `forceRegenerate === false`, hệ thống trả về kết quả lập tức trong **< 50ms**, tiết kiệm 100% token LLM và tài nguyên GPU/TTS.

---

### 1.2. Sơ đồ Luồng Tích hợp (Integration Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Learner as Học viên / Giáo viên
    participant UI as aha-tools (Web / App)
    participant GW as Gateway Controller (/api/agents/story-shadowing)
    participant Redis as Redis Queue & PubSub
    participant Worker as StoryShadowing Worker (LangGraph)
    participant DB as MongoDB (Collection: storybooks)

    Note over UI, GW: Bước 1: Kích hoạt Job tạo bài học Shadowing
    UI->>GW: POST /api/agents/story-shadowing/jobs { pipeline, text | youtubeUrl }
    GW->>DB: Kiểm tra xem đã có bài học cho videoId chưa? (Idempotency)
    alt Đã tồn tại & forceRegenerate = false
        GW-->>UI: 202 Accepted { jobId: "existing-...", status: "completed", existingStoryId }
        UI->>GW: GET /api/agents/story-shadowing/stories/:id
        GW-->>UI: 200 OK (Dữ liệu bài học hoàn chỉnh)
    else Chưa tồn tại hoặc forceRegenerate = true
        GW->>Redis: Đẩy Job vào 'story-shadowing-queue'
        GW-->>UI: 202 Accepted { jobId, status: "queued", sseUrl }
        
        Note over UI, Redis: Bước 2: Lắng nghe tiến trình qua chuẩn GET EventSource
        UI->>GW: GET /api/agents/story-shadowing/jobs/:jobId/progress (Accept: text/event-stream)
        Worker->>Redis: Lấy Job ra thực thi (LangGraph StateGraph)
        
        Worker->>Redis: Publish Event: sentenceSplitter / youtubeFetcher (30%)
        Redis-->>GW-->>UI: SSE Data: { progress: 30, stage: "sentenceSplitter" }
        
        Worker->>Redis: Publish Event: youtubeConsolidator / keywordIdentifier (50% - 75%)
        Redis-->>GW-->>UI: SSE Data: { progress: 50, stage: "keywordIdentifier" }
        
        Worker->>Redis: Publish Event: ttsGenerator / keywordEnricher (80% - 95%)
        Redis-->>GW-->>UI: SSE Data: { progress: 95, stage: "keywordEnricher" }
        
        Worker->>DB: Lưu Storybook { sentences, keywords, level, ... }
        Worker->>Redis: Publish Event: completed (100%)
        Redis-->>GW-->>UI: SSE Data: { status: "done", progress: 100, payload: { storyId } }
        
        Note over UI, DB: Bước 3: Lấy toàn bộ dữ liệu để người học bắt đầu Shadowing
        UI->>GW: GET /api/agents/story-shadowing/stories/:storyId
        GW-->>UI: 200 OK (Chi tiết bài học Storybook)
    end
```

---

## 2. Chi tiết Đặc tả Endpoint (API Endpoints Specification)

### 2.1. Kích hoạt Job tạo bài học Shadowing (Asynchronous Job Enqueue)

* **HTTP Method:** `POST`
* **Path:** `/api/agents/story-shadowing/jobs`
* **Headers:** `Content-Type: application/json`
* **Status Code:** `202 Accepted`

#### Request Body
| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Ý nghĩa & Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :---: | :--- |
| `pipeline` | `string` | **Có** | — | Chọn pipeline thực thi: `"text"` hoặc `"youtube"`. |
| `text` | `string` | Bắt buộc nếu chọn `text` | `null` | Đoạn văn bản tiếng Anh cần tạo bài tập (độ dài 10 - 10,000 ký tự). |
| `voice` | `string` | Không | `"FEMALE"` | Giọng đọc tổng hợp TTS (`"FEMALE"`, `"MALE"`, `"en-US-Journey-F"`). |
| `youtubeUrl` | `string` | Bắt buộc nếu chọn `youtube` | `null` | Đường dẫn URL YouTube hợp lệ có phụ đề (Closed Captions). |
| `forceRegenerate` | `boolean` | Không | `false` | Nếu `true`, ép hệ thống sinh lại bài học dù video đã từng được xử lý trong CSDL. |

#### Request Example (Text Pipeline):
```json
{
  "pipeline": "text",
  "text": "Habits are the compound interest of self-improvement. Getting 1 percent better every day counts for a lot in the long run.",
  "voice": "FEMALE"
}
```

#### Request Example (YouTube Pipeline):
```json
{
  "pipeline": "youtube",
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "forceRegenerate": false
}
```

#### Response Example 1: Job mới được xếp hàng đợi (Queueing)
```json
{
  "jobId": "12",
  "status": "queued",
  "sseUrl": "/api/agents/story-shadowing/jobs/12/progress",
  "createdAt": "2026-10-02T10:00:00.000Z"
}
```

#### Response Example 2: Đã có sẵn bài học (Idempotent Hit — Trả kết quả ngay)
```json
{
  "jobId": "existing-679c1a2b3c4d5e6f7a8b9c0d",
  "status": "completed",
  "existingStoryId": "679c1a2b3c4d5e6f7a8b9c0d",
  "createdAt": "2026-10-01T08:15:30.000Z"
}
```

---

### 2.2. Lắng nghe tiến trình thời gian thực qua Server-Sent Events (GET SSE)

* **HTTP Method:** `GET`
* **Path:** `/api/agents/story-shadowing/jobs/:jobId/progress`
* **Headers:** `Accept: text/event-stream`
* **Response Content-Type:** `text/event-stream; charset=utf-8`

> **Tương thích Trình duyệt:** Endpoint này sử dụng phương thức `HTTP GET`, cho phép ứng dụng Frontend `aha-tools` sử dụng trực tiếp Web API chuẩn của trình duyệt: `new EventSource(sseUrl)` mà không cần cài đặt thêm thư viện ngoài.

#### Danh sách các Stage sự kiện theo Pipeline:

##### Với Text Pipeline:
| Stage (`stepId`) | Progress (%) | Mô tả trạng thái |
| :--- | :---: | :--- |
| `init` | 0% | Khởi tạo Text Pipeline và nạp cấu hình |
| `sentenceSplitter` | 30% | Đã phân tách câu và gán phiên âm IPA từng từ |
| `keywordIdentifier`| 50% | Đã trích xuất danh sách từ vựng khó theo CEFR |
| `ttsGenerator` | 80% | Hoàn thành tổng hợp âm thanh giọng đọc TTS Base64 |
| `keywordEnricher` | 95% | Hoàn thành giải nghĩa từ vựng, word family, collocations |
| `completed` / `done` | 100% | Đã lưu bài học vào CSDL `storybooks` và trả về `storyId` |

##### Với YouTube Pipeline:
| Stage (`stepId`) | Progress (%) | Mô tả trạng thái |
| :--- | :---: | :--- |
| `init` | 0% | Khởi tạo YouTube Pipeline |
| `youtubeFetcher` | 30% | Đã tải danh sách phụ đề mốc thời gian từ YouTube |
| `youtubeConsolidator` | 50% | Đã gộp câu hoàn chỉnh, tính mốc `startMs`, `endMs` và phiên âm IPA |
| `keywordIdentifier`| 75% | Đã bóc tách từ vựng khó từ toàn bộ transcript |
| `keywordEnricher` | 95% | Hoàn thành giải nghĩa chuyên sâu ngữ cảnh |
| `completed` / `done` | 100% | Đã lưu bài học vào CSDL và trả về `storyId` |

#### Luồng dữ liệu mẫu trên kết nối SSE (Stream Payload):
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no

data: {"jobId":"12","stepId":"sentenceSplitter","status":"completed","progress":30,"message":"Đã phân tách câu và IPA"}

data: {"jobId":"12","stepId":"keywordIdentifier","status":"completed","progress":50,"message":"Đã trích xuất từ vựng khó"}

data: {"jobId":"12","stepId":"ttsGenerator","status":"completed","progress":80,"message":"Hoàn thành tổng hợp âm thanh TTS"}

data: {"jobId":"12","stepId":"keywordEnricher","status":"completed","progress":95,"message":"Hoàn thành giải nghĩa từ vựng"}

data: {"jobId":"12","status":"done","progress":100,"message":"Story shadowing lesson created and saved successfully","payload":{"storyId":"679c1a2b3c4d5e6f7a8b9c0d","id":"679c1a2b3c4d5e6f7a8b9c0d","title":"Bài luyện tập Text","level":"medium","sentenceCount":2}}
```

---

### 2.3. Lấy dữ liệu chi tiết bài học Storybook theo ID

* **HTTP Method:** `GET`
* **Path:** `/api/agents/story-shadowing/stories/:id`
* **Response Status Code:** `200 OK`

#### Response Example:
```json
{
  "_id": "679c1a2b3c4d5e6f7a8b9c0d",
  "title": "Habits and Self-Improvement",
  "sourceType": "text",
  "level": "medium",
  "voice": "FEMALE",
  "speakingRate": 1.0,
  "originalText": "Habits are the compound interest of self-improvement.",
  "sentences": [
    {
      "id": 1,
      "text": "Habits are the compound interest of self-improvement.",
      "audioBase64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "words": [
        { "word": "Habits", "ipa": "/ˈhæb.ɪts/" },
        { "word": "compound", "ipa": "/ˈkɒm.paʊnd/" },
        { "word": "interest", "ipa": "/ˈɪn.trəst/" }
      ]
    }
  ],
  "keywords": [
    {
      "word": "compound interest",
      "explanation": "Lãi kép; sự tăng trưởng lũy kế theo thời gian",
      "level": "B2",
      "collocations": [
        { "collocation": "earn compound interest", "explanation": "Hưởng lãi kép" }
      ]
    }
  ],
  "createdAt": "2026-10-02T10:05:00.000Z"
}
```

---

### 2.4. Truy vấn Danh sách Bài học (Flexible Filters)

* **HTTP Method:** `GET`
* **Path:** `/api/agents/story-shadowing/stories`
* **Query Parameters:**
  * `sourceType` *(optional, string)*: Lọc theo nguồn (`text` hoặc `youtube`).
  * `level` *(optional, string)*: Lọc theo cấp độ CEFR (`easy`, `medium`, `hard`).
* **Response Status Code:** `200 OK`

#### Response Example:
```json
{
  "total": 1,
  "stories": [
    {
      "_id": "679c1a2b3c4d5e6f7a8b9c0d",
      "title": "Habits and Self-Improvement",
      "sourceType": "text",
      "level": "medium",
      "sentenceCount": 1,
      "createdAt": "2026-10-02T10:05:00.000Z"
    }
  ]
}
```

---

## 3. Cấu trúc Dữ liệu Model (TypeScript Interface Contracts)

Nhóm phát triển `aha-tools` có thể sao chép trực tiếp các Type definitions này vào file `src/lib/types/story-shadowing.ts`:

```typescript
/**
 * @file story-shadowing.ts
 * @description Định nghĩa Type & Interface cho module Story Shadowing (Text & YouTube Pipelines)
 * 
 * Target Application: aha-tools (Next.js Frontend / PWA & Server Services)
 * Synchronized with: aha-mind-agents (NestJS Agent Gateway)
 * 
 * Made by Anh Tu - Share to be share
 */

export interface IWordItem {
  word: string;
  ipa: string;
}

export interface IStorybookSentence {
  id: number;
  text: string;
  audioBase64?: string; // Tệp âm thanh nén base64 (chỉ có trong Text Pipeline)
  words?: IWordItem[];  // Danh sách từ vựng kèm phiên âm IPA từng từ
  startMs?: number;     // Mốc bắt đầu tính theo mili-giây (cho YouTube Video)
  endMs?: number;       // Mốc kết thúc tính theo mili-giây (cho YouTube Video)
}

export interface IWordFamilyItem {
  word: string;
  partOfSpeech?: string;
  ipa?: string;
  explanation: string;
}

export interface ICollocationItem {
  collocation: string;
  explanation: string;
}

export interface IStorybookKeyword {
  word: string;
  ipa?: string;
  audioUrl?: string;
  explanation: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  wordFamily?: IWordFamilyItem[];
  collocations?: ICollocationItem[];
}

export interface IStorybook {
  _id: string;
  title: string;
  thumbnail?: string;
  originalText: string;
  sentences: IStorybookSentence[];
  keywords?: IStorybookKeyword[];
  level: "easy" | "medium" | "hard";
  voice: string;
  speakingRate: number;
  sourceType: "text" | "youtube";
  youtubeVideoId?: string;
  seriesId?: string;
  partIndex?: number;
  partTitle?: string;
  totalParts?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStoryShadowingJobRequest {
  pipeline: "text" | "youtube";
  text?: string;
  voice?: string;
  youtubeUrl?: string;
  forceRegenerate?: boolean;
}

export interface CreateStoryShadowingJobResponse {
  jobId: string;
  status: "queued" | "completed";
  sseUrl?: string;
  existingStoryId?: string;
  createdAt: string;
}

export interface StoryShadowingProgressEvent {
  jobId?: string;
  status?: "init" | "running" | "completed" | "done" | "failed";
  stepId?: string;
  progress?: number;
  message?: string;
  payload?: {
    storyId?: string;
    id?: string;
    title?: string;
    level?: string;
    sentenceCount?: number;
    sentences?: IStorybookSentence[];
    keywords?: IStorybookKeyword[];
  };
}
```

---

## 4. Hướng dẫn Tích hợp Phía Client (Client Integration Guide & SDK Snippet)

Nhờ kiến trúc Asynchronous Queue + GET SSE, phía `aha-tools` có thể sử dụng hàm SDK đồng nhất hoàn toàn với `speaking-quiz-client.ts`:

```typescript
/**
 * @file story-shadowing-client.ts
 * @description Client SDK tích hợp Story Shadowing Agent cho ứng dụng aha-tools
 * 
 * Made by Anh Tu - Share to be share
 */

import {
  CreateStoryShadowingJobRequest,
  CreateStoryShadowingJobResponse,
  StoryShadowingProgressEvent,
  IStorybook,
} from '@/lib/types/story-shadowing';

const AGENTS_BASE_URL = process.env.NEXT_PUBLIC_AGENTS_API_URL || 'http://localhost:3001/api';

/**
 * Tạo bài học Shadowing qua Hàng đợi và theo dõi tiến độ qua SSE
 */
export async function createStoryShadowingLesson(
  request: CreateStoryShadowingJobRequest,
  onProgress?: (progress: number, stageMessage: string) => void
): Promise<IStorybook> {
  // 1. Gửi request tạo Job vào BullMQ
  const res = await fetch(`${AGENTS_BASE_URL}/agents/story-shadowing/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`Tạo Job thất bại: ${res.statusText}`);
  }

  const jobData: CreateStoryShadowingJobResponse = await res.json();

  // 2. Nếu đã có sẵn bài học (Idempotency), tải trực tiếp ngay lập tức
  if (jobData.status === 'completed' && jobData.existingStoryId) {
    onProgress?.(100, 'Bài học có sẵn đã sẵn sàng');
    return fetchStoryById(jobData.existingStoryId);
  }

  // 3. Mở kết nối GET SSE lắng nghe tiến trình thời gian thực
  return new Promise<IStorybook>((resolve, reject) => {
    const sse = new EventSource(`${AGENTS_BASE_URL}${jobData.sseUrl}`);

    sse.onmessage = async (event) => {
      try {
        const data: StoryShadowingProgressEvent = JSON.parse(event.data);

        if (data.progress !== undefined && data.message) {
          onProgress?.(data.progress, data.message);
        }

        // Khi tiến trình hoàn tất
        if (data.status === 'done' && data.payload?.storyId) {
          sse.close();
          const story = await fetchStoryById(data.payload.storyId);
          resolve(story);
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
 * Tải chi tiết bài học Storybook theo ID
 */
export async function fetchStoryById(id: string): Promise<IStorybook> {
  const res = await fetch(`${AGENTS_BASE_URL}/agents/story-shadowing/stories/${id}`);
  if (!res.ok) {
    throw new Error(`Không thể tải bài học [${id}]: ${res.statusText}`);
  }
  return res.json();
}
```

---

## 5. Bảng Mã Lỗi Thường Gặp (Error Handling Matrix)

| HTTP Code | Error Scenario | Nguyên nhân | Hướng xử lý cho Client (`aha-tools`) |
| :---: | :--- | :--- | :--- |
| **`400`** | `Bad Request` | Dữ liệu đầu vào sai validation DTO: thiếu `text` khi pipeline là `text`; hoặc `youtubeUrl` không đúng định dạng. | Kiểm tra dữ liệu trên form trước khi gửi. |
| **`404`** | `Not Found` | Không tìm thấy bài học với `id` được chỉ định hoặc format ObjectId sai. | Kiểm tra ID hoặc điều hướng người dùng tạo mới. |
| **`422`** | `Unprocessable Entity` | Video YouTube bị tắt tính năng phụ đề (Closed Captions) hoặc là video riêng tư. | Thông báo người dùng chọn video khác có phụ đề tiếng Anh. |
| **`429`** | `Too Many Requests` | Vượt ngưỡng hạn ngạch Gemini / Google TTS. | Hàng đợi BullMQ tự động retry tối đa 3 lần với Exponential Backoff. Client giữ kết nối SSE sẽ tự nhận kết quả khi retry thành công. |
| **`500`** | `Internal Server Error` | Lỗi mạng gián đoạn với YouTube API, lỗi phân tích Zod hoặc CSDL MongoDB gián đoạn. | Hiển thị thông báo lỗi thân thiện cho người dùng, gửi lại yêu cầu. |

---

*Made by Anh Tu - Share to be share*

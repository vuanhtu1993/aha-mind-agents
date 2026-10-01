# Story Shadowing Agent — API Integration Contract (aha-tools ⟷ aha-mind-agents)

> **Document Version:** 1.1.0  
> **Status:** Active / Production Ready  
> **Target Audience:** Frontend/Backend Engineers tại `aha-tools` và `aha-mind-agents`  
> **Base URL (Local):** `http://localhost:3001/api`  
> **Base URL (Staging):** `https://agents-staging.aha.vn/api`  
> **Swagger UI:** `http://localhost:3001/api/docs`  

---

## 1. Khái niệm & Kiến trúc Tổng quan (Architecture & Concept Anatomy)

### 1.1. Khái niệm cốt lõi (Definition Anatomy)

> **Story Shadowing Agent (Tác nhân Luyện Nói Phản Xạ qua Câu chuyện)** là một hệ thống Multi-Agent Pipeline tự động hóa, chuyển đổi văn bản thô (Raw Text) hoặc nội dung video đa phương tiện (YouTube Video) thành bài tập luyện phát âm chuẩn hóa theo phương pháp **Speech Shadowing**. Hệ thống kết hợp phân tích ngữ âm học (Phonetic Alignment với IPA), tổng hợp giọng nói tự nhiên (Text-to-Speech), và bóc tách từ vựng chuyên sâu (Vocabulary Extraction & Enrichment) nhằm tối ưu hóa nhịp điệu phát âm và vốn từ thực chiến cho người học.

Dưới góc nhìn sư phạm và kỹ thuật, khái niệm trên được cấu thành từ 4 trụ cột công nghệ then chốt:

1. **Speech Shadowing (Kỹ thuật Nói bóng):** Kỹ thuật rèn luyện phản xạ phát âm chuẩn bằng cách lắng nghe giọng người bản ngữ và lặp lại gần như đồng thời (với độ trễ chỉ từ **0.2 – 0.5 giây**). Cơ chế này ép não bộ tiếp thu trực tiếp ngữ điệu (*intonation*), trọng âm câu (*sentence stress*) và nối âm (*connected speech*) trong ngữ cảnh sống động thay vì học ngữ pháp thụ động.
2. **IPA Phonetic Alignment (Căn chỉnh phiên âm IPA từng từ):** Mỗi câu hoàn chỉnh được phân giải thành từng mẩu từ vựng đi kèm phiên âm chuẩn quốc tế (**IPA - International Phonetic Alphabet**). Phía giao diện học viên (`aha-tools`), dữ liệu này kết hợp cùng mốc thời gian để kích hoạt tính năng **Word-by-word Highlighting**, giúp người học nhận biết tức thì cách phát âm chính xác của từng âm tiết khó khi âm thanh vang lên.
3. **Multi-Node Agent Pipeline (Quy trình Tác nhân Đa chặng):** Thay vì sử dụng một câu lệnh Prompt khổng lồ (monolithic prompt) dễ gây quá tải token và ảo giác (hallucination), quy trình được tổ chức thành đồ thị trạng thái **LangGraph StateGraph** với các Node tác nhân chuyên biệt:
   - `sentenceSplitter` / `youtubeFetcher`: Thu nhận dữ liệu nguồn và phân tách cấu trúc.
   - `youtubeConsolidator`: Gộp mẩu phụ đề rời rạc thành câu ngữ pháp hoàn chỉnh, đồng bộ mili-giây.
   - `ttsGenerator`: Tổng hợp âm thanh giọng đọc chuẩn Studio (Google Cloud TTS / ElevenLabs).
   - `keywordIdentifier`: Nhận diện thành ngữ (idioms), cụm động từ (phrasal verbs) và từ khó theo CEFR.
   - `keywordEnricher`: Cung cấp giải nghĩa ngữ cảnh tiếng Việt, họ từ vựng (*word family*) và cụm từ cố định (*collocations*).
4. **Dual Database Shared Persistence Model (Mô hình CSDL Chia sẻ Trực tiếp):** `aha-mind-agents` và `aha-tools` chia sẻ chung kết nối CSDL MongoDB (`AHA_TOOLS_CONNECTION`). Khi tác vụ hoàn tất, Agent Gateway ghi trực tiếp bài học vào collection `storybooks`, cho phép `aha-tools` truy xuất tức thì mà không cần lớp REST trung gian để đồng bộ dữ liệu.

---

### 1.2. Phân tích nguyên nhân gốc rễ & Sự đánh đổi (Root Cause Analysis & Trade-offs)

#### Root Cause Analysis (Lý do kiến trúc ra đời)
Trước đây, module Story Shadowing được tích hợp nội bộ (*in-process*) trực tiếp bên trong ứng dụng Next.js của `aha-tools`. Khi đưa vào vận hành thực tế, kiến trúc này bộc lộ 3 điểm nghẽn nghiêm trọng:
1. **Event Loop Starvation & Memory Spikes:** Việc xử lý chuyển đổi văn bản sang âm thanh (TTS Base64) cho các bài học 20 – 50 câu tiêu tốn lượng lớn tài nguyên CPU và bộ nhớ đệm, làm nghẽn Event Loop của server Next.js khiến trải nghiệm duyệt web của người dùng khác bị gián đoạn.
2. **Serverless Execution Timeout:** Trên môi trường Edge/Serverless (như Vercel), giới hạn thời gian phản hồi (10s – 60s) thường xuyên bị vi phạm khi kéo phụ đề YouTube dài và gọi các chuỗi LLM tuần tự.
3. **Mất dấu vết tiến trình (Observability Loss):** Hệ thống nguyên khối không cho phép theo dõi chi tiết độ trễ của từng Node, không đo lường được lượng token tiêu thụ và không tái cấu trúc lại được khi có lỗi xảy ra giữa chặng.

Việc chuyển dịch module này sang **`aha-mind-agents`** với tư cách là một Agent Gateway độc lập giải quyết trọn vẹn các thách thức trên, cung cấp luồng Server-Sent Events (SSE) thời gian thực và quản lý tài nguyên tập trung.

#### Trade-offs (Đánh đổi giải pháp)

| Giải pháp công nghệ | Ưu điểm (Pros) | Đánh đổi / Nhược điểm (Cons) | Biện pháp giải quyết |
| :--- | :--- | :--- | :--- |
| **HTTP POST + SSE Stream** thay vì HTTP Polling | Trực quan hóa tiến độ theo thời gian thực (0% $\rightarrow$ 100%), phản hồi tức thì độ trễ < 10ms giữa các node. | Kết nối HTTP dạng giữ lâu (Long-lived Connection), dễ bị ngắt kết nối bởi Proxy timeout hoặc CDN buffer. | Bổ sung cơ chế Heartbeat ping mỗi **15 giây** và cấu hình header `X-Accel-Buffering: no`. |
| **Ghi trực tiếp vào MongoDB `storybooks`** | `aha-tools` có thể mở bài đọc tức thì sau khi luồng SSE báo `done`, không tốn thêm roundtrip API đồng bộ. | Đòi hỏi 2 repository phải thống nhất chặt chẽ về Schema của `Storybook`. | Sử dụng chung Zod validation và Interface TypeScript đồng bộ hóa qua hợp đồng này. |
| **Phân tích Video YouTube từ Phụ đề (Transcripts)** thay vì Whisper Audio Processing | Tốc độ xử lý siêu nhanh (**5 – 15s** thay vì 2 – 5 phút), tiết kiệm 95% chi phí điện toán GPU/AI. | Phụ thuộc vào chất lượng Closed Captions (CC) sẵn có của video YouTube; không hoạt động với video tắt phụ đề. | Bắt lỗi sớm tại Node `youtubeFetcher`, trả về mã lỗi `422` thân thiện để người dùng chọn video khác. |

---

### 1.3. Sơ đồ Luồng Tích hợp (Integration Sequence Diagrams)

#### Sơ đồ 1: Luồng xử lý Văn bản thuần (Text Shadowing Pipeline)

```mermaid
sequenceDiagram
    autonumber
    actor Learner as Học viên / Giáo viên
    participant UI as aha-tools (Frontend / Web)
    participant GW as aha-mind-agents (API Gateway)
    participant StateGraph as LangGraph Text Engine
    participant TTS as Google Cloud TTS Engine
    participant DB as MongoDB (Collection: storybooks)

    Learner->>UI: Nhập văn bản bài học & chọn giọng đọc
    UI->>GW: POST /api/v1/agents/story-shadowing/text/stream (Accept: text/event-stream)
    GW-->>UI: 200 OK (Mở kết nối SSE Stream)
    
    GW->>StateGraph: Khởi chạy StateGraph với Input { text, voice }
    StateGraph-->>GW-->>UI: SSE: { status: "init", message: "Khởi tạo Text Pipeline..." }

    Note over StateGraph, GW: Chặng 1: Phân tách câu & Gán IPA (30%)
    StateGraph->>StateGraph: Thực thi sentenceSplitter (LLM)
    StateGraph-->>GW-->>UI: SSE: { stepId: "sentenceSplitter", status: "completed", progress: 30 }

    par Chạy song song TTS & Bóc tách từ vựng
        Note over StateGraph, TTS: Chặng 2: Tổng hợp giọng nói TTS (80%)
        StateGraph->>TTS: Tạo âm thanh cho từng câu (Base64)
        StateGraph-->>GW-->>UI: SSE: { stepId: "ttsGenerator", status: "completed", progress: 80 }
    and
        Note over StateGraph, GW: Chặng 3: Nhận diện từ vựng khó (50%)
        StateGraph->>StateGraph: Thực thi keywordIdentifier (LLM)
        StateGraph-->>GW-->>UI: SSE: { stepId: "keywordIdentifier", status: "completed", progress: 50 }
        
        Note over StateGraph, GW: Chặng 4: Giải nghĩa chuyên sâu (95%)
        StateGraph->>StateGraph: Thực thi keywordEnricher (LLM)
        StateGraph-->>GW-->>UI: SSE: { stepId: "keywordEnricher", status: "completed", progress: 95 }
    end

    Note over GW, DB: Chặng 5: Đóng gói bài học & Lưu trữ CSDL
    GW->>DB: Lưu Storybook { title, sentences, keywords, level, ... }
    DB-->>GW: Xác nhận lưu thành công (storyId)
    
    GW-->>UI: SSE: { status: "done", progress: 100, payload: { storyId, sentences, keywords } }
    UI->>UI: Đóng SSE & Điều hướng sang /apps/story-shadowing/player/:storyId
```

---

#### Sơ đồ 2: Luồng xử lý Video YouTube (YouTube Shadowing Pipeline)

```mermaid
sequenceDiagram
    autonumber
    actor Learner as Học viên / Giáo viên
    participant UI as aha-tools (Frontend / Web)
    participant GW as aha-mind-agents (API Gateway)
    participant YTGraph as LangGraph YouTube Engine
    participant YouTube as YouTube Transcript API
    participant DB as MongoDB (Collection: storybooks)

    Learner->>UI: Dán đường dẫn YouTube (youtubeUrl)
    UI->>GW: POST /api/v1/agents/story-shadowing/youtube/stream (Accept: text/event-stream)
    GW-->>UI: 200 OK (Mở kết nối SSE Stream)
    
    GW->>YTGraph: Khởi chạy YouTube Engine với { youtubeUrl }
    YTGraph-->>GW-->>UI: SSE: { status: "init", message: "Khởi tạo YouTube Pipeline..." }

    Note over YTGraph, YouTube: Chặng 1: Tải phụ đề mốc thời gian (30%)
    YTGraph->>YouTube: Lấy danh sách phụ đề (offset, duration, text)
    YTGraph-->>GW-->>UI: SSE: { stepId: "youtubeFetcher", status: "completed", progress: 30 }

    Note over YTGraph, GW: Chặng 2: Gộp câu hoàn chỉnh & Phiên âm IPA (50%)
    YTGraph->>YTGraph: Thực thi youtubeConsolidator (startMs, endMs, IPA)
    YTGraph-->>GW-->>UI: SSE: { stepId: "youtubeConsolidator", status: "completed", progress: 50 }

    Note over YTGraph, GW: Chặng 3: Bóc tách từ vựng trọng tâm (75%)
    YTGraph->>YTGraph: Thực thi keywordIdentifier (LLM)
    YTGraph-->>GW-->>UI: SSE: { stepId: "keywordIdentifier", status: "completed", progress: 75 }

    Note over YTGraph, GW: Chặng 4: Giải nghĩa ngữ cảnh tiếng Việt (95%)
    YTGraph->>YTGraph: Thực thi keywordEnricher (LLM)
    YTGraph-->>GW-->>UI: SSE: { stepId: "keywordEnricher", status: "completed", progress: 95 }

    Note over GW, DB: Chặng 5: Đóng gói bài học YouTube & Lưu CSDL
    GW->>DB: Lưu Storybook { sourceType: "youtube", youtubeVideoId, sentences, keywords }
    DB-->>GW: Trả về storyId đã lưu
    
    GW-->>UI: SSE: { status: "done", progress: 100, payload: { storyId, youtubeVideoId, ... } }
    UI->>UI: Đóng SSE & Mở bài học trực tiếp trên YouTube Player
```

---

## 2. Chi tiết Đặc tả Endpoint (API Endpoints Specification)

### 2.1. Kích hoạt Pipeline Xử lý Văn bản thuần (Text Shadowing Stream)

* **HTTP Method:** `POST`
* **Path:** `/api/v1/agents/story-shadowing/text/stream`
* **Headers yêu cầu:**
  * `Content-Type: application/json`
  * `Accept: text/event-stream`
* **Response Status Code:** `200 OK`
* **Response Content-Type:** `text/event-stream; charset=utf-8`

#### Request Body
| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Ý nghĩa & Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :---: | :--- |
| `text` | `string` | **Có** | — | Đoạn văn bản tiếng Anh cần tạo bài tập. Độ dài từ **10 đến 10,000 ký tự**. |
| `voice` | `string` | Không | `"FEMALE"` | Giọng đọc tổng hợp TTS (ví dụ: `"FEMALE"`, `"MALE"`, `"en-US-Journey-F"`). |

#### Request Example:
```json
{
  "text": "Habits are the compound interest of self-improvement. The same way that money multiplies through compound interest, the effects of your habits multiply as you repeat them.",
  "voice": "FEMALE"
}
```

#### Bảng Tiến trình Các Chặng (Progress Lifecycle Stages):
| Step ID (`stepId`) | Progress (%) | Tên chặng xử lý | Mô tả chi tiết |
| :--- | :---: | :--- | :--- |
| `init` | 0% | Khởi tạo Text Pipeline | Kiểm tra dữ liệu đầu vào và nạp cấu hình hệ thống. |
| `sentenceSplitter` | 30% | Phân tách câu & IPA | LLM tách văn bản thành các câu tự nhiên, xác định độ khó CEFR (`easy`/`medium`/`hard`), gán phiên âm IPA từng từ. |
| `keywordIdentifier`| 50% | Trích xuất từ vựng khó | LLM nhận diện từ vựng học thuật, thành ngữ (idioms), cụm động từ (phrasal verbs). |
| `ttsGenerator` | 80% | Tổng hợp âm thanh TTS | Dịch vụ TTS chuyển hóa từng câu thành tệp âm thanh Base64 phục vụ luyện nghe lặp. |
| `keywordEnricher` | 95% | Giải nghĩa từ vựng | LLM giải thích nghĩa theo ngữ cảnh tiếng Việt, bổ sung word family và collocations. |
| `done` | 100% | Hoàn tất & Lưu CSDL | Hệ thống lưu bài học vào MongoDB, trả về `storyId` và toàn bộ dữ liệu cấu trúc. |

---

### 2.2. Kích hoạt Pipeline Xử lý Video YouTube (YouTube Shadowing Stream)

* **HTTP Method:** `POST`
* **Path:** `/api/v1/agents/story-shadowing/youtube/stream`
* **Headers yêu cầu:**
  * `Content-Type: application/json`
  * `Accept: text/event-stream`
* **Response Status Code:** `200 OK`
* **Response Content-Type:** `text/event-stream; charset=utf-8`

#### Request Body
| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Ý nghĩa & Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :---: | :--- |
| `youtubeUrl` | `string` | **Có** | — | Đường dẫn URL YouTube hợp lệ (hỗ trợ `youtube.com/watch?v=...`, `youtu.be/...`). Video bắt buộc phải có phụ đề (Closed Captions). |

#### Request Example:
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

#### Bảng Tiến trình Các Chặng (Progress Lifecycle Stages):
| Step ID (`stepId`) | Progress (%) | Tên chặng xử lý | Mô tả chi tiết |
| :--- | :---: | :--- | :--- |
| `init` | 0% | Khởi tạo YouTube Pipeline | Kiểm tra định dạng link video và trích xuất `videoId`. |
| `youtubeFetcher` | 30% | Tải phụ đề YouTube | Kéo dữ liệu phụ đề thô có gắn mốc thời gian (start, duration). |
| `youtubeConsolidator` | 50% | Gộp câu & Phiên âm IPA | Gộp các mảnh phụ đề ngắt quãng thành câu hoàn chỉnh, tính toán chính xác mốc `startMs` và `endMs` cho video player. |
| `keywordIdentifier`| 75% | Trích xuất từ vựng khó | Phân tích toàn bộ transcript đã gộp câu để lấy ra các cụm từ khó tiêu biểu. |
| `keywordEnricher` | 95% | Giải nghĩa từ vựng | Bổ sung nghĩa tiếng Việt, cấp độ CEFR, họ từ vựng và cụm từ thông dụng. |
| `done` | 100% | Hoàn tất & Lưu CSDL | Lưu bản ghi dạng `sourceType: "youtube"`, trả về `storyId` và video thumbnail. |

---

### 2.3. Định dạng Luồng Dữ liệu Mẫu trên SSE Stream (Raw SSE Stream Examples)

Dưới đây là chuỗi bản tin thực tế truyền tải qua kết nối HTTP SSE từ máy chủ:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no

data: {"status":"init","message":"Khởi tạo Text Pipeline..."}

data: {"stepId":"sentenceSplitter","status":"completed","progress":30,"message":"Đã phân tách câu và IPA"}

data: {"stepId":"keywordIdentifier","status":"completed","progress":50,"message":"Đã trích xuất từ vựng khó"}

data: {"status":"running","message":"Heartbeat ping"}

data: {"stepId":"ttsGenerator","status":"completed","progress":80,"message":"Hoàn thành tổng hợp âm thanh TTS"}

data: {"stepId":"keywordEnricher","status":"completed","progress":95,"message":"Hoàn thành giải nghĩa từ vựng"}

data: {"status":"done","progress":100,"message":"Hoàn thành toàn bộ Text Pipeline","payload":{"storyId":"679c1a2b3c4d5e6f7a8b9c0d","id":"679c1a2b3c4d5e6f7a8b9c0d","level":"medium","speakingRate":1.0,"sentences":[{"id":1,"text":"Habits are the compound interest of self-improvement.","audioBase64":"UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=","words":[{"word":"Habits","ipa":"/ˈhæb.ɪts/"},{"word":"compound","ipa":"/ˈkɒm.paʊnd/"}]}],"keywords":[{"word":"compound interest","explanation":"Lãi kép; sự tích lũy tăng trưởng theo cấp số nhân","level":"B2","collocations":[{"collocation":"earn compound interest","explanation":"Hưởng lãi kép"}]}]}}
```

> **Ghi chú xử lý cho Frontend:** Khi nhận event có `status === "done"`, Client lấy trường `payload.storyId` (hoặc `payload.id`) để đóng kết nối và thực hiện điều hướng `router.push('/apps/story-shadowing/player/' + payload.storyId)`.

---

### 2.4. Tra cứu Danh mục Agent Plugins (Agent Discovery)

* **HTTP Method:** `GET`
* **Path:** `/api/v1/agents`
* **Mục đích:** Cho phép `aha-tools` tự động truy vấn danh sách các pipeline đang hoạt động, các cấu hình mặc định (Prompts, Model, Temperature) của plugin `story-shadowing`.
* **Response Example:**
  ```json
  [
    {
      "id": "story-shadowing",
      "displayName": "Story Shadowing Agent",
      "description": "Tạo bài học tiếng Anh theo phương pháp Shadowing từ văn bản thuần hoặc video YouTube.",
      "pipelines": [
        { "id": "text", "displayName": "Xử lý Văn bản thuần" },
        { "id": "youtube", "displayName": "Xử lý Video YouTube" }
      ]
    }
  ]
  ```

---

## 3. Cấu trúc Dữ liệu Model (TypeScript Interface Contracts)

Nhóm phát triển `aha-tools` có thể sao chép trực tiếp các Type definitions này vào file `src/lib/types/story-shadowing.ts`:

```typescript
/**
 * @file story-shadowing.ts
 * @description Hợp đồng Type & Interface chuẩn cho module Story Shadowing
 * 
 * Made by Anh Tu - Share to be share
 */

/**
 * 1 từ kèm phiên âm chuẩn IPA (International Phonetic Alphabet)
 */
export interface IWordItem {
  word: string;
  ipa: string;
}

/**
 * 1 câu hoàn chỉnh trong bài học Shadowing
 */
export interface IStorybookSentence {
  id: number;
  text: string;
  audioBase64?: string; // Tệp âm thanh nén base64 (chỉ có trong Text Pipeline)
  words?: IWordItem[];  // Danh sách từ vựng kèm phiên âm IPA từng từ
  startMs?: number;     // Mốc bắt đầu tính theo mili-giây (cho YouTube Video)
  endMs?: number;       // Mốc kết thúc tính theo mili-giây (cho YouTube Video)
}

/**
 * Mục từ cùng họ từ loại (Word Family)
 */
export interface IWordFamilyItem {
  word: string;
  partOfSpeech?: string; // e.g. noun, verb, adjective, adverb
  ipa?: string;
  explanation: string;
}

/**
 * Cụm từ cố định tự nhiên (Collocation)
 */
export interface ICollocationItem {
  collocation: string;
  explanation: string;
}

/**
 * Từ vựng trọng tâm được bóc tách và giải nghĩa ngữ cảnh
 */
export interface IStorybookKeyword {
  word: string;
  ipa?: string;
  audioUrl?: string;
  explanation: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  wordFamily?: IWordFamilyItem[];
  collocations?: ICollocationItem[];
}

/**
 * Thực thể bài học Storybook lưu trữ trong MongoDB (Collection: storybooks)
 */
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

/**
 * Payload gửi lên để kích hoạt Text Shadowing Pipeline
 */
export interface CreateTextShadowingRequest {
  text: string;
  voice?: string;
}

/**
 * Payload gửi lên để kích hoạt YouTube Shadowing Pipeline
 */
export interface CreateYoutubeShadowingRequest {
  youtubeUrl: string;
}

/**
 * Dữ liệu trả về trong Payload của sự kiện hoàn tất (status: "done")
 */
export interface StoryShadowingDonePayload {
  storyId: string;
  id: string;
  title?: string;
  youtubeTitle?: string;
  youtubeVideoId?: string;
  level: "easy" | "medium" | "hard";
  speakingRate: number;
  sentences: IStorybookSentence[];
  keywords: IStorybookKeyword[];
  rawText?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Sự kiện tiến trình thời gian thực nhận từ Server-Sent Events (SSE)
 */
export interface StoryShadowingProgressEvent {
  status?: "init" | "running" | "completed" | "done" | "failed";
  stepId?: "sentenceSplitter" | "ttsGenerator" | "keywordIdentifier" | "keywordEnricher" | "youtubeFetcher" | "youtubeConsolidator" | string;
  progress?: number;
  message?: string;
  payload?: StoryShadowingDonePayload;
  error?: string;
}
```

---

## 4. Hướng dẫn Tích hợp Phía Client (Client Integration Guide & SDK Snippet)

Vì các endpoint pipeline sử dụng phương thức **`HTTP POST`** kết hợp với luồng Server-Sent Events (`text/event-stream`), trình duyệt chuẩn không thể sử dụng trực tiếp đối tượng `new EventSource(url)` (vốn chỉ hỗ trợ `GET`).

Phía `aha-tools` sử dụng hàm SDK mẫu sau (sử dụng Native `fetch` kết hợp `ReadableStream`) để gọi API và cập nhật thanh tiến trình:

```typescript
/**
 * @file story-shadowing-client.ts
 * @description Client SDK tích hợp aha-mind-agents cho ứng dụng aha-tools
 * 
 * Made by Anh Tu - Share to be share
 */

import {
  CreateTextShadowingRequest,
  CreateYoutubeShadowingRequest,
  StoryShadowingProgressEvent,
  StoryShadowingDonePayload,
} from '@/lib/types/story-shadowing';

const AGENTS_BASE_URL = process.env.NEXT_PUBLIC_AGENTS_API_URL || 'http://localhost:3001/api';

export type ProgressCallback = (progress: number, message: string, stepId?: string) => void;

/**
 * Đọc luồng SSE từ HTTP POST Request Stream
 */
async function streamAgentPipeline(
  endpointUrl: string,
  requestPayload: unknown,
  onProgress?: ProgressCallback
): Promise<StoryShadowingDonePayload> {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Khởi tạo Pipeline thất bại (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      errorMessage = errJson.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('Máy chủ không trả về luồng dữ liệu (ReadableStream is empty)');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise<StoryShadowingDonePayload>((resolve, reject) => {
    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Giữ lại mẩu chunk chưa trọn vẹn trong buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, '');
            if (!jsonStr) continue;

            try {
              const event: StoryShadowingProgressEvent = JSON.parse(jsonStr);

              // Cập nhật thanh tiến trình lên giao diện
              if (event.progress !== undefined && event.message) {
                onProgress?.(event.progress, event.message, event.stepId);
              }

              // Xử lý sự kiện hoàn tất (status: done)
              if (event.status === 'done' && event.payload) {
                reader.cancel();
                resolve(event.payload);
                return;
              }

              // Xử lý sự kiện lỗi từ Pipeline
              if (event.status === 'failed') {
                reader.cancel();
                reject(new Error(event.message || 'Lỗi không xác định trong quá trình thực thi Pipeline'));
                return;
              }
            } catch (parseErr) {
              console.warn('[SSE Parse Warning] Bỏ qua chunk không hợp lệ:', jsonStr);
            }
          }
        }

        reject(new Error('Luồng SSE đã đóng trước khi nhận được sự kiện hoàn tất (status: done)'));
      } catch (err) {
        reject(err);
      }
    }

    processStream();
  });
}

/**
 * 1. Khởi chạy Text Shadowing Pipeline
 */
export async function createTextShadowingLesson(
  request: CreateTextShadowingRequest,
  onProgress?: ProgressCallback
): Promise<StoryShadowingDonePayload> {
  return streamAgentPipeline(
    `${AGENTS_BASE_URL}/v1/agents/story-shadowing/text/stream`,
    request,
    onProgress
  );
}

/**
 * 2. Khởi chạy YouTube Shadowing Pipeline
 */
export async function createYoutubeShadowingLesson(
  request: CreateYoutubeShadowingRequest,
  onProgress?: ProgressCallback
): Promise<StoryShadowingDonePayload> {
  return streamAgentPipeline(
    `${AGENTS_BASE_URL}/v1/agents/story-shadowing/youtube/stream`,
    request,
    onProgress
  );
}
```

---

## 5. Bảng Mã Lỗi Thường Gặp (Error Handling Matrix)

| HTTP Code | Error Scenario | Nguyên nhân | Hướng xử lý cho Client (`aha-tools`) |
| :---: | :--- | :--- | :--- |
| **`400`** | `Bad Request` | Dữ liệu đầu vào sai validation Zod/DTO: đoạn văn bản `< 10` hoặc `> 10,000` ký tự; hoặc `youtubeUrl` không đúng định dạng URL. | Hiển thị thông báo validation chi tiết ngay trên form nhập liệu trước khi bấm gửi. |
| **`404`** | `Plugin Not Found` | Truy vấn sai tên `pluginId` hoặc tên `pipeline` trên URL Gateway. | Đảm bảo URL chính xác: `/v1/agents/story-shadowing/{text\|youtube}/stream`. |
| **`422`** | `Unprocessable Entity` | Video YouTube bị tắt tính năng phụ đề (No Closed Captions / Subtitles disabled) hoặc là video riêng tư / giới hạn độ tuổi. | Hiển thị Toast thông báo: *"Video YouTube này không có phụ đề khả dụng. Vui lòng chọn video khác có phụ đề tiếng Anh."* |
| **`429`** | `Too Many Requests` | Vượt ngưỡng giới hạn gọi API (Rate Limit Quota) của Google Gemini hoặc Google Cloud TTS. | Phía client hiển thị trạng thái chờ. Máy chủ tự động điều tiết bằng hàng đợi backoff; nếu lỗi vẫn tiếp diễn, thông báo người dùng thử lại sau 1 phút. |
| **`500`** | `Internal Server Error` | Lỗi phân tích cú pháp JSON từ LLM, lỗi ngắt kết nối mạng với YouTube API, hoặc lỗi gián đoạn CSDL MongoDB. | Hiển thị nút *"Thử lại"* (Retry), log `jobId` gửi về hệ thống giám sát. |

---

*Made by Anh Tu - Share to be share*

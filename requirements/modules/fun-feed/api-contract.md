# Module Fun Feed — API Contract & Data Schemas

> **Tài liệu cha:** [Module Spec](spec.md) | [Requirement Analysis Package](../../README.md)  
> **Mã Module:** `FEED` | **Phạm vi:** Backend HTTP REST Endpoints & Data Schemas  
> **Tài liệu liên kết:** [Acceptance Criteria](acceptance-criteria.md) | [Hợp đồng tích hợp Frontend](../../../docs/contracts/fun-feed-api-contract.md)  
> **Tác giả:** Anh Tú — Giảng viên CNTT & Technical Writer

---

## 1. Danh Sách Endpoints Kỹ Thuật (Endpoints Specification)

### 1.1 `GET /api/funny-feed`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-FEED-01`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-01`](spec.md#us-feed-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-FEED-01`](acceptance-criteria.md#ac-feed-01)

* **Mục đích:** Cung cấp danh sách các meme, ảnh GIF hoặc video ngắn YouTube đã được AI phân tích, phục vụ trải nghiệm lướt bảng tin kiểu TikTok trên giao diện client.
* **Cơ chế phân trang:** **Cursor-based Pagination** dựa trên mốc thời gian xuất bản (`publishedAt`) để ngăn chặn việc trôi dòng dữ liệu và tối ưu tốc độ truy vấn $O(1)$.
* **Query Parameters:**
  | Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
  |---|---|---|---|---|
  | `topic` | `string` | Không | `undefined` | Lọc theo chủ đề: `grammar`, `vocabulary`, `pronunciation`, `idiom`, `conversation`. |
  | `level` | `string` | Không | `undefined` | Lọc theo trình độ: `beginner`, `intermediate`, `advanced`. |
  | `cursor` | `string` | Không | `undefined` | ISO Date String của `publishedAt` thuộc item cuối cùng trang trước. |
  | `limit` | `number` | Không | `10` | Số lượng items tối đa trên một trang (kẹp từ 1 đến 20). |

* **Success Response (HTTP 200 OK):**
  ```json
  {
    "items": [
      {
        "_id": "670e3f1a2b3c4d5e6f7a8b9c",
        "source": "giphy",
        "sourceId": "1n6H2AaiflqojnojU3",
        "sourceUrl": "https://giphy.com/gifs/alo7english-1n6H2AaiflqojnojU3",
        "type": "gif",
        "title": "English Grammar Teacher Reaction",
        "mediaUrl": "https://media2.giphy.com/media/1n6H2AaiflqojnojU3/giphy.gif",
        "thumbnailUrl": "https://media2.giphy.com/media/1n6H2AaiflqojnojU3/100.gif",
        "attribution": "alo7english",
        "topic": "grammar",
        "level": "beginner",
        "whyFunny": "Biểu cảm bất lực hài hước của giáo viên khi học sinh nhầm lẫn thì hiện tại hoàn thành và quá khứ đơn.",
        "youLearned": "Phân biệt rõ cách dùng thì Past Simple (hành động đã chấm dứt) và Present Perfect (còn liên hệ đến hiện tại).",
        "learningScore": 0.85,
        "stats": {
          "views": 420,
          "likes": 56,
          "saves": 12,
          "reports": 0
        },
        "status": "published",
        "publishedAt": "2026-10-16T08:30:00.000Z"
      }
    ],
    "nextCursor": "2026-10-16T08:30:00.000Z",
    "hasMore": true
  }
  ```

---

### 1.2 `POST /api/funny-feed/:id/interact`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-FEED-02`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-01`](spec.md#us-feed-01)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-FEED-02`](acceptance-criteria.md#ac-feed-02)

* **Mục đích:** Ghi nhận hành vi tương tác của người dùng (like, save, skip, report) và kích hoạt cơ chế tự ẩn nội dung độc hại.
* **URL Parameters:** `id` (Mã định danh MongoDB `_id` của nội dung).
* **Request Headers:**
  - `Content-Type: application/json`
  - `x-user-id` *(Tùy chọn)*: ID của học viên. Nếu không truyền, hệ thống gán nhãn `anonymous`.
* **Request Body:**
  ```json
  {
    "action": "like",
    "reportReason": "Nội dung phản cảm (chỉ bắt buộc khi action là report)"
  }
  ```
  *Bảng giá trị của `action`:*
  | Giá trị | Mô tả nghiệp vụ |
  |---|---|
  | `like` | Tăng chỉ số `stats.likes` lên 1 đơn vị. |
  | `save` | Ghi nhận lưu thẻ vào bộ sưu tập cá nhân. |
  | `skip` | Ghi nhận người dùng lướt qua nhanh mà không xem hết. |
  | `report` | Tăng `stats.reports`. Nếu tổng số report $\ge 3$, tự động cập nhật `status = 'hidden'`. |

* **Success Response (HTTP 201 Created):**
  ```json
  {
    "success": true
  }
  ```

---

### 1.3 `GET /api/funny-feed/cron-ingest`
- **Ánh xạ Yêu cầu Nghiệp vụ:** [`FR-FEED-03`](spec.md#2-yeu-cau-chuc-nang)
- **Ánh xạ User Story:** [`US-FEED-02`](spec.md#us-feed-02)
- **Ánh xạ Tiêu chí Chấp nhận:** [`AC-FEED-03`](acceptance-criteria.md#ac-feed-03)

* **Mục đích:** Endpoint nhận lệnh định kỳ từ **Vercel Cron** để cào dữ liệu mới từ GIPHY/YouTube, lọc an toàn qua AI và xuất bản tự động.
* **Request Headers:**
  - `Authorization: Bearer <CRON_SECRET>` *(Bắt buộc nếu đã cấu hình biến môi trường `CRON_SECRET`)*.
* **Query Parameters:**
  | Tham số | Kiểu | Bắt buộc | Mô tả |
  |---|---|---|---|
  | `keyword` | `string` | Không | Từ khóa tùy chọn (nếu không truyền, hệ thống tự bốc ngẫu nhiên từ pool). |
  | `limit` | `number` | Không | Số lượng items tối đa cần cào trong 1 lượt (mặc định 4). |

* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "processedKeywords": 1,
    "keyword": "past tense",
    "topic": "grammar",
    "stats": {
      "fetched": 4,
      "deduped": 1,
      "saved": 3
    }
  }
  ```
* **Error Response (HTTP 401 Unauthorized):**
  Trả về khi `CRON_SECRET` được thiết lập nhưng request không gửi token hoặc gửi sai token:
  ```json
  {
    "message": "Invalid cron authorization token",
    "error": "Unauthorized",
    "statusCode": 401
  }
  ```

---

## 2. Mô Hình Dữ Liệu Chi Tiết (Data Schemas)

### 2.1 Collection `aha_media_contents`
```typescript
interface AhaMediaContent {
  _id: string;
  source: 'giphy' | 'youtube' | 'generated';
  sourceId: string;                     // ID gốc từ nền tảng GIPHY/YouTube
  sourceUrl: string;                    // Link gốc (bắt buộc theo điều khoản Attribution)
  type: 'gif' | 'image' | 'video' | 'short_video';
  title: string;
  mediaUrl: string;                     // URL file .gif từ GIPHY CDN hoặc link embed YouTube
  thumbnailUrl?: string;
  attribution?: string;                 // Tên channel hoặc creator gốc
  topic?: 'grammar' | 'vocabulary' | 'pronunciation' | 'idiom' | 'conversation';
  level?: 'beginner' | 'intermediate' | 'advanced';
  whyFunny?: string;                    // AI giải thích lý do hài hước
  youLearned?: string;                  // AI đúc kết điểm kiến thức ngữ pháp/từ vựng
  explanation?: string;
  learningScore?: number;               // Thang điểm chất lượng học tập (0.0 - 1.0)
  stats: {
    views: number;
    likes: number;
    saves: number;
    reports: number;
  };
  status: 'pending' | 'published' | 'rejected' | 'hidden';
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```
**Database Indexes:**
* Compound Index: `{ status: 1, topic: 1, publishedAt: -1 }` (Phục vụ lướt Feed siêu tốc).
* Unique Index: `{ source: 1, sourceId: 1 }` (Ngăn chặn trùng lặp nội dung khi cào).

---

*Made by Anh Tu - Share to be share*

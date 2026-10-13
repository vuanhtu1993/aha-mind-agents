# Adaptive Speaking Scaffold & Natural Lexical Flow — System Design

> **Document Version:** 1.0.0  
> **Date:** 2026-10-13  
> **Status:** Draft / Ready for Review  
> **Author:** Anh Tú (IT Lecturer & Technical Writer)  
> **Module:** `speaking-quiz` & `vocab-review` Integration  
> **Target System:** `aha-mind-agents` (NestJS) ⟷ `aha-tools` (Next.js)

---

## 1. Bối Cảnh & Phân Tích Nguyên Nhân Gốc Rễ (Context & Root Cause)

### 1.1. Hiện Trạng & Vấn Đề Thực Tế
Trong phiên bản trước, hệ thống triển khai cơ chế "Bơm từ vựng FSRS" (`getCandidateDueVocab`) từ kho thẻ từ vào Node `context-resolver`, sau đó ép buộc Node `prep-synthesizer` phải đưa ít nhất 2 từ này vào câu trả lời mẫu theo khung giàn giáo cố định **PREP** (Point - Reason - Example - Conclusion).

Thực tế kiểm thử và vận hành sư phạm chỉ ra 3 điểm nghẽn nghiêm trọng:
1. **Sự gò bó của khung cố định PREP:** Không phải câu hỏi nào cũng là câu hỏi tranh biện ý kiến (Debate/Opinion). Các câu hỏi về lời khuyên (*Giving Advice*), chia sẻ kinh nghiệm (*Storytelling*), đàm phán (*Negotiation*) bị ép vào PREP khiến câu trả lời trở nên máy móc, thiếu tự nhiên.
2. **Thiếu vắng cụm từ tự nhiên (Collocations / Idioms):** Người học nói tiếng Anh không thể đạt độ trôi chảy nếu chỉ ghép các từ đơn lẻ (*isolated words*). Họ cần các ngữ đoạn (*Lexical Chunks*), cụm kết hợp từ (*Collocations*) và thành ngữ (*Idioms*) đặc trưng cho chủ đề.
3. **Hiện tượng đứt gãy ngữ dụng do ép từ FSRS (Pragmatic Incoherence):** Việc lấy các từ vựng đến hạn ngẫu nhiên từ kho thẻ cá nhân (ví dụ: *photosynthesis*, *liquidity*) rồi ép vào một đề bài nói về *Work-life balance* khiến câu trả lời mẫu gượng ép, người học không thể "thoát ý" và mất đi tính chân thực của ngữ cảnh.

### 1.2. Triết Lý Thiết Kế Mới: Hấp Thu Từ Vựng Thuận Tự Nhiên (Organic Lexical Flow)
Thay vì dòng chảy gượng ép:
$$\text{Từ vựng FSRS ngẫu nhiên} \xrightarrow{\text{ép buộc}} \text{Bài luyện nói Speaking}$$

Hệ thống chuyển đổi sang **Dòng chảy thuận tự nhiên (Organic Flow)**:
$$\text{Chủ đề / Bài đọc} \xrightarrow{\text{sinh tự nhiên}} \begin{cases} \text{Khung giàn giáo thích ứng (PREP / PAR / STAR / CCR)} \\ \text{Cụm từ đắt giá (Collocations, Idioms bản địa)} \end{cases} \xrightarrow{\text{người học tiếp thu}} \text{Lưu vào Sổ từ vựng FSRS để ôn tập về sau}$$

```mermaid
graph TD
    subgraph Flow_Cu ["❌ Dòng Chảy Cũ (Gượng Ép / Bó Buộc)"]
        OldDB[("vocab_cards")] -->|"Ép lấy 3 từ đến hạn"| OldInject["Context Resolver"]
        OldInject -->|"Ép nhét từ vào PREP"| OldPrep["Prep Synthesizer"]
        OldPrep --> OldResult["Câu mẫu gượng gạo, khó thoát ý"]
    end

    subgraph Flow_Moi ["✨ Dòng Chảy Mới (Thuận Sư Phạm / Tự Nhiên)"]
        Topic["Bài đọc Storybook / Chủ đề"] --> QuestionNode["Question Formulator<br/>(Đa dạng loại câu hỏi)"]
        QuestionNode --> ScaffoldNode["Scaffold Synthesizer<br/>(Adaptive Frameworks)"]
        
        ScaffoldNode --> F1["Khung phù hợp:<br/>• PREP (Opinion)<br/>• PAR (Advice/Suggestion)<br/>• STAR (Experience)<br/>• CCR (Negotiation)"]
        ScaffoldNode --> F2["Linguistic Toolkit:<br/>• Collocations theo chủ đề<br/>• Signposts ngữ dụng<br/>• Model Answers mượt mà"]
        
        F2 --> Learner["Người học thực hành nói"]
        Learner -->|"+ Lưu từ hay vào sổ"| NewDB[("vocab_cards (FSRS)") ]
        NewDB --> Review["Ôn tập giãn cách về sau (vocab-review)"]
    end
```

---

## 2. Kiến Trúc Chi Tiết Của Các Framework Thích Ứng (Adaptive Frameworks)

Hệ thống hỗ trợ 4 khung phản xạ tư duy tương ứng với 4 dạng câu hỏi cốt lõi:

| Mã Khung | Tên Đầy Đủ | Speech Act / Loại Câu Hỏi | 4 Chặng Cấu Trúc | Ví Dụ Câu Hỏi |
| :--- | :--- | :--- | :--- | :--- |
| **`PREP`** | Point - Reason - Example - Point | Bày tỏ quan điểm, Tranh luận (Opinion & Debate) | 1. **Point** (Lập trường)<br/>2. **Reason** (Luận cứ)<br/>3. **Example** (Dẫn chứng)<br/>4. **Point** (Khẳng định lại) | *"Do you believe remote work boosts employee productivity?"* |
| **`PAR`** | Problem - Advice - Result | Đưa ra lời khuyên, Giải pháp (Advice & Suggestion) | 1. **Problem** (Thực trạng vấn đề)<br/>2. **Advice** (Gợi ý/Giải pháp cốt lõi)<br/>3. **Alternative** (Phương án bổ sung)<br/>4. **Result** (Hệ quả/Lợi ích kỳ vọng) | *"What should a manager do when team members experience burnout?"* |
| **`STAR`** | Situation - Task - Action - Result | Kể chuyện, Chia sẻ kinh nghiệm (Narrative / Experience) | 1. **Situation** (Bối cảnh/Tình huống)<br/>2. **Task** (Nhiệm vụ/Thách thức)<br/>3. **Action** (Hành động giải quyết)<br/>4. **Result** (Bài học/Kết quả) | *"Can you share an experience where you had to adapt to a sudden change?"* |
| **`CCR`** | Concession - Counter - Resolution | Đàm phán, Thỏa hiệp, Đánh đổi (Diplomacy & Trade-offs) | 1. **Concession** (Thừa nhận góc nhìn đối phương)<br/>2. **Counter** (Phản biện/Lập luận đảo chiều)<br/>3. **Condition** (Điều kiện cần thiết)<br/>4. **Resolution** (Giải pháp dung hòa/Win-win) | *"How would you respond if a client demands an unrealistic deadline?"* |

---

## 3. Thiết Kế Schemas & Dữ Liệu Trao Đổi (Data Contracts)

### 3.1. Zod Schema Cho Node Tổng Hợp Giàn Giáo (`ScaffoldSynthesizerOutputSchema`)
Để duy trì **100% tính tương thích ngược** với giao diện Frontend hiện hành (vốn đang đọc cấu trúc 4 chặng của `prepScaffold`), cấu trúc Output được thiết kế vừa giữ các key quen thuộc, vừa bổ sung linh hồn thích ứng:

```typescript
export const FrameworkTypeSchema = z.enum(['PREP', 'PAR', 'STAR', 'CCR']);

export const ScaffoldStageSchema = z.object({
  stageKey: z.string().describe('Key định danh chặng (ví dụ: point, problem, situation, concession)'),
  title: z.string().describe('Tiêu đề hiển thị của chặng'),
  signposts: z.array(z.string()).min(2).describe('Các liên từ hoặc cụm từ dẫn dắt câu'),
  hint: z.string().describe('Gợi ý sư phạm tiếng Việt cho người học'),
  modelAnswer: z.string().describe('Câu mẫu mượt mà chứa collocations tự nhiên'),
});

export const TopicCollocationSchema = z.object({
  phrase: z.string().describe('Cụm kết hợp từ hoặc thành ngữ tự nhiên (Collocation/Idiom)'),
  meaning: z.string().describe('Ý nghĩa tiếng Việt trong ngữ cảnh'),
  ipa: z.string().optional().describe('Phiên âm IPA chuẩn'),
});

export const AdaptiveScaffoldOutputSchema = z.object({
  frameworkType: FrameworkTypeSchema,
  frameworkName: z.string().describe('Tên đầy đủ của khung (ví dụ: PAR - Problem, Advice, Result)'),
  frameworkDescription: z.string().describe('Mô tả mục đích của khung nói này'),
  topicCollocations: z.array(TopicCollocationSchema).min(2).max(4).describe('2-4 cụm từ/thành ngữ đắt giá'),
  
  // 4 chặng linh hoạt theo framework
  stages: z.object({
    stage1: ScaffoldStageSchema,
    stage2: ScaffoldStageSchema,
    stage3: ScaffoldStageSchema,
    stage4: ScaffoldStageSchema,
  }),
});
```

### 3.2. Cầu Nối Tương Thích Ngược (Backward Compatibility Bridge)
Phía Backend Persister và API response sẽ hỗ trợ cả hai:
1. `prepScaffold`: Ánh xạ `stage1` $\rightarrow$ `point`, `stage2` $\rightarrow$ `reason`, `stage3` $\rightarrow$ `example`, `stage4` $\rightarrow$ `conclusion` (giúp code UI cũ của Next.js tiếp tục chạy êm ru).
2. `scaffoldMetadata`: Chứa `frameworkType`, `frameworkName`, `topicCollocations` để giao diện mới hiển thị badge phong phú.

---

## 4. Dòng Chảy Lưu Trữ & Kích Hoạt FSRS (Vocab Ingestion Flow)

1. Khi sinh đề bài:
   - Các từ khóa (`targetKeywords`) và cụm từ (`topicCollocations`) đều được gắn trạng thái mặc định:
     `srsStatus = 'unsaved'`, `isInjected = false`.
2. Khi người học tương tác trên giao diện Next.js:
   - Nút **`+ Lưu`** (In-situ Quick Save) cho phép người học lưu bất kỳ từ vựng hoặc cụm collocation nào vào collection `vocab_cards`.
   - API `POST /api/vocab` sẽ khởi tạo thẻ từ vựng với cấu hình FSRS ban đầu (`due = now`, `state = 0 (New)`, `reps = 0`).
   - Ngay lập tức, từ này được đưa vào chu trình Spaced Repetition của module `vocab-review` để người học ôn tập trắc nghiệm và cloze test ở các phiên học tiếp theo.

---

*Made by Anh Tu - Share to be share*

# Adaptive Speaking Scaffold & Natural Lexical Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi giàn giáo luyện nói Speaking Quiz từ mô hình cố định (Fixed PREP + Ép từ FSRS) sang mô hình Thích ứng Linh hoạt (Adaptive Framework: PREP / PAR / STAR / CCR + Native Collocations Toolkit) và đảo ngược dòng chảy từ vựng: sinh từ tự nhiên trong bài nói $\rightarrow$ người học lưu vào sổ từ vựng FSRS để ôn tập về sau.

**Architecture:** Nâng cấp Node 2 (`question-formulator`) sinh đa dạng dạng câu hỏi, nâng cấp Node 3 (`prep-synthesizer`) tự động chọn Framework lập luận phù hợp (PREP, PAR, STAR, CCR) kèm bộ cụm từ tự nhiên (`topicCollocations`). Gỡ bỏ việc bơm từ vựng FSRS ngoài luồng trong Node 1 (`context-resolver`), giữ vững 100% tính tương thích ngược cho giao diện Next.js (`aha-tools`).

**Tech Stack:** NestJS 11, LangGraph.js, Zod, Mongoose, Google Gemini 2.5 / Hive LLM, Jest.

---

### File Structure Map

| File Path | Trách Nhiệm / Thay Đổi Chính |
| :--- | :--- |
| `src/plugins/speaking-quiz/speaking-quiz.schema.ts` | Khai báo Zod schemas cho `AdaptiveScaffoldOutputSchema`, `FrameworkType`, `TopicCollocation` |
| `src/plugins/speaking-quiz/speaking-quiz.state.ts` | Mở rộng LangGraph State với `adaptiveScaffold` và cấu trúc linh hoạt |
| `src/plugins/speaking-quiz/nodes/context-resolver.node.ts` | Gỡ bỏ FSRS injection; chỉ trích xuất từ khóa bản địa từ Storybook/Topic |
| `src/plugins/speaking-quiz/nodes/question-formulator.node.ts` | Đa dạng hóa câu hỏi kích thích tư duy (Debate, Suggestion, Experience, Negotiation) |
| `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts` | Prompt tự động chọn Framework (PREP, PAR, STAR, CCR) + sinh Collocations & ánh xạ tương thích |
| `src/infra/database/schemas/speaking-question.schema.ts` | Mở rộng Mongoose schema lưu trữ `adaptiveScaffold` |
| `src/plugins/speaking-quiz/nodes/persister.node.ts` | Lưu `adaptiveScaffold` và `prepScaffold` đồng thời |
| `docs/contracts/speaking-quiz-api-contract.md` | Cập nhật API contract phiên bản 1.3.0 |

---

## Tasks

### Task 1: Thiết Kế Schemas & LangGraph State Mới

**Files:**
- Modify: `src/plugins/speaking-quiz/speaking-quiz.schema.ts`
- Modify: `src/plugins/speaking-quiz/speaking-quiz.state.ts`
- Test: `src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`

- [ ] **Step 1: Viết test kiểm định Schema mới**
  Cập nhật `speaking-quiz.schema.spec.ts` kiểm tra:
  * `AdaptiveScaffoldOutputSchema` xác thực hợp lệ các framework `PREP`, `PAR`, `STAR`, `CCR`.
  * Yêu cầu tối thiểu 2 `topicCollocations`.
  * Hàm tiện ích chuyển đổi `toLegacyPrepScaffold` trả về đúng 4 key `point`, `reason`, `example`, `conclusion`.

- [ ] **Step 2: Chạy test để xác nhận test FAIL**
  Run: `pnpm test src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`

- [ ] **Step 3: Triển khai Schemas trong `speaking-quiz.schema.ts` & State trong `speaking-quiz.state.ts`**
  Thêm `FrameworkTypeSchema`, `TopicCollocationSchema`, `AdaptiveScaffoldOutputSchema`, và hàm ánh xạ `toLegacyPrepScaffold`. Cập nhật `speaking-quiz.state.ts` thêm annotation `adaptiveScaffold`.

- [ ] **Step 4: Chạy lại test để xác nhận PASS**
  Run: `pnpm test src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`

- [ ] **Step 5: Commit Task 1**
  ```bash
  git add src/plugins/speaking-quiz/speaking-quiz.schema.ts src/plugins/speaking-quiz/speaking-quiz.state.ts src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts
  git commit -m "feat(speaking-quiz): define adaptive scaffold schemas and langgraph state"
  ```

---

### Task 2: Gỡ Bỏ Ép Bơm FSRS Khỏi `ContextResolverNode`

**Files:**
- Modify: `src/plugins/speaking-quiz/nodes/context-resolver.node.ts`
- Test: `src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`

- [ ] **Step 1: Cập nhật unit test `context-resolver.node.spec.ts`**
  Sửa test để kiểm tra:
  * Node trích xuất từ vựng bản địa của Storybook (hoặc Heuristic keywords) làm `targetKeywords`.
  * Các từ khóa mặc định có `srsStatus: 'unsaved'` và `isInjected: false`.
  * Không phụ thuộc bắt buộc vào `VocabReviewService`.

- [ ] **Step 2: Chạy test để thấy FAIL do thay đổi kỳ vọng**
  Run: `pnpm test src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`

- [ ] **Step 3: Tinh chỉnh `ContextResolverNode`**
  Loại bỏ bước gọi `getCandidateDueVocab({ limit: 3 })`. Giữ lại phân giải Storybook keywords và Custom topic keywords nguyên bản, tự nhiên.

- [ ] **Step 4: Chạy lại test xác nhận PASS**
  Run: `pnpm test src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`

- [ ] **Step 5: Commit Task 2**
  ```bash
  git add src/plugins/speaking-quiz/nodes/context-resolver.node.ts src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts
  git commit -m "refactor(speaking-quiz): decouple forced fsrs vocab injection from context resolver"
  ```

---

### Task 3: Đa Dạng Hóa Câu Hỏi Tại `QuestionFormulatorNode`

**Files:**
- Modify: `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`
- Test: `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`

- [ ] **Step 1: Cập nhật test `question-formulator.node.spec.ts`**
  Kiểm tra câu hỏi sinh ra vẫn đảm bảo < 20 từ, nhưng cho phép nhiều thể loại câu hỏi (Debate, Suggestion, Narrative).

- [ ] **Step 2: Cập nhật SYSTEM_PROMPT trong `question-formulator.node.ts`**
  Bổ sung chỉ dẫn cho LLM: Tùy thuộc ngữ cảnh của bài đọc, có thể tạo:
  * Câu hỏi quan điểm/tranh luận (*Debate/Opinion*).
  * Câu hỏi giải quyết vấn đề/lời khuyên (*Problem-solving/Advice*).
  * Câu hỏi tình huống/kinh nghiệm (*Situational/Experience*).

- [ ] **Step 3: Chạy test xác nhận PASS**
  Run: `pnpm test src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`

- [ ] **Step 4: Commit Task 3**
  ```bash
  git add src/plugins/speaking-quiz/nodes/question-formulator.node.ts src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts
  git commit -m "feat(speaking-quiz): diversify speech question intents in formulator node"
  ```

---

### Task 4: Nâng Cấp `PrepSynthesizerNode` Thành Adaptive Scaffold Synthesizer

**Files:**
- Modify: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`
- Test: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`

- [ ] **Step 1: Viết test cho `prep-synthesizer.node.spec.ts`**
  Kiểm tra:
  * Node gọi LLM với `AdaptiveScaffoldOutputSchema`.
  * Kết quả trả về chứa `adaptiveScaffold` có `frameworkType` (`PREP` / `PAR` / `STAR` / `CCR`).
  * Trả về cả `prepScaffold` (được ánh xạ qua `toLegacyPrepScaffold`) để tương thích ngược 100%.

- [ ] **Step 2: Chạy test để thấy FAIL**
  Run: `pnpm test src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`

- [ ] **Step 3: Viết lại System Prompt và logic trong `PrepSynthesizerNode`**
  * Hướng dẫn LLM phân tích câu hỏi và chọn 1 trong 4 Framework phù hợp (`PREP`, `PAR`, `STAR`, `CCR`).
  * Trích xuất 2-4 `topicCollocations` bản địa của chủ đề.
  * Sinh 4 chặng với `title`, `signposts` đặc trưng cho khung đó, `hint` tiếng Việt sư phạm, và `modelAnswer` lồng ghép tự nhiên các collocations.
  * Gọi hàm `toLegacyPrepScaffold` để gán cho `prepScaffold` cho code cũ không bị gãy.

- [ ] **Step 4: Chạy test xác nhận PASS**
  Run: `pnpm test src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`

- [ ] **Step 5: Commit Task 4**
  ```bash
  git add src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts
  git commit -m "feat(speaking-quiz): implement adaptive scaffolding and native collocations in synthesizer node"
  ```

---

### Task 5: Cập Nhật Mongoose Schema & `PersisterNode`

**Files:**
- Modify: `src/infra/database/schemas/speaking-question.schema.ts`
- Modify: `src/plugins/speaking-quiz/nodes/persister.node.ts`
- Test: `src/infra/database/schemas/speaking-question.schema.spec.ts`
- Test: `src/plugins/speaking-quiz/nodes/persister.node.spec.ts`

- [ ] **Step 1: Cập nhật Schema test và Persister test**
  Kiểm tra lưu trữ thành công cả `adaptiveScaffold` lẫn `prepScaffold`.

- [ ] **Step 2: Chạy test để thấy FAIL**
  Run: `pnpm test src/infra/database/schemas/speaking-question.schema.spec.ts src/plugins/speaking-quiz/nodes/persister.node.spec.ts`

- [ ] **Step 3: Cập nhật `speaking-question.schema.ts` & `persister.node.ts`**
  Thêm field `adaptiveScaffold` (optional) vào `SpeakingQuestion`. Cập nhật `PersisterNode` lấy `state.adaptiveScaffold` để lưu vào DB.

- [ ] **Step 4: Chạy lại test xác nhận PASS**
  Run: `pnpm test src/infra/database/schemas/speaking-question.schema.spec.ts src/plugins/speaking-quiz/nodes/persister.node.spec.ts`

- [ ] **Step 5: Commit Task 5**
  ```bash
  git add src/infra/database/schemas/speaking-question.schema.ts src/plugins/speaking-quiz/nodes/persister.node.ts src/infra/database/schemas/speaking-question.schema.spec.ts src/plugins/speaking-quiz/nodes/persister.node.spec.ts
  git commit -m "feat(speaking-quiz): persist adaptive scaffold metadata alongside legacy prep scaffold"
  ```

---

### Task 6: Kiểm Thử Toàn Diện & Build Validation

**Files:** Toàn bộ codebase

- [ ] **Step 1: Chạy toàn bộ Test Suites**
  Run: `pnpm test`
  Expected: Toàn bộ 27 test suites (86+ tests) đều PASS.

- [ ] **Step 2: Chạy NestJS Build**
  Run: `pnpm build`
  Expected: Build thành công không có lỗi TypeScript.

---

### Task 7: Cập Nhật Tài Liệu API Contract & Governance

**Files:**
- Modify: `docs/contracts/speaking-quiz-api-contract.md`
- Modify: `requirements/modules/speaking-quiz/spec.md`
- Modify: `requirements/modules/speaking-quiz/api-contract.md`
- Modify: `requirements/governance/change-log.md`

- [ ] **Step 1: Cập nhật contract và spec phản ánh Adaptive Frameworks & Collocations Toolkit**
- [ ] **Step 2: Commit Task 7**
  ```bash
  git add docs/contracts/speaking-quiz-api-contract.md requirements/
  git commit -m "docs: update speaking-quiz api contract and requirements for adaptive frameworks (v1.3.0)"
  ```

---

*Made by Anh Tu - Share to be share*

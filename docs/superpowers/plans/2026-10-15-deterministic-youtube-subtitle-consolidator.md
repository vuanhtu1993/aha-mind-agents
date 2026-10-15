# Deterministic YouTube Subtitle Consolidator & Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi logic gộp phụ đề YouTube từ mô hình LLM suy luận mốc thời gian không ổn định (gây lỗi cộng đúp offset và nhảy cóc thời gian) sang thuật toán gióng hàng ký tự tất định (*Deterministic Character-to-Block Monotonic Interval Alignment*) kết hợp `Intl.Segmenter` native của V8.

**Architecture:** Tách biệt hoàn toàn hai trách nhiệm (Separation of Concerns):
1. **Thuật toán tất định (Deterministic Logic):** Gom câu tiếng Anh theo ngữ pháp chuẩn (Unicode TR29) và khóa cứng mốc thời gian `startMs`, `endMs` trực tiếp từ các caption block nguồn với độ phức tạp $O(N)$ trong $\sim 2\text{ms}$.
2. **Trí tuệ nhân tạo (AI Level Classification):** LLM (Hive Service) chỉ tiếp nhận một mẫu văn bản thuần ngắn gọn để phân loại độ khó (`easy` / `medium` / `hard`) với chi phí $\approx 50$ tokens thay vì hàng nghìn reasoning tokens.
3. **Phiên âm ngữ âm:** Kế thừa bộ chuyển đổi IPA cục bộ `PhoneticService` (CMUdict).

**Tech Stack:** Node.js Native `Intl.Segmenter`, NestJS, TypeScript, Jest, HiveService (Lightweight Classification), PhoneticService.

---

## File Structure & Responsibilities

| File Path | Action | Trách nhiệm chính (Single Responsibility) |
| :--- | :--- | :--- |
| `src/plugins/story-shadowing/utils/subtitle-aligner.util.ts` | **Create** | Hàm thuần túy (*Pure Utility Function*) thực hiện ánh xạ mảng Caption Block $\to$ Full Text $\to$ `Intl.Segmenter` $\to$ Căn chỉnh `startMs`, `endMs` $\to$ Nội suy nhiều câu/block. |
| `src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts` | **Create** | Unit test kiểm thử toàn diện các ca biên: câu vắt qua 2 block, 1 block chứa nhiều câu, và ca thực tế của video `qHWtJtRSYjc`. |
| `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts` | **Modify** | Node điều phối: gọi `SubtitleAlignerUtil`, gọi Hive để phân loại độ khó `level`, gọi `PhoneticService` để phiên âm IPA. |
| `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts` | **Modify** | Cập nhật bộ unit test của Node đảm bảo tương thích ngược State và mock đúng hành vi mới. |

---

## Tasks

### Task 1: Xây dựng `SubtitleAlignerUtil` và Unit Tests

**Files:**
- Create: `src/plugins/story-shadowing/utils/subtitle-aligner.util.ts`
- Test: `src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts`

- [ ] **Step 1: Viết Failing Unit Test cho `SubtitleAlignerUtil`**

Tạo file `src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts` với các ca kiểm thử:
1. Gộp các block ngắt quãng giữa câu thành câu hoàn chỉnh và tính đúng `startMs`, `endMs`.
2. Nội suy thời gian chính xác khi một block chứa nhiều câu ngắn.
3. Kiểm tra tính liên tục (không nhảy cóc thời gian) giữa các câu kế tiếp.

```typescript
import { SubtitleAlignerUtil, RawCaptionBlock } from './subtitle-aligner.util';

describe('SubtitleAlignerUtil', () => {
  it('should merge multi-block broken sentences with accurate timestamps', () => {
    const blocks: RawCaptionBlock[] = [
      { text: 'Hello and welcome to Real', offset: 1000, duration: 2000 },
      { text: 'Easy English.', offset: 3000, duration: 1500 },
    ];

    const result = SubtitleAlignerUtil.align(blocks);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello and welcome to Real Easy English.');
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(4500); // 3000 + 1500
  });

  it('should interpolate timestamps when one block contains multiple sentences', () => {
    const blocks: RawCaptionBlock[] = [
      { text: '20 years. More than 20 years.', offset: 122480, duration: 2000 },
    ];

    const result = SubtitleAlignerUtil.align(blocks);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('20 years.');
    expect(result[1].text).toBe('More than 20 years.');
    expect(result[0].startMs).toBe(122480);
    expect(result[0].endMs).toBeLessThanOrEqual(result[1].startMs);
    expect(result[1].endMs).toBe(124480);
  });

  it('should maintain monotonic continuity across sentence boundaries (No Leap)', () => {
    const blocks: RawCaptionBlock[] = [
      { text: '20 years. More than 20 years.', offset: 122480, duration: 2000 },
      { text: 'Oh, wow! OK, so when you were a student', offset: 124480, duration: 5760 },
      { text: 'and you had jobs, that was quite a long time ago.', offset: 130240, duration: 2400 },
    ];

    const result = SubtitleAlignerUtil.align(blocks);

    // Tìm câu "that was quite a long time ago."
    const lastSentence = result.find(s => s.text.includes('quite a long time ago'));
    expect(lastSentence).toBeDefined();
    // startMs PHẢI là 124480 (bắt đầu từ block tiếp theo), TUYỆT ĐỐI không bị cộng đúp thành 248960
    expect(lastSentence!.startMs).toBe(124480);
    expect(lastSentence!.endMs).toBe(132640); // 130240 + 2400
  });

  it('should return empty array when blocks are empty', () => {
    expect(SubtitleAlignerUtil.align([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test FAIL (Do file util chưa tồn tại)**

Chạy lệnh:
```bash
npm test -- src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts
```
Kỳ vọng: FAIL với lỗi `Cannot find module './subtitle-aligner.util'`.

- [ ] **Step 3: Hiện thực mã nguồn `SubtitleAlignerUtil`**

Tạo file `src/plugins/story-shadowing/utils/subtitle-aligner.util.ts`:

```typescript
/**
 * @file subtitle-aligner.util.ts
 * @description Thuật toán căn chỉnh và gióng hàng phụ đề sang câu hoàn chỉnh tất định (Deterministic)
 *
 * Made by Anh Tu - Share to be share
 */

export interface RawCaptionBlock {
  text: string;
  offset: number;
  duration: number;
}

export interface AlignedSentence {
  id: number;
  text: string;
  startMs: number;
  endMs: number;
}

export class SubtitleAlignerUtil {
  /**
   * Ánh xạ các caption blocks vụn thành danh sách câu hoàn chỉnh theo ngữ pháp
   * và tính toán chính xác tuyệt đối mốc thời gian startMs, endMs.
   */
  public static align(blocks: RawCaptionBlock[]): AlignedSentence[] {
    if (!blocks || blocks.length === 0) {
      return [];
    }

    // 1. Dựng chuỗi văn bản liên tục và lưu vết chỉ mục ký tự (Character-to-Block Map)
    let fullText = '';
    const charToBlockMap: number[] = [];

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const cleanText = blocks[bIdx].text.replace(/\n/g, ' ').trim();
      if (!cleanText) continue;

      if (fullText.length > 0) {
        fullText += ' ';
        charToBlockMap.push(bIdx); // Khoảng trắng thuộc về block này
      }

      for (let c = 0; c < cleanText.length; c++) {
        charToBlockMap.push(bIdx);
      }
      fullText += cleanText;
    }

    if (!fullText.trim()) {
      return [];
    }

    // 2. Sử dụng Intl.Segmenter chuẩn hóa của V8 (Unicode TR29) để tách câu
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const rawSentences: AlignedSentence[] = [];
    let id = 0;

    for (const seg of segmenter.segment(fullText)) {
      const sentenceText = seg.segment.trim();
      if (!sentenceText) continue;

      // Xác định chỉ số ký tự đầu và cuối của câu trong chuỗi fullText
      const segStartChar = seg.index + seg.segment.indexOf(sentenceText);
      const segEndChar = segStartChar + sentenceText.length - 1;

      // Tra cứu ngược ra block đầu tiên và block cuối cùng cấu thành nên câu
      const firstBlock = blocks[charToBlockMap[segStartChar]];
      const lastBlock = blocks[charToBlockMap[segEndChar]];

      rawSentences.push({
        id: id++,
        text: sentenceText,
        startMs: firstBlock.offset,
        endMs: lastBlock.offset + lastBlock.duration,
      });
    }

    // 3. Xử lý nội suy thời gian (Interpolation) khi một block chứa nhiều câu
    let i = 0;
    while (i < rawSentences.length) {
      let j = i;
      while (
        j < rawSentences.length &&
        rawSentences[j].startMs === rawSentences[i].startMs &&
        rawSentences[j].endMs === rawSentences[i].endMs
      ) {
        j++;
      }
      const count = j - i;
      if (count > 1) {
        const totalDuration = rawSentences[i].endMs - rawSentences[i].startMs;
        let totalChars = 0;
        for (let k = i; k < j; k++) {
          totalChars += rawSentences[k].text.length;
        }

        let currentStart = rawSentences[i].startMs;
        for (let k = i; k < j; k++) {
          const ratio = rawSentences[k].text.length / (totalChars || 1);
          const duration = totalDuration * ratio;
          rawSentences[k].startMs = Math.floor(currentStart);
          rawSentences[k].endMs = Math.floor(currentStart + duration);
          currentStart += duration;
        }
      }
      i = j;
    }

    // 4. Sanity Check: Ngăn chặn hiện tượng chồng lấn (Overlap Guard)
    for (let k = 0; k < rawSentences.length - 1; k++) {
      const current = rawSentences[k];
      const next = rawSentences[k + 1];

      if (current.endMs > next.startMs) {
        if (next.startMs > current.startMs) {
          const mid = Math.floor((current.endMs + next.startMs) / 2);
          current.endMs = mid;
          next.startMs = mid;
        } else {
          next.startMs = current.endMs;
        }
      }
    }

    return rawSentences;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận test PASS**

Chạy lệnh:
```bash
npm test -- src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts
```
Kỳ vọng: PASS cả 4 test cases.

- [ ] **Step 5: Commit mã nguồn Task 1**

```bash
git add src/plugins/story-shadowing/utils/subtitle-aligner.util.ts src/plugins/story-shadowing/utils/subtitle-aligner.util.spec.ts
git commit -m "feat(story-shadowing): implement deterministic SubtitleAlignerUtil"
```

---

### Task 2: Refactor `YoutubeSentenceConsolidatorNode` Tích Hợp `SubtitleAlignerUtil`

**Files:**
- Modify: `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`
- Modify: `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts`

- [ ] **Step 1: Viết test mới cho `YoutubeSentenceConsolidatorNode`**

Cập nhật `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts`:
- Kiểm tra node sử dụng `SubtitleAlignerUtil` để gom câu mà không cần phụ thuộc LLM cho việc tính toán thời gian.
- Kiểm tra node chỉ gọi LLM một lần duy nhất để phân loại độ khó (`level: easy/medium/hard`) từ chuỗi mẫu ngắn.
- Giữ nguyên khả năng tôn trọng `nodeOverrides` nếu người dùng cấu hình model/prompt.

```typescript
import { YoutubeSentenceConsolidatorNode } from './youtube-sentence-consolidator.node';
import { HiveService } from 'src/core/hive/hive.service';
import { PhoneticService } from 'src/core/phonetics/phonetic.service';

describe('YoutubeSentenceConsolidatorNode', () => {
  let node: YoutubeSentenceConsolidatorNode;
  let mockHiveService: Partial<HiveService>;
  let mockPhoneticsService: Partial<PhoneticService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn().mockResolvedValue({
        parsed: { level: 'easy' },
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      }),
    };
    mockPhoneticsService = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      transcribeSentence: jest.fn().mockReturnValue([{ word: 'Hello', ipa: '/test/' }]),
    };
    node = new YoutubeSentenceConsolidatorNode(
      mockHiveService as HiveService,
      mockPhoneticsService as PhoneticService,
    );
  });

  it('should consolidate youtube subtitles deterministically and assign IPA', async () => {
    const state: any = {
      youtubeTranscript: [
        { text: 'Hello', offset: 1000, duration: 1500 },
        { text: 'world.', offset: 2500, duration: 1500 },
      ],
    };

    const result = await node.invoke(state);

    expect(result.level).toBe('easy');
    expect(result.rawSentences).toHaveLength(1);
    const firstSentence = result.rawSentences?.[0] as any;
    expect(firstSentence.text).toBe('Hello world.');
    expect(firstSentence.startMs).toBe(1000);
    expect(firstSentence.endMs).toBe(4000);
    expect(firstSentence.words[0].ipa).toBe('/test/');
  });

  it('should gracefully fallback level to medium if AI classification fails', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockRejectedValueOnce(new Error('AI Service Busy'));

    const state: any = {
      youtubeTranscript: [
        { text: 'Testing fallback sentence.', offset: 0, duration: 2000 },
      ],
    };

    const result = await node.invoke(state);

    expect(result.level).toBe('medium');
    expect(result.rawSentences).toHaveLength(1);
    expect(result.rawSentences?.[0].text).toBe('Testing fallback sentence.');
  });
});
```

- [ ] **Step 2: Chạy test để xác minh test FAIL**

Chạy lệnh:
```bash
npm test -- src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts
```
Kỳ vọng: FAIL do code hiện tại của node vẫn đang gọi `HiveService` theo kiểu cũ (chunking array và kỳ vọng schema có field `sentences`).

- [ ] **Step 3: Cập nhật mã nguồn `YoutubeSentenceConsolidatorNode`**

Chỉnh sửa file `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`:
- Bỏ cơ chế chunking 25 blocks + shifting offset.
- Sử dụng `SubtitleAlignerUtil.align(transcriptToProcess)` để lấy danh sách câu và mốc thời gian hoàn hảo.
- Gọi Hive một lần duy nhất với Zod schema phân loại độ khó: `z.object({ level: z.enum(['easy', 'medium', 'hard']) })`.
- Chạy `PhoneticService` để tạo IPA.

```typescript
/**
 * @file youtube-sentence-consolidator.node.ts
 * @description Node gộp phụ đề YouTube tất định và phiên âm IPA
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { HiveService } from 'src/core/hive/hive.service';
import { PhoneticService } from 'src/core/phonetics/phonetic.service';
import { StoryShadowingStateType } from '../story-shadowing.state';
import { SubtitleAlignerUtil } from '../utils/subtitle-aligner.util';
import { z } from 'zod';

const DifficultyClassificationSchema = z.object({
  level: z.enum(['easy', 'medium', 'hard']),
});

const CLASSIFICATION_PROMPT = `You are an expert English language assessor.
Evaluate the overall language difficulty level of the provided English transcript text.
Criteria:
- easy: A1-A2, short simple sentences, high-frequency everyday vocabulary.
- medium: B1-B2, conversational, common phrasal verbs, standard structures.
- hard: C1-C2, specialized terms, idiomatic nuances, complex sentence structures.

Output JSON: { "level": "easy" | "medium" | "hard" }`;

@Injectable()
export class YoutubeSentenceConsolidatorNode {
  private readonly logger = new Logger(YoutubeSentenceConsolidatorNode.name);

  constructor(
    private readonly hive: HiveService,
    private readonly phonetics: PhoneticService,
  ) { }

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.youtubeTranscript) return {};

    this.logger.log('Đang gộp phụ đề và căn chỉnh thời gian bằng thuật toán tất định (Deterministic)...');

    try {
      await this.phonetics.ensureInitialized();
      const MAX_BLOCKS = 400;
      const transcriptToProcess = state.youtubeTranscript.slice(0, MAX_BLOCKS);

      // 1. Gộp câu và căn chỉnh thời gian chuẩn xác bằng thuật toán (0ms, 0 Token)
      const alignedSentences = SubtitleAlignerUtil.align(transcriptToProcess);

      if (alignedSentences.length === 0) {
        return { error: 'Không thể tách câu từ phụ đề YouTube này.' };
      }

      // 2. Phiên âm IPA cho từng từ
      const allSentences = alignedSentences.map(s => ({
        ...s,
        words: this.phonetics.transcribeSentence(s.text),
      }));

      // 3. Phân loại độ khó (Gọi nhẹ nhàng LLM 1 lần duy nhất với mẫu text ngắn)
      let overallLevel: 'easy' | 'medium' | 'hard' = 'medium';
      let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      try {
        const nodeConfig = state.config?.nodeOverrides?.['youtubeConsolidator'] || {};
        const model = nodeConfig.model || state.config?.defaultModel;
        const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.1;

        // Lấy mẫu khoảng 10-15 câu đầu để đánh giá trình độ
        const sampleText = allSentences.slice(0, 15).map(s => s.text).join(' ');

        const levelRes = await this.hive.invokeStructured(
          DifficultyClassificationSchema,
          [
            { role: 'system', content: CLASSIFICATION_PROMPT },
            { role: 'user', content: `Analyze the English proficiency level of this sample text:\n\n${sampleText}` }
          ],
          {
            temperature: temp,
            model: model,
            maxTokens: 500,
            name: 'youtube_level_classifier'
          }
        );

        if (levelRes?.parsed?.level) {
          overallLevel = levelRes.parsed.level;
        }
        if (levelRes?.usage) {
          totalUsage = levelRes.usage;
        }
      } catch (aiErr: any) {
        this.logger.warn(`⚠️ Không thể phân loại độ khó bằng AI (${aiErr.message}), mặc định: 'medium'`);
      }

      this.logger.log(`✅ Đã gộp thành công ${allSentences.length} câu hoàn chỉnh với độ chính xác thời gian tuyệt đối.`);

      return {
        rawSentences: allSentences,
        level: overallLevel,
        sentences: allSentences.map(s => ({ ...s, audioBase64: '' })),
        tokenUsage: totalUsage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Youtube Consolidator: ${err.message}`);
      return { error: 'Không thể xử lý ngôn ngữ phụ đề. Vui lòng thử video khác.' };
    }
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận test PASS**

Chạy lệnh:
```bash
npm test -- src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts
```
Kỳ vọng: PASS cả 2 test cases.

- [ ] **Step 5: Commit mã nguồn Task 2**

```bash
git add src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.spec.ts
git commit -m "refactor(story-shadowing): integrate SubtitleAlignerUtil into YoutubeSentenceConsolidatorNode"
```

---

### Task 3: Regression Integration Test Với Dữ Liệu Video `qHWtJtRSYjc`

**Files:**
- Create: `test/story-shadowing/youtube-consolidator-regression.e2e-spec.ts`

- [ ] **Step 1: Viết test kiểm tra hồi quy với đúng 76 blocks phụ đề của video `qHWtJtRSYjc`**

Tạo test `test/story-shadowing/youtube-consolidator-regression.e2e-spec.ts` nhằm mô phỏng lại đúng các block tại ranh giới câu 24 và 25:
- Xác nhận câu `"20 years. More than 20 years."` kết thúc tại `124,480ms`.
- Xác nhận câu `"OK, so when you were a student and you had jobs, that was quite a long time ago."` bắt đầu chính xác tại **`124,480ms`** (Không bị nhảy vọt thành 248,960ms).
- Khoảng hở giữa 2 câu bằng **0ms**.

```typescript
import { SubtitleAlignerUtil } from '../../src/plugins/story-shadowing/utils/subtitle-aligner.util';

describe('YouTube Sentence Consolidator Regression Test (qHWtJtRSYjc)', () => {
  it('should guarantee continuous timestamp between sentence 24 and 25', () => {
    const rawBlocks = [
      { text: 'OK, so how long have you\nworked at the BBC for?', offset: 117360, duration: 5120 },
      { text: '20 years. More than 20 years.', offset: 122480, duration: 2000 },
      { text: 'Oh, wow! OK, so when you were a student\nand you had jobs,', offset: 124480, duration: 5760 },
      { text: 'that was quite a long time ago.', offset: 130240, duration: 2400 },
      { text: 'It was ages ago, Beth!\nBefore the internet was invented.', offset: 132640, duration: 4480 },
    ];

    const sentences = SubtitleAlignerUtil.align(rawBlocks);

    // Tìm câu 20 years
    const s20Years = sentences.find(s => s.text === 'More than 20 years.');
    expect(s20Years).toBeDefined();
    expect(s20Years!.endMs).toBe(124480);

    // Tìm câu tiếp theo
    const sNext = sentences.find(s => s.text.includes('quite a long time ago'));
    expect(sNext).toBeDefined();

    // KIỂM TRA ĐIỀU KIỆN TIÊN QUYẾT: startMs của câu sau phải khớp khít với endMs câu trước
    expect(sNext!.startMs).toBe(124480);
    expect(sNext!.endMs).toBe(132640);

    // Đảm bảo không có bước nhảy cóc thời gian
    const gap = sNext!.startMs - s20Years!.endMs;
    expect(gap).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy regression test**

Chạy lệnh:
```bash
npm test -- test/story-shadowing/youtube-consolidator-regression.e2e-spec.ts
```
Kỳ vọng: PASS 100%.

- [ ] **Step 3: Chạy toàn bộ test suite của Story Shadowing Plugin**

Chạy lệnh:
```bash
npm test -- src/plugins/story-shadowing/
```
Kỳ vọng: Toàn bộ các test suite đều PASS không có lỗi hồi quy.

- [ ] **Step 4: Commit mã nguồn Task 3**

```bash
git add test/story-shadowing/youtube-consolidator-regression.e2e-spec.ts
git commit -m "test(story-shadowing): add regression test for subtitle continuous timeline"
```

---

## Plan Review & Verification Checklist
1. **Spec Coverage:** Giải quyết triệt để lỗi cộng đúp offset tại ranh giới chunk, bảo toàn 100% logic phiên âm IPA và phân loại độ khó `level`.
2. **Zero Hallucination:** Không còn tình trạng LLM tính toán sai mili-giây.
3. **Performance:** Giảm thời gian xử lý từ 25 giây xuống $\approx 300\text{ms}$ (tiết kiệm 98% thời gian và token).

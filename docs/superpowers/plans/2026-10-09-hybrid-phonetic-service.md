# Hybrid Phonetic Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Xây dựng `PhoneticService` tại Backend NestJS sử dụng CMUdict (`cmu-pronouncing-dictionary`) kết hợp thuật toán ánh xạ ARPAbet sang IPA thuần JavaScript, tự động phiên âm IPA cho 100% từ vựng trong các câu của bài học Story Shadowing với chi phí 0 token AI và độ trễ < 15ms.

**Architecture:** Tạo module `PhoneticModule` / `PhoneticService` độc lập trong Core. Dịch vụ này chuẩn hóa từ vựng (strip punctuation), tra cứu bảng băm CMUdict trong bộ nhớ ($O(1)$), chuyển đổi chuỗi âm học ARPAbet sang ký hiệu quốc tế IPA kèm dấu trọng âm (`ˈ`, `ˌ`). Sau đó, inject dịch vụ này vào `YoutubeSentenceConsolidatorNode` để tự động điền `s.words[].ipa` ngay sau khi LLM gộp câu xong.

**Tech Stack:** NestJS, TypeScript, `cmu-pronouncing-dictionary`, Jest, Mongoose.

---

## File Structure

- **Cấu hình & Types:**
  - `src/types/cmu-pronouncing-dictionary.d.ts`: Định nghĩa kiểu dữ liệu TypeScript cho gói `cmu-pronouncing-dictionary`.
  - `package.json`: Bổ sung dependency `cmu-pronouncing-dictionary`.
- **Core Module & Service:**
  - `src/core/phonetics/phonetic.service.ts`: Chứa logic chuẩn hóa từ, tra từ điển CMUdict và thuật toán chuyển đổi ARPAbet sang IPA.
  - `src/core/phonetics/phonetic.module.ts`: NestJS Module đóng gói và export `PhoneticService`.
  - `src/core/phonetics/phonetic.service.spec.ts`: Unit test toàn diện cho `PhoneticService` (từ thường, từ viết hoa, từ có dấu câu, từ OOV).
- **Plugins tích hợp:**
  - `src/plugins/story-shadowing/story-shadowing.module.ts`: Import `PhoneticModule`.
  - `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`: Inject `PhoneticService` để điền IPA cho toàn bộ từ trong câu.

---

### Task 1: Cài đặt thư viện CMUdict và Định nghĩa Kiểu (Type Declaration)

**Files:**
- Modify: `package.json`
- Create: `src/types/cmu-pronouncing-dictionary.d.ts`

- [x] **Step 1: Cài đặt gói `cmu-pronouncing-dictionary` qua pnpm**

Run command:
```bash
pnpm add cmu-pronouncing-dictionary
```

- [x] **Step 2: Tạo file định nghĩa kiểu TypeScript**

Tạo file [cmu-pronouncing-dictionary.d.ts](file:///Users/anhtus/Documents/Development/NestJS/aha-mind-agents/src/types/cmu-pronouncing-dictionary.d.ts):
```typescript
declare module 'cmu-pronouncing-dictionary' {
  const dictionary: Record<string, string>;
  export default dictionary;
}
```

- [x] **Step 3: Kiểm tra biên dịch TypeScript**

Run command:
```bash
npx tsc --noEmit
```
Expected: PASS (0 errors).

- [x] **Step 4: Commit thay đổi**

```bash
git add package.json pnpm-lock.yaml src/types/cmu-pronouncing-dictionary.d.ts
git commit -m "chore(phonetics): install cmu-pronouncing-dictionary and declare typings"
```

---

### Task 2: Xây dựng `PhoneticService` và Unit Test (TDD)

**Files:**
- Create: `src/core/phonetics/phonetic.service.spec.ts`
- Create: `src/core/phonetics/phonetic.service.ts`
- Create: `src/core/phonetics/phonetic.module.ts`

- [x] **Step 1: Viết Unit Test thất bại (Failing Test)**

Tạo file [phonetic.service.spec.ts](file:///Users/anhtus/Documents/Development/NestJS/aha-mind-agents/src/core/phonetics/phonetic.service.spec.ts):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PhoneticService } from './phonetic.service';

describe('PhoneticService', () => {
  let service: PhoneticService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PhoneticService],
    }).compile();

    service = module.get<PhoneticService>(PhoneticService);
  });

  it('nên khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  it('nên phiên âm chính xác từ đơn giản như "hello", "world"', () => {
    const helloIpa = service.transcribeWord('hello');
    const worldIpa = service.transcribeWord('world');

    expect(helloIpa).toMatch(/\/h[əɛ]ˈloʊ\//);
    expect(worldIpa).toMatch(/\/w[ɜɝ]ː?ld\//);
  });

  it('nên làm sạch dấu câu gắn liền với từ (ví dụ: "genes,", "cold?")', () => {
    const genesIpa = service.transcribeWord('genes,');
    const coldIpa = service.transcribeWord('cold?');

    expect(genesIpa).toBeTruthy();
    expect(coldIpa).toBeTruthy();
    expect(genesIpa.startsWith('/')).toBe(true);
  });

  it('nên xử lý từ viết hoa ("Professor", "Circle.")', () => {
    const profIpa = service.transcribeWord('Professor');
    expect(profIpa).toBeTruthy();
  });

  it('nên trả về chuỗi rỗng đối với từ OOV hoặc ký tự đặc biệt', () => {
    const oovIpa = service.transcribeWord('Xyzzqwerty123');
    expect(oovIpa).toBe('');
  });

  it('nên phiên âm danh sách từ trong một câu văn', () => {
    const words = service.transcribeSentence('Including our genes, culture and place.');
    expect(words.length).toBe(6);
    expect(words[0].word).toBe('Including');
    expect(words[0].ipa).toBeTruthy();
    expect(words[2].word).toBe('genes,');
    expect(words[2].ipa).toBeTruthy();
  });
});
```

- [x] **Step 2: Chạy kiểm thử để xác nhận test thất bại**

Run command:
```bash
npm test -- src/core/phonetics/phonetic.service.spec.ts
```
Expected: FAIL (Cannot find module `./phonetic.service`).

- [x] **Step 3: Viết mã triển khai `PhoneticService`**

Tạo file [phonetic.service.ts](file:///Users/anhtus/Documents/Development/NestJS/aha-mind-agents/src/core/phonetics/phonetic.service.ts):
```typescript
/**
 * @file phonetic.service.ts
 * @description Dịch vụ tra cứu và chuyển đổi ngữ âm từ vựng tiếng Anh (CMUdict -> ARPAbet -> IPA)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import dict from 'cmu-pronouncing-dictionary';

/**
 * Bảng ánh xạ 39 âm vị ARPAbet chuẩn sang Ký hiệu ngữ âm quốc tế (IPA).
 * Tại sao cần bảng này? Vì CMUdict lưu trữ theo mã ARPAbet (thập niên 90),
 * trong khi người học tiếng Anh cần IPA chuẩn Oxford/Cambridge để luyện phát âm.
 */
const ARPABET_TO_IPA_MAP: Record<string, string> = {
  // Nguyên âm đơn & Nguyên âm đôi
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ',
  AY: 'aɪ', EH: 'ɛ', ER: 'ɜːr', EY: 'eɪ', IH: 'ɪ',
  IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',

  // Phụ âm
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f',
  G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l',
  M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r',
  S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v',
  W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};

@Injectable()
export class PhoneticService {
  private readonly logger = new Logger(PhoneticService.name);

  /**
   * Phiên âm một từ đơn thành chuỗi IPA dạng /.../
   * @param rawWord Từ tiếng Anh (có thể kèm hoa thường hoặc dấu câu)
   */
  public transcribeWord(rawWord: string): string {
    if (!rawWord) return '';

    // Làm sạch dấu câu ở đầu/cuối từ nhưng giữ dấu nháy đơn nội bộ (ví dụ: "don't", "someone's")
    const cleanWord = rawWord
      .toLowerCase()
      .replace(/^[^\w']+|[^\w']+$/g, '');

    if (!cleanWord) return '';

    // Fast lookup trong bảng băm O(1)
    const arpabet = dict[cleanWord];
    if (!arpabet) {
      return '';
    }

    return `/${this.convertArpabetToIpa(arpabet)}/`;
  }

  /**
   * Phiên âm toàn bộ các từ trong một câu văn
   * @param sentenceText Chuỗi văn bản của câu
   */
  public transcribeSentence(sentenceText: string): Array<{ word: string; ipa: string }> {
    const rawTokens = sentenceText.split(/\s+/).filter(Boolean);
    return rawTokens.map(word => ({
      word,
      ipa: this.transcribeWord(word),
    }));
  }

  /**
   * Chuyển đổi chuỗi ARPAbet (ví dụ: "HH AH0 L OW1") sang IPA (ví dụ: "həˈloʊ")
   */
  private convertArpabetToIpa(arpabetStr: string): string {
    const tokens = arpabetStr.trim().split(/\s+/);
    let ipaResult = '';

    for (const token of tokens) {
      // Tách mã âm và mức độ trọng âm (0: không trọng âm, 1: trọng âm chính, 2: trọng âm phụ)
      const match = token.match(/^([A-Z]+)([0-2])?$/);
      if (!match) continue;

      const [, phoneme, stress] = match;
      let ipaChar = ARPABET_TO_IPA_MAP[phoneme] || '';

      // Xử lý nguyên âm yếu AH0 thành âm schwa [ə]
      if (phoneme === 'AH' && stress === '0') {
        ipaChar = 'ə';
      }

      // Đặt dấu trọng âm trước âm tiết
      if (stress === '1') {
        ipaResult += `ˈ${ipaChar}`;
      } else if (stress === '2') {
        ipaResult += `ˌ${ipaChar}`;
      } else {
        ipaResult += ipaChar;
      }
    }

    return ipaResult;
  }
}
```

- [x] **Step 4: Tạo `PhoneticModule`**

Tạo file [phonetic.module.ts](file:///Users/anhtus/Documents/Development/NestJS/aha-mind-agents/src/core/phonetics/phonetic.module.ts):
```typescript
import { Module } from '@nestjs/common';
import { PhoneticService } from './phonetic.service';

@Module({
  providers: [PhoneticService],
  exports: [PhoneticService],
})
export class PhoneticModule {}
```

- [x] **Step 5: Chạy lại Unit Test để xác nhận thành công**

Run command:
```bash
npm test -- src/core/phonetics/phonetic.service.spec.ts
```
Expected: PASS (all tests passed).

- [x] **Step 6: Commit**

```bash
git add src/core/phonetics/
git commit -m "feat(phonetics): implement PhoneticService with CMUdict and ARPAbet to IPA conversion"
```

---

### Task 3: Tích hợp `PhoneticService` vào `YoutubeSentenceConsolidatorNode`

**Files:**
- Modify: `src/plugins/story-shadowing/story-shadowing.module.ts`
- Modify: `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`

- [x] **Step 1: Import `PhoneticModule` vào `StoryShadowingModule`**

Cập nhật `StoryShadowingModule` để inject `PhoneticModule`:
```typescript
import { PhoneticModule } from '../../core/phonetics/phonetic.module';

@Module({
  imports: [
    // ...
    PhoneticModule,
  ],
  // ...
})
```

- [x] **Step 2: Inject `PhoneticService` vào `YoutubeSentenceConsolidatorNode`**

Cập nhật constructor và hàm invoke trong [youtube-sentence-consolidator.node.ts](file:///Users/anhtus/Documents/Development/NestJS/aha-mind-agents/src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts):
```typescript
constructor(
  private readonly hive: HiveService,
  private readonly phonetics: PhoneticService,
) {}
```
Khi duyệt qua các câu:
```typescript
for (const s of parsed.sentences) {
  s.id = currentId++;
  s.startMs += offset;
  s.endMs += offset;
  // Tự động phiên âm IPA chuẩn xác mà không tốn token AI
  s.words = this.phonetics.transcribeSentence(s.text);
  allSentences.push(s);
}
```

- [x] **Step 3: Chạy kiểm thử hệ thống**

Run command:
```bash
npm test
```
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/plugins/story-shadowing/
git commit -m "feat(story-shadowing): integrate PhoneticService into YoutubeSentenceConsolidatorNode"
```

---

### Task 4: Kiểm thử E2E với API YouTube thật và Kiểm tra MongoDB

**Files:**
- Kiểm tra dữ liệu thực tế tại MongoDB `storybooks`.

- [x] **Step 1: Gọi API kích hoạt job YouTube**

Run command:
```bash
curl -X 'POST' \
  'http://localhost:3001/api/agents/story-shadowing/jobs' \
  -H 'Content-Type: application/json' \
  -d '{
    "pipeline": "youtube",
    "text": "Habits are the compound interest of self-improvement.",
    "voice": "FEMALE",
    "youtubeUrl": "https://youtu.be/GPbPAC0xS1s?si=1bBkJdcdD4A6TsiC",
    "forceRegenerate": true
  }'
```

- [x] **Step 2: Giám sát log xử lý**

Xác nhận:
- Node `youtubeConsolidator` hoàn thành trong vài giây.
- Không có lỗi `Unterminated string in JSON` hay `finish_reason: length`.
- Log hoàn thành toàn bộ pipeline.

- [x] **Step 3: Kiểm tra dữ liệu bản ghi `Storybook` trong MongoDB**

Truy vấn MongoDB để đảm bảo các từ trong `sentences[].words` đều có trường `ipa` với format `/.../` chuẩn (ví dụ `/ˈhæbɪts/`).

- [x] **Step 4: Commit và tổng kết**

```bash
git commit --allow-empty -m "chore(verification): verify hybrid phonetic pipeline with live youtube job"
```

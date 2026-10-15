/**
 * @file subtitle-aligner.util.ts
 * @description Thuật toán căn chỉnh và gióng hàng phụ đề sang câu hoàn chỉnh tất định (Deterministic)
 * Sử dụng Character-Proportional Monotonic Interval Projection
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

interface BlockRange {
  bIdx: number;
  startChar: number;
  endChar: number;
  length: number;
  block: RawCaptionBlock;
}

export class SubtitleAlignerUtil {
  /**
   * Ánh xạ các caption blocks vụn thành danh sách câu hoàn chỉnh theo ngữ pháp
   * và tính toán chính xác tuyệt đối mốc thời gian startMs, endMs dựa trên tỉ lệ ký tự.
   */
  public static align(blocks: RawCaptionBlock[]): AlignedSentence[] {
    if (!blocks || blocks.length === 0) {
      return [];
    }

    // 1. Dựng chuỗi văn bản liên tục và lưu vết khoảng ký tự của từng block
    let fullText = '';
    const blockRanges: BlockRange[] = [];

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const cleanText = blocks[bIdx].text.replace(/\n/g, ' ').trim();
      if (!cleanText) continue;

      if (fullText.length > 0) {
        fullText += ' ';
      }

      const startChar = fullText.length;
      fullText += cleanText;
      const endChar = fullText.length;
      blockRanges.push({
        bIdx,
        startChar,
        endChar,
        length: endChar - startChar,
        block: blocks[bIdx],
      });
    }

    if (!fullText.trim() || blockRanges.length === 0) {
      return [];
    }

    // Hàm tra cứu block chứa vị trí ký tự
    const findBlock = (charIdx: number): BlockRange => {
      for (const r of blockRanges) {
        if (charIdx >= r.startChar && charIdx <= r.endChar) return r;
      }
      return blockRanges[blockRanges.length - 1];
    };

    // 2. Sử dụng Intl.Segmenter chuẩn hóa của V8 (Unicode TR29) để tách câu
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const rawSentences: AlignedSentence[] = [];
    let id = 0;

    for (const seg of segmenter.segment(fullText)) {
      const sentenceText = seg.segment.trim();
      if (!sentenceText) continue;

      // Xác định chỉ số ký tự đầu và cuối của câu trong chuỗi fullText
      const segStartChar = seg.index + seg.segment.indexOf(sentenceText);
      const segEndChar = segStartChar + sentenceText.length;

      const firstR = findBlock(segStartChar);
      const lastR = findBlock(segEndChar - 1);

      // Tính tỉ lệ vị trí ký tự tương ứng trong block đầu và block cuối
      const startFraction = Math.max(0, Math.min(1, (segStartChar - firstR.startChar) / (firstR.length || 1)));
      const endFraction = Math.max(0, Math.min(1, (segEndChar - lastR.startChar) / (lastR.length || 1)));

      const startMs = Math.round(firstR.block.offset + startFraction * firstR.block.duration);
      const endMs = Math.round(lastR.block.offset + endFraction * lastR.block.duration);

      rawSentences.push({
        id: id++,
        text: sentenceText,
        startMs,
        endMs: Math.max(startMs + 100, endMs),
      });
    }

    // 3. Sanity Check: Ngăn chặn hiện tượng chồng lấn (Overlap Guard)
    for (let k = 0; k < rawSentences.length - 1; k++) {
      const current = rawSentences[k];
      const next = rawSentences[k + 1];

      if (current.endMs > next.startMs) {
        if (next.startMs > current.startMs) {
          const mid = Math.floor((current.endMs + next.startMs) / 2);
          current.endMs = mid;
          next.startMs = mid;
        } else {
          current.endMs = next.startMs;
        }
      }
    }

    return rawSentences;
  }
}

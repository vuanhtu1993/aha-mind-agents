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

    const s20Years = result.find(s => s.text === 'More than 20 years.');
    const sOhWow = result.find(s => s.text === 'Oh, wow!');
    const sStudent = result.find(s => s.text.includes('quite a long time ago'));

    expect(s20Years).toBeDefined();
    expect(sOhWow).toBeDefined();
    expect(sStudent).toBeDefined();

    // Câu "Oh, wow!" phải bắt đầu tại 124480ms (đúng mốc block tiếp theo)
    expect(sOhWow!.startMs).toBe(124480);
    // Câu "OK, so when you were a student..." phải bắt đầu sau "Oh, wow!" và trước khi block 2 kết thúc
    expect(sStudent!.startMs).toBeGreaterThan(124480);
    expect(sStudent!.startMs).toBeLessThan(130240);
    // TUYỆT ĐỐI không bị nhảy cóc thành 248960
    expect(sStudent!.startMs).toBeLessThan(150000);
    expect(sStudent!.endMs).toBe(132640);
  });

  it('should return empty array when blocks are empty', () => {
    expect(SubtitleAlignerUtil.align([])).toEqual([]);
  });
});

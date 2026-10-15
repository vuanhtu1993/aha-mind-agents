import { SubtitleAlignerUtil } from '../utils/subtitle-aligner.util';

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

    // Tìm câu Oh, wow!
    const sOhWow = sentences.find(s => s.text === 'Oh, wow!');
    expect(sOhWow).toBeDefined();
    // Bắt đầu chính xác ở 124480ms (đúng thời điểm câu trước kết thúc)
    expect(sOhWow!.startMs).toBe(124480);

    // Tìm câu tiếp theo
    const sNext = sentences.find(s => s.text.includes('quite a long time ago'));
    expect(sNext).toBeDefined();

    // KIỂM TRA ĐIỀU KIỆN TIÊN QUYẾT: TUYỆT ĐỐI không bị nhảy cóc sang 248960ms
    expect(sNext!.startMs).toBeLessThan(130240);
    expect(sNext!.startMs).toBeGreaterThan(124480);
    expect(sNext!.endMs).toBe(132640);

    // Đảm bảo không có bước nhảy rỗng lớn (> 1000ms)
    const gap = sNext!.startMs - sOhWow!.endMs;
    expect(gap).toBeLessThanOrEqual(500);
  });
});

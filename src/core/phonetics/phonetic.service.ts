/**
 * @file phonetic.service.ts
 * @description Dịch vụ tra cứu và chuyển đổi ngữ âm từ vựng tiếng Anh (CMUdict -> ARPAbet -> IPA)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { dictionary } from 'cmu-pronouncing-dictionary';

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

const VOWEL_SET = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

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
    const arpabet = dictionary[cleanWord];
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
    if (!sentenceText) return [];
    const rawTokens = sentenceText.split(/\s+/).filter(Boolean);
    return rawTokens.map(word => ({
      word,
      ipa: this.transcribeWord(word),
    }));
  }

  /**
   * Chuyển đổi chuỗi ARPAbet (ví dụ: "HH AH0 L OW1") sang IPA (ví dụ: "həˈloʊ")
   * Thuật toán tự động định vị trọng âm (ˈ hoặc ˌ) trước phụ âm mở đầu âm tiết (Syllable Onset).
   */
  public convertArpabetToIpa(arpabetStr: string): string {
    const tokens = arpabetStr.trim().split(/\s+/);

    const parsed = tokens.map(t => {
      const match = t.match(/^([A-Z]+)([0-2])?$/);
      const phoneme = match ? match[1] : t;
      const stress = match ? match[2] : undefined;
      return { phoneme, stress, isVowel: VOWEL_SET.has(phoneme) };
    });

    // Xác định vị trí đặt dấu trọng âm (trước phụ âm đầu âm tiết)
    const stressMarkers = new Map<number, string>();
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (item.isVowel && (item.stress === '1' || item.stress === '2')) {
        const marker = item.stress === '1' ? 'ˈ' : 'ˌ';
        let onsetIdx = i;
        // Lùi lại tìm các phụ âm thuộc onset của âm tiết này (tối đa 2 phụ âm)
        while (onsetIdx > 0 && !parsed[onsetIdx - 1].isVowel) {
          onsetIdx--;
          if (i - onsetIdx >= 2) break;
        }
        stressMarkers.set(onsetIdx, marker);
      }
    }

    let result = '';
    for (let i = 0; i < parsed.length; i++) {
      if (stressMarkers.has(i)) {
        result += stressMarkers.get(i);
      }
      const item = parsed[i];
      let ipaChar = ARPABET_TO_IPA_MAP[item.phoneme] || '';

      // Tinh chỉnh âm suy biến:
      // AH0 (unstressed) -> ə (schwa)
      if (item.phoneme === 'AH' && item.stress === '0') {
        ipaChar = 'ə';
      }
      // ER0 (unstressed) -> ər
      if (item.phoneme === 'ER' && item.stress === '0') {
        ipaChar = 'ər';
      }

      result += ipaChar;
    }

    return result;
  }
}

/**
 * @file phonetic.service.spec.ts
 * @description Kiểm thử đơn vị cho PhoneticService
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PhoneticService } from './phonetic.service';

describe('PhoneticService', () => {
  let service: PhoneticService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PhoneticService],
    }).compile();

    service = module.get<PhoneticService>(PhoneticService);
    await service.ensureInitialized();
  });

  it('nên khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  it('nên phiên âm chính xác từ cơ bản: "hello", "world", "habit"', () => {
    const helloIpa = service.transcribeWord('hello');
    const worldIpa = service.transcribeWord('world');
    const habitIpa = service.transcribeWord('habit');

    expect(helloIpa).toBe('/həˈloʊ/');
    expect(worldIpa).toBe('/ˈwɜːrld/');
    expect(habitIpa).toBe('/ˈhæbət/');
  });

  it('nên làm sạch dấu câu gắn liền với từ (ví dụ: "genes,", "cold?", "Circle.")', () => {
    const genesIpa = service.transcribeWord('genes,');
    const coldIpa = service.transcribeWord('cold?');
    const circleIpa = service.transcribeWord('Circle.');

    expect(genesIpa).toBe('/ˈdʒinz/');
    expect(coldIpa).toBe('/ˈkoʊld/');
    expect(circleIpa).toBe('/ˈsɜːrkəl/');
  });

  it('nên xử lý từ viết hoa ("Professor", "Arctic")', () => {
    const profIpa = service.transcribeWord('Professor');
    const arcticIpa = service.transcribeWord('Arctic');

    expect(profIpa).toBe('/prəˈfɛsər/');
    expect(arcticIpa).toBe('/ˈɑrktɪk/');
  });

  it('nên giữ dấu nháy đơn nội bộ của từ ghép viết tắt (ví dụ: "don\'t", "it\'s")', () => {
    const dontIpa = service.transcribeWord("don't");
    const itsIpa = service.transcribeWord("it's");

    expect(dontIpa).toBeTruthy();
    expect(itsIpa).toBeTruthy();
  });

  it('nên trả về chuỗi rỗng đối với từ OOV (không có trong từ điển) hoặc số', () => {
    const oovIpa = service.transcribeWord('Xyzzqwerty123');
    expect(oovIpa).toBe('');
    expect(service.transcribeWord('')).toBe('');
  });

  it('nên phiên âm toàn bộ các từ trong một câu hoàn chỉnh', () => {
    const words = service.transcribeSentence('Including our genes, culture and place.');
    expect(words.length).toBe(6);

    expect(words[0].word).toBe('Including');
    expect(words[0].ipa).toBe('/ˌɪnˈkludɪŋ/');

    expect(words[2].word).toBe('genes,');
    expect(words[2].ipa).toBe('/ˈdʒinz/');

    expect(words[3].word).toBe('culture');
    expect(words[3].ipa).toBe('/ˈkʌltʃər/');
  });
});

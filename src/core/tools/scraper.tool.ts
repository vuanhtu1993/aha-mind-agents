import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import axios from 'axios';

@Injectable()
export class ScraperToolService {
  private readonly logger = new Logger(ScraperToolService.name);

  /**
   * Tải HTML từ một URL và trích xuất phần văn bản nội dung chính (text content).
   * Lọc bỏ các thẻ quảng cáo, menu, footer, script, style.
   */
  public async extractTextFromUrl(url: string): Promise<string> {
    this.logger.log(`Đang cào dữ liệu từ URL: ${url}`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Loại bỏ các thẻ không cần thiết chứa rác
      $('script, style, noscript, iframe, img, svg, nav, footer, header, aside, .advertisement, #ad, .menu, .sidebar').remove();

      // Cố gắng tìm thẻ article hoặc main để lấy nội dung chính xác hơn
      let mainContent = $('article').text();
      if (!mainContent.trim()) {
        mainContent = $('main').text();
      }
      if (!mainContent.trim()) {
        mainContent = $('body').text();
      }

      // Xóa khoảng trắng thừa và dòng trống
      const cleanText = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      if (!cleanText) {
        throw new Error('Không tìm thấy nội dung văn bản hợp lệ trên trang này.');
      }

      this.logger.log(`✅ Trích xuất thành công ${cleanText.length} ký tự.`);
      return cleanText;
    } catch (error: any) {
      this.logger.error(`❌ Lỗi cào dữ liệu URL: ${error.message}`);
      throw new Error(`Không thể trích xuất văn bản từ URL. Lỗi: ${error.message}`);
    }
  }
}

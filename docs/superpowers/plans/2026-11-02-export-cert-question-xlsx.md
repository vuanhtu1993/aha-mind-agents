# Export Cert Questions to XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng chức năng kết xuất (export) toàn bộ ngân hàng câu hỏi chứng chỉ (CCAF, CCAO-F, ...) từ MongoDB sang file Excel (`.xlsx`) được định dạng chuyên nghiệp với đầy đủ đề bài song ngữ, các lựa chọn, đáp án đúng và phân tích chuyên sâu AI Expert.

**Architecture:** Sử dụng thư viện `exceljs` để xây dựng workbook nhiều cột với styling chuẩn (header nền xanh đậm, text wrap, auto fit width, căn lề tự động). `CertExcelExportService` truy vấn dữ liệu từ `cert_questions` collection, biên tập thành các dòng Excel có cấu trúc và trả về `Buffer`. `CertCrawlerController` cung cấp endpoint `GET /api/crawler/cert/export?certId=...` hỗ trợ tải file trực tiếp về máy.

**Tech Stack:** NestJS 11, TypeScript, Mongoose, `exceljs`, Express `Response`.

---

## 1. Cấu trúc Cột trong File Excel (`.xlsx`)

| STT | Tên cột (Header) | Khóa dữ liệu tương ứng | Chiều rộng (Width) | Định dạng hiển thị |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **No.** | `questionNo` | 8 | Căn giữa |
| 2 | **ID** | `externalId` | 10 | Căn giữa |
| 3 | **Chủ đề (Topic)** | `topic` | 25 | Căn trái, Wrap text |
| 4 | **Đề bài (English)** | `questionEn` | 45 | Căn trái, Wrap text |
| 5 | **Đề bài (Tiếng Việt)** | `questionVi` | 45 | Căn trái, Wrap text |
| 6 | **Lựa chọn A (EN)** | `optionsEn.A` | 30 | Căn trái, Wrap text |
| 7 | **Lựa chọn A (VI)** | `optionsVi.A` | 30 | Căn trái, Wrap text |
| 8 | **Lựa chọn B (EN)** | `optionsEn.B` | 30 | Căn trái, Wrap text |
| 9 | **Lựa chọn B (VI)** | `optionsVi.B` | 30 | Căn trái, Wrap text |
| 10 | **Lựa chọn C (EN)** | `optionsEn.C` | 30 | Căn trái, Wrap text |
| 11 | **Lựa chọn C (VI)** | `optionsVi.C` | 30 | Căn trái, Wrap text |
| 12 | **Lựa chọn D (EN)** | `optionsEn.D` | 30 | Căn trái, Wrap text |
| 13 | **Lựa chọn D (VI)** | `optionsVi.D` | 30 | Căn trái, Wrap text |
| 14 | **Đáp án đúng** | `correctAnswer` | 14 | In đậm, căn giữa, nền vàng nhạt |
| 15 | **Giải thích (English)** | `explanationEn` | 45 | Căn trái, Wrap text |
| 16 | **Phân tích sư phạm (AI Expert VI)** | `aiExpertVi` | 60 | Căn trái, Wrap text |
| 17 | **Tài liệu tham chiếu (Source URL)** | `sourceUrl` | 35 | Căn trái, có link |

---

## 2. Kế hoạch Các Task Triển khai (TDD Workflow)

### Task 1: Cài đặt thư viện `exceljs` & Xây dựng `CertExcelExportService`

**Files:**
- Modify: `package.json`
- Create: `src/plugins/cert-crawler/services/cert-excel-export.service.ts`
- Test: `src/plugins/cert-crawler/services/cert-excel-export.service.spec.ts`

**Interfaces:**
- Consumes: `@InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)`, `exceljs`
- Produces: `exportToExcel(certId: string): Promise<{ buffer: Buffer; fileName: string; totalQuestions: number }>`

- [x] **Step 1: Cài đặt dependency `exceljs`**
  ```bash
  pnpm add exceljs
  ```

- [x] **Step 2: Viết test thất bại (RED) cho `CertExcelExportService`**
  Tạo `src/plugins/cert-crawler/services/cert-excel-export.service.spec.ts`:
  * Mock `CertQuestionModel.find({ certId }).sort({ questionNo: 1 })`.
  * Kiểm tra hàm `exportToExcel('cca-f')` trả về Buffer hợp lệ (Buffer.isBuffer(result.buffer) === true) và có tên file `{certId}-questions.xlsx`.

- [x] **Step 3: Chạy test để xác nhận RED**
  ```bash
  npm test src/plugins/cert-crawler/services/cert-excel-export.service.spec.ts
  ```

- [x] **Step 4: Hiện thực `CertExcelExportService` (GREEN)**
  Tạo `src/plugins/cert-crawler/services/cert-excel-export.service.ts`:
  * Khởi tạo `ExcelJS.Workbook`.
  * Thêm worksheet tên `certId.toUpperCase()`.
  * Cấu hình 17 cột với độ rộng và căn chỉnh thích hợp.
  * Định dạng dòng tiêu đề (Header): Font bold trắng, nền màu thương hiệu xanh Navy đậm (`#1F4E79`).
  * Điền từng dòng dữ liệu và bật thuộc tính `alignment: { wrapText: true, vertical: 'top' }`.
  * Xuất ra buffer bằng `workbook.xlsx.writeBuffer()`.

- [x] **Step 5: Chạy test để xác nhận GREEN**
  ```bash
  npm test src/plugins/cert-crawler/services/cert-excel-export.service.spec.ts
  ```

- [x] **Step 6: Commit Task 1**
  ```bash
  git add package.json pnpm-lock.yaml src/plugins/cert-crawler/services/
  git commit -m "feat(cert-crawler): implement CertExcelExportService with styled exceljs workbook"
  ```

---

### Task 2: Bổ sung Endpoint Export trong `CertCrawlerController` & Wire Module

**Files:**
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.module.ts`
- Modify: `src/plugins/cert-crawler/cert-crawler.controller.spec.ts`

**Interfaces:**
- Produces: `GET /api/crawler/cert/export?certId=cca-f`

- [x] **Step 1: Viết test cập nhật cho Controller (RED)**
  * Bổ sung test case gọi `controller.export('cca-f', mockRes)`.
  * Kiểm tra thiết lập các Header `Content-Type` và `Content-Disposition`.

- [x] **Step 2: Hiện thực endpoint trong `CertCrawlerController` (GREEN)**
  ```typescript
  @Get('export')
  async export(
    @Query('certId') certId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.exportService.exportToExcel(certId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(buffer);
  }
  ```

- [x] **Step 3: Đăng ký `CertExcelExportService` vào `CertCrawlerModule`**
  Thêm vào `providers` và `exports`.

- [x] **Step 4: Chạy test để xác nhận GREEN**
  ```bash
  npm test src/plugins/cert-crawler/cert-crawler.controller.spec.ts
  ```

- [x] **Step 5: Commit Task 2**
  ```bash
  git add src/plugins/cert-crawler/
  git commit -m "feat(cert-crawler): add GET /api/crawler/cert/export endpoint"
  ```

---

### Task 3: Nghiệm thu Thực tế & Xuất file mẫu cho 169 câu CCAF

- [x] **Step 1: Chạy script xuất file thực tế `cca-f-questions.xlsx`**
  Tạo thư mục `exports/` và xuất file mẫu từ 169 câu hỏi CCAF đang có trong MongoDB.

- [x] **Step 2: Kiểm tra dung lượng và tính toàn vẹn của file XLSX**
  Xác nhận file mở được, đúng kích thước (~150KB - 300KB), có đủ các sheet và dòng.

- [x] **Step 3: Chạy toàn bộ test suite dự án**
  ```bash
  npm test
  npm run typecheck
  ```

- [x] **Step 4: Commit và hoàn tất**
  ```bash
  git add docs/superpowers/plans/2026-11-02-export-cert-question-xlsx.md
  git commit -m "docs: add export cert question xlsx implementation plan"
  ```

---
*Made by Anh Tu - Share to be share*

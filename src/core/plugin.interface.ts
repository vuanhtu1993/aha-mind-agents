import { Observable } from 'rxjs';

/**
 * Định nghĩa một bước (step) trong quy trình để hiển thị thanh tiến trình (Progress Bar) trên UI.
 */
export interface PipelineStep {
  id: string;
  name: string;
}

/**
 * Sự kiện tiến độ thời gian thực (Real-time Progress Event) phát ra cho Client qua SSE.
 */
export interface ProgressEvent {
  jobId?: string;
  stepId?: string;
  stepName?: string;
  status: 'init' | 'running' | 'completed' | 'failed' | 'done';
  progress?: number; // 0-100
  message?: string;
  payload?: any;
}

/**
 * Siêu dữ liệu khai báo thông tin của một Agent Plugin.
 */
export interface AgentPluginMetadata {
  id: string; // Khóa định danh duy nhất (VD: 'story-shadowing')
  displayName: string;
  description: string;
  pipelines: string[]; // Các loại pipeline hỗ trợ (VD: ['text', 'youtube'])
}

/**
 * Context truyền vào khi thực thi pipeline, cung cấp công cụ tương tác ngược với Gateway.
 */
export interface ExecutionContext {
  jobId: string;
  userId?: string;
  // Hàm log chuẩn hóa để ghi vết vào AgentExecLog sau này
  log: (message: string, meta?: any) => void;
}

/**
 * BẢN HỢP ĐỒNG (INTERFACE) CHUẨN MỰC CHO TẤT CẢ CÁC AGENT PLUGINS.
 * Bất kỳ Agent nào muốn tích hợp vào hệ thống đều phải tuân thủ hợp đồng này.
 */
export interface AgentPlugin {
  metadata: AgentPluginMetadata;

  /**
   * Validate dữ liệu đầu vào. Sẽ ném ra lỗi (throw Error) nếu dữ liệu không hợp lệ.
   */
  validateInput(pipeline: string, input: any): Promise<any>;

  /**
   * Trả về danh sách các bước dự kiến cho pipeline cụ thể.
   */
  getSteps(pipeline: string): PipelineStep[];

  /**
   * Hàm cốt lõi: Thực thi luồng xử lý LangGraph (hoặc logic tùy chỉnh).
   * Yêu cầu bắt buộc trả về một luồng Observable để Gateway có thể bọc SSE Stream.
   */
  execute(
    pipeline: string,
    input: any,
    context: ExecutionContext,
  ): Observable<ProgressEvent>;
}

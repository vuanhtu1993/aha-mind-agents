import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgentPlugin } from '../plugin.interface';

/**
 * Trạm Trung Chuyển (Registry) quản lý toàn bộ các Plugin Agent trong hệ thống.
 * Cung cấp cơ chế đăng ký (register) lúc app khởi động và cơ chế tìm kiếm (lookup) lúc chạy.
 */
@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  
  // Lưu trữ các plugins theo ID của chúng
  private readonly plugins: Map<string, AgentPlugin> = new Map();

  /**
   * Đăng ký một Plugin mới vào hệ thống.
   * Quá trình này thường được gọi trong onModuleInit() của từng Plugin Module.
   */
  public register(plugin: AgentPlugin): void {
    const { id, displayName } = plugin.metadata;
    if (this.plugins.has(id)) {
      this.logger.warn(`⚠️ Plugin có ID '${id}' đã được đăng ký trước đó. Sẽ bị ghi đè!`);
    }
    
    this.plugins.set(id, plugin);
    this.logger.log(`✅ Đã đăng ký Agent Plugin: [${displayName}] (ID: ${id})`);
  }

  /**
   * Tìm và lấy ra một Plugin dựa vào ID.
   * Sẽ quăng lỗi NotFoundException nếu không tìm thấy, giúp Gateway trả 404 cho Client.
   */
  public getPlugin(pluginId: string): AgentPlugin {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new NotFoundException(`Không tìm thấy Agent Plugin với ID: '${pluginId}'`);
    }
    return plugin;
  }

  /**
   * Lấy danh sách thông tin toàn bộ các Plugins đang hoạt động.
   * Phục vụ cho API Dashboard Quản Trị.
   */
  public getAvailablePlugins() {
    return Array.from(this.plugins.values()).map(plugin => plugin.metadata);
  }
}

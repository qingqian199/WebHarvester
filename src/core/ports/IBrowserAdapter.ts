import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot, PageLoadMetrics } from "../models";
import { SessionState } from "./ISessionManager";

/** 浏览器自动化适配器端口。定义采集引擎需要实现的所有操作。 */
export interface IBrowserAdapter {
  /** 启动浏览器并导航到目标 URL。支持注入已有登录态和代理。 */
  launch(url: string, sessionState?: SessionState, proxyUrl?: string): Promise<void>;
  /** 执行一组用户操作（点击、输入、等待、导航）。 */
  performActions(actions: HarvestConfig["actions"]): Promise<void>;
  /** 捕获页面发起的网络请求列表。 */
  captureNetworkRequests(config: { captureAll: boolean }): Promise<NetworkRequest[]>;
  /** 通过 CSS 选择器查询页面元素。 */
  queryElements(selectors: string[]): Promise<ElementItem[]>;
  /** 读取页面存储（localStorage / sessionStorage / cookies）。 */
  getStorage(types: Array<"localStorage" | "sessionStorage" | "cookies">): Promise<StorageSnapshot>;
  /** 在浏览器上下文中执行 JavaScript 脚本。 */
  executeScript<T>(script: string): Promise<T>;
  /** 获取页面加载性能指标（如 FCP、DOM 解析时间）。 */
  getPageMetrics(): PageLoadMetrics | null;
  /** 关闭浏览器并释放资源。 */
  close(): Promise<void>;
}

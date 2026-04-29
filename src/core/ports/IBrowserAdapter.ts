import { HarvestConfig, NetworkRequest, ElementItem, StorageSnapshot, PageLoadMetrics } from "../models";
import { SessionState } from "./ISessionManager";

export interface IBrowserAdapter {
  launch(url: string, sessionState?: SessionState): Promise<void>;
  performActions(actions: HarvestConfig["actions"]): Promise<void>;
  captureNetworkRequests(config: { captureAll: boolean }): Promise<NetworkRequest[]>;
  queryElements(selectors: string[]): Promise<ElementItem[]>;
  getStorage(types: Array<"localStorage" | "sessionStorage" | "cookies">): Promise<StorageSnapshot>;
  executeScript<T>(script: string): Promise<T>;
  getPageMetrics(): PageLoadMetrics | null;
  close(): Promise<void>;
}

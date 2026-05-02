import { AppConfig } from "../core/config/app-config";
import { ConsoleLogger } from "../adapters/ConsoleLogger";
import { CrawlerDispatcher } from "../core/services/CrawlerDispatcher";
import { IProxyProvider } from "../core/ports/IProxyProvider";

export interface CliDeps {
  config: AppConfig;
  logger: ConsoleLogger;
  dispatcher: CrawlerDispatcher;
  proxyProvider?: IProxyProvider;
}

export interface CliAction {
  type: string;
  url?: string;
  profile?: string;
  loginUrl?: string;
  verifyUrl?: string;
  config?: any;
  saveSession?: boolean;
}

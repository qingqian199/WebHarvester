import { handleSingleHarvest } from "../single-harvest";
import { HarvesterService } from "../../../core/services/HarvesterService";
import { PlaywrightAdapter } from "../../../adapters/PlaywrightAdapter";
import { FeatureFlags } from "../../../core/features";

jest.mock("../../../core/services/HarvesterService");
jest.mock("../../../adapters/PlaywrightAdapter");
jest.mock("../../../adapters/FileSessionManager");
jest.mock("../../../adapters/FileStorageAdapter");
jest.mock("../../../adapters/LightHttpEngine");
jest.mock("../../../utils/auth-guard");

describe("handleSingleHarvest", () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), setTraceId: jest.fn() };
  const mockDispatcher = { dispatch: jest.fn(), fetch: jest.fn() };
  const mockConfig = { outputDir: "/tmp", chromeService: { port: 9222 } };

  beforeEach(() => {
    jest.clearAllMocks();
    FeatureFlags.enableSessionPersist = false;
  });

  it("正常路径: 创建 HarvesterService 并调用 harvest", async () => {
    const mockHarvest = jest.fn().mockResolvedValue(undefined);
    (HarvesterService as jest.Mock).mockImplementation(() => ({ harvest: mockHarvest }));
    const deps = { logger: mockLogger, config: mockConfig, dispatcher: mockDispatcher };
    const action = { type: "single" as const, config: { targetUrl: "https://example.com", networkCapture: { captureAll: true } }, saveSession: false };

    await handleSingleHarvest(deps as any, action as any);
    expect(mockHarvest).toHaveBeenCalled();
  });

  it("ChromeService 模式: connectToChromeService 被调用", async () => {
    const mockHarvest = jest.fn().mockResolvedValue(undefined);
    (HarvesterService as jest.Mock).mockImplementation(() => ({ harvest: mockHarvest }));
    (PlaywrightAdapter.connectToChromeService as any) = jest.fn().mockResolvedValue({});

    const deps = { logger: mockLogger, config: mockConfig, dispatcher: mockDispatcher };
    const action = { type: "single" as const, config: { targetUrl: "https://example.com" }, useChromeService: true, saveSession: false };

    await handleSingleHarvest(deps as any, action as any);
    expect(PlaywrightAdapter.connectToChromeService).toHaveBeenCalled();
  });
});

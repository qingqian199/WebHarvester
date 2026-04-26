export interface CliRuntimeArgs {
  profile?: string;
  saveSession: boolean;
  outputFormat: "json" | "md" | "csv" | "har" | "all";
  aiMode: boolean;
  securityAudit: boolean;
  headlessOverride?: boolean;
  analyzeFile?: string;       // 新增：指定要分析的 JSON 文件路径
}

export function parseCliArgs(): CliRuntimeArgs {
  const args = process.argv.slice(2);
  const opts: CliRuntimeArgs = {
    saveSession: false,
    outputFormat: "all",
    aiMode: false,
    securityAudit: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--profile":
        opts.profile = args[++i];
        break;
      case "--save-session":
        opts.saveSession = true;
        break;
      case "--output-format":
        const fmt = args[++i];
        if (["json", "md", "csv", "har", "all"].includes(fmt)) {
          opts.outputFormat = fmt as any;
        }
        break;
      case "--ai-mode":
        opts.aiMode = true;
        break;
      case "--security-audit":
        opts.securityAudit = true;
        break;
      case "--headless=false":
        opts.headlessOverride = false;
        break;
      case "--analyze":
        opts.analyzeFile = args[++i];
        break;
    }
  }

  return opts;
}
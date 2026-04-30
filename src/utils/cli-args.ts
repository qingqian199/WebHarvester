export interface CliRuntimeArgs {
  profile?: string;
  saveSession: boolean;
  outputFormat: "json" | "md" | "csv" | "har" | "all";
  aiMode: boolean;
  securityAudit: boolean;
  headlessOverride?: boolean;
  analyzeFile?: string;
  verifyUrl?: string;
  loginUrl?: string;
  quickArticleUrl?: string;
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
      case "--output-format": {
        const fmt = args[++i];
        if (fmt === "json" || fmt === "md" || fmt === "csv" || fmt === "har" || fmt === "all") {
          opts.outputFormat = fmt;
        }
        break;
      }
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
      case "--verify-url":
        opts.verifyUrl = args[++i];
        break;
      case "--login-url":
        opts.loginUrl = args[++i];
        break;
      case "--quick-article":
        opts.quickArticleUrl = args[++i];
        break;
    }
  }

  return opts;
}

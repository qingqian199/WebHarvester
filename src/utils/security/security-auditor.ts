import { HarvestResult } from "../../core/models";
import { ISecurityAuditor, SecurityAuditReport } from "../../core/ports/ISecurityAudit";

const SENSITIVE_REG = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /cookie.*secure/i,
  /httponly/i,
  /sessionid/i,
  /authorization/i
];

const ERROR_LEAK_REG = [
  /stack.?trace/i,
  /exception/i,
  /debug.?mode/i,
  /file.?path/i,
  /database.?error/i
];

export class SecurityAuditor implements ISecurityAuditor {
  scan(result: HarvestResult): SecurityAuditReport {
    const riskItems: SecurityAuditReport["riskItems"] = [];
    const cookieCheck: string[] = [];
    const sensitiveDataLeak: string[] = [];

    result.storage.cookies.forEach(ck => {
      const insecure = !ck.secure || !ck.httpOnly;
      if (insecure) {
        cookieCheck.push(`Cookie【${ck.name}】缺少 Secure/HttpOnly 安全标识`);
        riskItems.push({
          type: "cookie_risk",
          desc: `敏感Cookie未启用安全防护：${ck.name}`,
          suggest: "部署时强制开启 Secure、HttpOnly、SameSite=Strict"
        });
      }
    });

    result.networkRequests.forEach(req => {
      const headers = req.requestHeaders ?? {};
      const body = typeof req.requestBody === "string" ? req.requestBody : JSON.stringify(req.requestBody ?? {});
      const raw = JSON.stringify(headers) + body;

      SENSITIVE_REG.forEach(reg => {
        if (reg.test(raw)) {
          sensitiveDataLeak.push(`接口${req.method} ${req.url} 存在敏感字段明文传输风险`);
        }
      });

      const resRaw = typeof req.responseBody === "string" ? req.responseBody : JSON.stringify(req.responseBody ?? {});
      ERROR_LEAK_REG.forEach(reg => {
        if (reg.test(resRaw)) {
          riskItems.push({
            type: "debug_leak",
            desc: `接口${req.url} 泄露调试/堆栈信息`,
            suggest: "生产环境关闭Debug、异常信息脱敏"
          });
        }
      });
    });

    const noAuthApi = result.networkRequests
      .filter(r => !r.requestHeaders?.authorization && !r.requestHeaders?.["x-token"]);
    if (noAuthApi.length > 3) {
      riskItems.push({
        type: "no_auth_api",
        desc: `存在${noAuthApi.length}个无鉴权接口，越权风险高`,
        suggest: "统一接入全局Token鉴权、接口权限校验"
      });
    }

    let score = 100;
    score -= riskItems.length * 8;
    score -= cookieCheck.length * 5;
    score = Math.max(0, score);

    let level: SecurityAuditReport["level"] = "safe";
    if (score < 30) level = "high";
    else if (score < 60) level = "medium";
    else if (score < 85) level = "low";

    return {
      score,
      level,
      riskItems,
      cookieCheck,
      sensitiveDataLeak
    };
  }
}

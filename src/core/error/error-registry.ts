import { ErrorCode } from "./ErrorCode";

interface ErrorEntry {
  message: string;
  suggestion: string;
}

const REGISTRY: Record<string, ErrorEntry> = {
  // E001-099: 通用 / 配置
  [ErrorCode.INVALID_URL]: { message: "URL 格式无效", suggestion: "请输入合法的 http:// 或 https:// 网址" },
  [ErrorCode.EMPTY_SELECTOR]: { message: "CSS 选择器为空", suggestion: "请提供至少一个非空的选择器" },
  [ErrorCode.INVALID_REGEX]: { message: "正则表达式格式错误", suggestion: "请检查正则表达式语法" },
  [ErrorCode.EMPTY_TASK_CONFIG]: { message: "任务配置为空", suggestion: "请提供至少一个待采集的 URL" },
  E005: { message: "参数校验失败", suggestion: "请检查请求参数是否完整和合法" },
  E006: { message: "会话加载失败", suggestion: "请确认会话文件存在且未损坏" },
  E007: { message: "任务超时", suggestion: "采集耗时超过上限，请分拆任务或增加超时配置" },
  E008: { message: "数据为空", suggestion: "目标页面未返回有效数据" },
  E009: { message: "不支持的站点", suggestion: "当前版本不支持该站点，请检查配置" },
  E010: { message: "请求参数校验失败", suggestion: "请检查请求参数是否完整和合法" },
  E011: { message: "登录凭证无效", suggestion: "请检查用户名和密码是否正确" },
  E012: { message: "登录尝试过于频繁", suggestion: "请等待 15 分钟后再试" },

  // E100-199: 网络
  [ErrorCode.BROWSER_LAUNCH_FAILED]: { message: "浏览器启动失败", suggestion: "请确认已安装 Chromium (npx playwright install)" },
  [ErrorCode.PAGE_NAVIGATE_TIMEOUT]: { message: "页面导航超时", suggestion: "请检查目标站点是否可访问或增加超时时间" },
  [ErrorCode.ELEMENT_NOT_FOUND]: { message: "页面元素未找到", suggestion: "请确认选择器与页面结构匹配" },
  [ErrorCode.ACTION_OPERATION_FAILED]: { message: "页面操作执行失败", suggestion: "请确认页面已完全加载后再执行操作" },
  E105: { message: "网络请求失败", suggestion: "请检查网络连接和目标站点状态" },
  E106: { message: "DNS 解析失败", suggestion: "请检查域名是否正确或更换 DNS" },
  E107: { message: "连接被拒绝", suggestion: "目标服务器拒绝连接，请确认端口和服务状态" },
  E108: { message: "SSL/TLS 错误", suggestion: "请检查证书配置或尝试忽略证书验证" },
  E109: { message: "请求超时", suggestion: "请求未在超时时间内响应，请检查网络或增加超时" },
  E110: { message: "状态码异常", suggestion: "服务器返回了非预期的 HTTP 状态码" },
  E111: { message: "代理连接失败", suggestion: "请检查代理服务器地址和端口是否正确" },

  // E200-299: 浏览器
  [ErrorCode.NETWORK_CAPTURE_ERROR]: { message: "网络请求捕获失败", suggestion: "请检查浏览器页面是否正常加载" },
  [ErrorCode.SCRIPT_EXEC_TIMEOUT]: { message: "脚本执行超时", suggestion: "请检查脚本复杂度或简化采集逻辑" },
  [ErrorCode.STORAGE_QUERY_FAILED]: { message: "浏览器存储查询失败", suggestion: "请确认页面已完全加载" },
  E204: { message: "页面加载失败", suggestion: "目标页面返回了错误状态码" },
  E205: { message: "JavaScript 执行错误", suggestion: "页面脚本执行异常，请检查目标页面状态" },

  // E300-399: 文件 I/O
  [ErrorCode.FS_MKDIR_FAILED]: { message: "创建目录失败", suggestion: "请检查磁盘空间和 output 目录权限" },
  [ErrorCode.FS_WRITE_FAILED]: { message: "文件写入失败", suggestion: "请检查磁盘空间和 output 目录权限" },
  E303: { message: "文件读取失败", suggestion: "请确认文件路径正确且可读" },
  E304: { message: "文件删除失败", suggestion: "请确认文件路径正确且有删除权限" },
  E305: { message: "数据序列化失败", suggestion: "采集结果序列化异常，请检查数据格式" },

  // E999: 未知
  [ErrorCode.UNKNOWN_ERROR]: { message: "未知错误", suggestion: "请联系开发者并提供错误日志" },
};

/**
 * 错误代码注册表：ErrorCode → 可读描述 + 建议。
 */
export function getErrorEntry(code: ErrorCode | string): ErrorEntry {
  return REGISTRY[code] ?? REGISTRY[ErrorCode.UNKNOWN_ERROR];
}

/**
 * 格式化错误输出。
 * 返回格式：[E101] 网络请求失败 (detail)
 * 建议：请检查网络连接和目标站点状态
 */
export function formatError(code: ErrorCode | string, detail?: string): string {
  const entry = getErrorEntry(code);
  const detailPart = detail ? ` (${detail})` : "";
  return `[${code}] ${entry.message}${detailPart}\n建议：${entry.suggestion}`;
}

/**
 * 构建 API 错误响应体。
 */
export function apiErrorBody(code: ErrorCode | string, detail?: string): Record<string, unknown> {
  const entry = getErrorEntry(code);
  return {
    error: true,
    code,
    message: entry.message,
    suggestion: entry.suggestion,
    detail: detail || null,
  };
}

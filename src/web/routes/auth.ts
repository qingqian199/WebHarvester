import http from "http";
import path from "path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import { Router } from "../Router";
import { ServerContext } from "./context";

const JWT_EXPIRES_IN = "24h";
const CONFIG_PATH = path.resolve("./config.json");

export function registerAuthRoutes(router: Router, ctx: ServerContext): void {
  router.register("POST", "/api/auth/login", (req, res) => handleApiAuthLogin(req, res, ctx));
}

async function handleApiAuthLogin(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  const body = JSON.parse(await ctx.getBody(req));
  const { username, password } = body;
  if (!username || !password) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: "缺少用户名或密码" }));
    return;
  }

  // 速率限制检查
  const ip = ctx.getClientIp(req);
  const attempt = ctx.loginAttempts.get(ip);
  if (attempt && Date.now() < attempt.lockUntil) {
    const remainingSec = Math.ceil((attempt.lockUntil - Date.now()) / 1000);
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(remainingSec) });
    res.end(JSON.stringify({ error: true, code: "E012", message: "登录尝试过于频繁", suggestion: `请等待 ${Math.ceil(remainingSec / 60)} 分钟后再试` }));
    return;
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw);
    const user = (cfg.users || []).find((u: { username: string }) => u.username === username);
    if (!user) {
      recordFailedAttempt(ip, ctx);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, code: "E011", message: "用户名或密码错误", suggestion: "请检查用户名和密码是否正确" }));
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(ip, ctx);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, code: "E011", message: "用户名或密码错误", suggestion: "请检查用户名和密码是否正确" }));
      return;
    }

    // 登录成功：清除尝试记录
    ctx.loginAttempts.delete(ip);

    const token = jwt.sign(
      { username: user.username, role: user.role || "admin" },
      ctx.jwtSecret,
      { expiresIn: JWT_EXPIRES_IN },
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: { token, expiresIn: JWT_EXPIRES_IN } }));
  } catch (e: any) {
    ctx.logger.warn(`Auth login error: ${e.message}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: -1, msg: e.message }));
  }
}

function recordFailedAttempt(ip: string, ctx: ServerContext): void {
  const now = Date.now();
  const record = ctx.loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  record.count++;
  if (record.count >= 5) {
    record.lockUntil = now + 15 * 60 * 1000;
    ctx.logger.warn(`登录锁定 IP: ${ip}，持续 15 分钟`);
  }
  ctx.loginAttempts.set(ip, record);
}

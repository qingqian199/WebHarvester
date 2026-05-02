import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const CONFIG_PATH = path.resolve("./config.json");

/**
 * 加密敏感字段（AES-256-GCM）。
 * GCM 认证标签附加在密文末尾，解密时会自动验证。
 * 返回格式：`aes256gcm:${iv_base64}:${ciphertext_base64}`
 * 前缀 `aes256gcm:` 用于区分加密值与明文值。
 */
export function encryptField(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  const ivStr = iv.toString("base64");
  return `aes256gcm:${ivStr}:${encrypted}:${tag}`;
}

/**
 * 解密 `encryptField` 产生的加密字段。
 */
export function decryptField(encrypted: string, key: Buffer): string {
  if (!encrypted.startsWith("aes256gcm:")) return encrypted;
  const parts = encrypted.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[1], "base64");
  const data = parts[2];
  const tag = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * 判断字符串是否为 `encryptField` 产生的加密值。
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith("aes256gcm:") && value.split(":").length === 4;
}

/**
 * 获取 AES-256 主密钥（32 字节）。
 * 优先级：WEBHARVESTER_MASTER_KEY 环境变量 > config.json 中的 encrypted.masterKey。
 * 如果两者都不存在，生成随机密钥并写入 config.json。
 */
export async function getMasterKey(): Promise<Buffer> {
  const envKey = process.env.WEBHARVESTER_MASTER_KEY;
  if (envKey) {
    if (envKey.length === 64) return Buffer.from(envKey, "hex");
    return Buffer.from(envKey, "base64");
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw);
    if (cfg.encrypted?.masterKey) {
      return Buffer.from(cfg.encrypted.masterKey, "base64");
    }
  } catch {}

  const newKey = crypto.randomBytes(32);
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw);
    cfg.encrypted = cfg.encrypted || {};
    cfg.encrypted.masterKey = newKey.toString("base64");
    cfg.encrypted.algorithm = ALGORITHM;
    await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  } catch {}
  return newKey;
}

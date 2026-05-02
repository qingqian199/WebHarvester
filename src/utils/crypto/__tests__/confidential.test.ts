import { encryptField, decryptField, isEncrypted } from "../confidential";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8"); // 32 bytes

describe("confidential encryption", () => {
  it("encryptField returns encrypted format with aes256gcm: prefix", () => {
    const result = encryptField("hello world", key);
    expect(result.startsWith("aes256gcm:")).toBe(true);
    expect(result.split(":").length).toBe(4);
  });

  it("decryptField recovers original plaintext", () => {
    const plaintext = "sensitive-cookie-value-123";
    const encrypted = encryptField(plaintext, key);
    const decrypted = decryptField(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("decryptField returns input unchanged for non-encrypted strings", () => {
    const result = decryptField("plaintext-value", key);
    expect(result).toBe("plaintext-value");
  });

  it("isEncrypted detects encrypted fields", () => {
    const encrypted = encryptField("test", key);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted("aes256gcm:invalid")).toBe(false);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const a = encryptField("same", key);
    const b = encryptField("same", key);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptField("secret", key);
    // corrupt the ciphertext part
    const parts = encrypted.split(":");
    parts[2] = "tampered";
    const tampered = parts.join(":");
    expect(() => decryptField(tampered, key)).toThrow();
  });
});

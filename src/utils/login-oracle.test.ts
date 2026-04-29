import { analyzeLoginForm } from "./login-oracle";
import { ElementItem, NetworkRequest } from "../core/models";

function inp(attrs: Record<string, string>): ElementItem {
  return { selector: "input", tagName: "input", attributes: attrs };
}

function form(attrs: Record<string, string>): ElementItem {
  return { selector: "form", tagName: "form", attributes: attrs };
}

function req(url: string, method = "GET"): NetworkRequest {
  return { url, method, statusCode: 200, requestHeaders: {}, timestamp: Date.now() };
}

describe("analyzeLoginForm", () => {
  describe("form action detection", () => {
    it("extracts form action and method", () => {
      const r = analyzeLoginForm([form({ action: "/login", method: "post" })], []);
      expect(r.formAction).toBe("/login");
      expect(r.method).toBe("POST");
    });

    it("defaults to POST", () => {
      expect(analyzeLoginForm([form({ action: "/login" })], []).method).toBe("POST");
    });

    it("uses first form", () => {
      const r = analyzeLoginForm(
        [form({ action: "/login" }), form({ action: "/search" })],
        [],
      );
      expect(r.formAction).toBe("/login");
    });

    it("falls back to login API when no form", () => {
      const r = analyzeLoginForm([], [req("https://example.com/api/login", "POST")]);
      expect(r.formAction).toContain("/api/login");
    });

    it("falls back to passport API route", () => {
      const r = analyzeLoginForm([], [req("https://example.com/api/passport/sso/login", "POST")]);
      expect(r.formAction).toContain("passport");
    });
  });

  describe("username field detection", () => {
    it("detects by name='email'", () => {
      expect(analyzeLoginForm([inp({ name: "email" })], []).paramMap.username).toBe("email");
    });

    it("detects by type='email' (falls back to 'username' when no name/id)", () => {
      const r = analyzeLoginForm([inp({ type: "email" })], []);
      expect(r.paramMap.username).toBe("username");
    });

    it("detects by type='email' and uses name attribute", () => {
      expect(analyzeLoginForm([inp({ type: "email", name: "email" })], []).paramMap.username).toBe("email");
    });

    it("detects by autocomplete='username'", () => {
      expect(analyzeLoginForm([inp({ autocomplete: "username" })], []).paramMap.username).toBe("username");
    });

    it("detects by Chinese placeholder", () => {
      expect(analyzeLoginForm([inp({ placeholder: "手机号/邮箱", name: "tel" })], []).paramMap.username).toBe("tel");
    });

    it("detects by id containing 'login'", () => {
      expect(analyzeLoginForm([inp({ id: "login_id" })], []).paramMap.username).toBe("login_id");
    });

    it("prefers name attribute over id", () => {
      expect(analyzeLoginForm([inp({ name: "email", id: "x" })], []).paramMap.username).toBe("email");
    });

    it("uses last match when multiple username fields", () => {
      expect(analyzeLoginForm([inp({ name: "user" }), inp({ name: "email" })], []).paramMap.username).toBe("email");
    });
  });

  describe("password field detection", () => {
    it("detects by type='password'", () => {
      expect(analyzeLoginForm([inp({ type: "password" })], []).paramMap.password).toBe("password");
    });

    it("detects by autocomplete='current-password'", () => {
      expect(analyzeLoginForm([inp({ autocomplete: "current-password", name: "passwd" })], []).paramMap.password).toBe("passwd");
    });

    it("uses name attribute when available", () => {
      expect(analyzeLoginForm([inp({ name: "passwd", type: "password" })], []).paramMap.password).toBe("passwd");
    });
  });

  describe("CSRF field detection", () => {
    it("detects by name containing 'csrf'", () => {
      const r = analyzeLoginForm([inp({ name: "csrf_token", value: "abc" })], []);
      expect(r.csrfField).toEqual({ name: "csrf_token", value: "abc" });
    });

    it("detects by name containing '_token'", () => {
      const r = analyzeLoginForm([inp({ name: "_token", value: "xyz" })], []);
      expect(r.csrfField).toEqual({ name: "_token", value: "xyz" });
    });

    it("sets empty value when absent", () => {
      const r = analyzeLoginForm([inp({ name: "csrf" })], []);
      expect(r.csrfField).toEqual({ name: "csrf", value: "" });
    });
  });

  describe("captcha detection", () => {
    it("detects by name='captcha' with type='text'", () => {
      expect(analyzeLoginForm([inp({ type: "text", name: "captcha" })], []).captchaRequired).toBe(true);
    });

    it("detects by name='vercode' with type='number'", () => {
      expect(analyzeLoginForm([inp({ type: "number", name: "vercode" })], []).captchaRequired).toBe(true);
    });

    it("detects by placeholder='验证码'", () => {
      expect(analyzeLoginForm([inp({ type: "text", placeholder: "验证码" })], []).captchaRequired).toBe(true);
    });

    it("does not flag password field", () => {
      expect(analyzeLoginForm([inp({ type: "password" })], []).captchaRequired).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns defaults for empty input", () => {
      const r = analyzeLoginForm([], []);
      expect(r.formAction).toBe("");
      expect(r.method).toBe("POST");
      expect(r.paramMap).toEqual({ username: "username", password: "password" });
      expect(r.captchaRequired).toBe(false);
      expect(r.rawRequests).toEqual([]);
    });

    it("ignores non-input, non-form elements", () => {
      const r = analyzeLoginForm(
        [
          { selector: "button", tagName: "button", attributes: { type: "submit" } },
          { selector: "div", tagName: "div", attributes: { class: "wrapper" } },
        ],
        [],
      );
      expect(r.paramMap.username).toBe("username");
      expect(r.paramMap.password).toBe("password");
    });

    it("rawRequests contains filtered API requests", () => {
      const r = analyzeLoginForm([], [req("https://example.com/api/login", "POST"), req("https://example.com/app.js")]);
      expect(r.rawRequests).toHaveLength(1);
      expect(r.rawRequests[0].url).toContain("/api/");
    });
  });
});

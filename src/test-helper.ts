/**
 * 测试兼容层 —— 消除 Bun 与 Jest 之间的运行时差异
 *
 * Bun 1.3 缺失的 Jest API 及替代方案：
 * - jest.requireActual → 用 require() 替代（Bun 中无 hoisting 冲突）
 * - jest.spyOn(obj, prop, 'get') → 用 Object.defineProperty 替代
 */

/** 兼容 jest.requireActual：加载模块的真实实现（绕过 mock） */
export function requireActual(modulePath: string): unknown {
  if (typeof jest !== "undefined" && typeof jest.requireActual !== "undefined") {
    return jest.requireActual(modulePath);
  }
  // Bun: jest.requireActual 未实现，直接用 require
  // 在 Bun 的 jest.mock factory 中 require() 返回原始模块而非 mock 后的版本
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulePath);
}

/** 兼容 getter 属性的 spyOn */
export function spyOnGetter<T extends object>(obj: T, prop: keyof T, mockValue: T[keyof T]): { mockRestore: () => void } {
  if (typeof jest !== "undefined" && typeof jest.spyOn !== "undefined") {
    try {
      const s = jest.spyOn(obj, prop as string, "get") as any;
      s.mockReturnValue(mockValue);
      return s;
    } catch {
      // Bun: 不支持访问器属性 spyOn，降级到 defineProperty
    }
  }
  const desc = Object.getOwnPropertyDescriptor(obj, prop as string) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), prop as string);
  if (!desc) throw new Error(`Cannot spyOn getter: '${String(prop)}' has no property descriptor`);
  Object.defineProperty(obj, prop as string, { get: () => mockValue, configurable: true });
  return { mockRestore: () => Object.defineProperty(obj, prop as string, desc) };
}

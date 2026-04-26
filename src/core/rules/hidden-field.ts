import { ElementItem } from "../models";

export const HIDDEN_FIELD_KEYWORDS = [
  "csrf", "token", "verify", "vcode", "captcha",
  "sign", "ticket", "nonce", "timestamp", "random", "uuid"
];

export function filterHiddenFields(elements: ElementItem[]): ElementItem[] {
  return elements.filter(item => {
    const isHidden = item.attributes.type === "hidden"
      || item.attributes.style?.includes("display:none")
      || Reflect.has(item.attributes, "hidden");

    const name = (item.attributes.name || "").toLowerCase();
    const hasKey = HIDDEN_FIELD_KEYWORDS.some(k => name.includes(k));
    return isHidden || hasKey;
  });
}
import { filterHiddenFields } from "./hidden-field";
import { ElementItem } from "../models";

function makeEl(overrides: Partial<ElementItem> = {}): ElementItem {
  return {
    selector: "#test",
    tagName: "input",
    attributes: {},
    ...overrides,
  };
}

describe("filterHiddenFields", () => {
  it("returns elements with type=hidden", () => {
    const el = makeEl({ attributes: { type: "hidden", name: "csrf_token" } });
    expect(filterHiddenFields([el])).toHaveLength(1);
  });

  it("returns elements with display:none style", () => {
    const el = makeEl({ attributes: { style: "display:none", name: "secret" } });
    expect(filterHiddenFields([el])).toHaveLength(1);
  });

  it("returns elements with hidden attribute", () => {
    const el = makeEl({ attributes: { hidden: "", name: "tracking" } });
    expect(filterHiddenFields([el])).toHaveLength(1);
  });

  it("returns elements whose name matches security keywords", () => {
    const keywords = ["csrf", "token", "captcha", "verify", "sign", "nonce", "uuid"];
    for (const kw of keywords) {
      const el = makeEl({ attributes: { name: kw } });
      expect(filterHiddenFields([el])).toHaveLength(1);
    }
  });

  it("excludes visible input fields", () => {
    const el = makeEl({ attributes: { type: "text", name: "username" } });
    expect(filterHiddenFields([el])).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterHiddenFields([])).toHaveLength(0);
  });

  it("handles mixed elements correctly", () => {
    const elements = [
      makeEl({ selector: "#hidden1", attributes: { type: "hidden", name: "_token" } }),
      makeEl({ selector: "#visible", attributes: { type: "text", name: "email" } }),
      makeEl({ selector: "#hidden2", attributes: { name: "csrf_token" } }),
    ];
    const result = filterHiddenFields(elements);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.selector)).toEqual(["#hidden1", "#hidden2"]);
  });

  it("matches keywords in name with case variation", () => {
    const el = makeEl({ attributes: { name: "CSRF_TOKEN" } });
    expect(filterHiddenFields([el])).toHaveLength(1);
  });

  it("handles element with no name attribute", () => {
    const el = makeEl({ attributes: { type: "hidden" } });
    expect(filterHiddenFields([el])).toHaveLength(1);
  });
});

import { TikTokCrawler } from "../TikTokCrawler";

describe("TikTokCrawler.extractIdsFromPageData", () => {
  let crawler: TikTokCrawler;

  beforeEach(() => {
    crawler = new TikTokCrawler();
  });

  it("extracts video IDs and author IDs from ItemModule", () => {
    const raw = JSON.stringify({
      ItemModule: {
        "123456789": { author: { uniqueId: "testuser" }, desc: "Test video" },
        "987654321": { author: { uniqueId: "anotheruser" }, desc: "Another" },
      },
    });
    const result = (crawler as any).extractIdsFromPageData(raw);
    expect(result.videoIds).toContain("123456789");
    expect(result.videoIds).toContain("987654321");
    expect(result.uniqueIds).toContain("testuser");
    expect(result.uniqueIds).toContain("anotheruser");
  });

  it("extracts from SIGI_STATE wrapper", () => {
    const raw = JSON.stringify({
      SIGI_STATE: {
        ItemModule: {
          "111": { author: { uniqueId: "user1" } },
        },
      },
    });
    const result = (crawler as any).extractIdsFromPageData(raw);
    expect(result.videoIds).toContain("111");
    expect(result.uniqueIds).toContain("user1");
  });

  it("extracts from UserModule", () => {
    const raw = JSON.stringify({
      UserModule: {
        users: {
          "u1": { uniqueId: "profileuser" },
        },
      },
    });
    const result = (crawler as any).extractIdsFromPageData(raw);
    expect(result.uniqueIds).toContain("profileuser");
  });

  it("extracts from __UNIVERSAL_DATA_FOR_LAYOUT__ search results", () => {
    const raw = JSON.stringify({
      __UNIVERSAL_DATA_FOR_LAYOUT__: {
        __DEFAULT_SCOPE__: {
          webapp: {
            search: {
              default: {
                modules: [{
                  moduleList: [{
                    item: { id: "vid789", author: { uniqueId: "searchuser" } },
                  }],
                }],
              },
            },
          },
        },
      },
    });
    const result = (crawler as any).extractIdsFromPageData(raw);
    expect(result.videoIds).toContain("vid789");
    expect(result.uniqueIds).toContain("searchuser");
  });

  it("returns empty arrays for invalid JSON", () => {
    const result = (crawler as any).extractIdsFromPageData("not json");
    expect(result.videoIds).toEqual([]);
    expect(result.uniqueIds).toEqual([]);
  });

  it("deduplicates IDs", () => {
    const raw = JSON.stringify({
      ItemModule: {
        "vid1": { author: { uniqueId: "user1" } },
        "vid2": { author: { uniqueId: "user1" } }, // same user, different video
      },
    });
    const result = (crawler as any).extractIdsFromPageData(raw);
    expect(result.videoIds).toHaveLength(2);
    expect(result.uniqueIds).toHaveLength(1);
  });
});

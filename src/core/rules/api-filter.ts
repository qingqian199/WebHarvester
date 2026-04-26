import { NetworkRequest } from "../models";

export const API_PATH_KEYWORDS = [
  "/api/", "/ajax/", "/v1/", "/v2/", "/v3/", "/rest/",
  "/graphql", "/rpc/", "/biz/", "/user/", "/auth/"
];

export const STATIC_ASSET_SUFFIX = [
  ".js", ".css", ".png", ".jpg", ".jpeg", ".gif",
  ".svg", ".woff", ".ttf", ".ico", ".mp4", ".mp3"
];

export function isStaticAsset(url: string): boolean {
  return STATIC_ASSET_SUFFIX.some(s => url.toLowerCase().endsWith(s));
}

export function filterApiRequests(list: NetworkRequest[]): NetworkRequest[] {
  return list.filter(item => {
    const u = item.url.toLowerCase();
    if (isStaticAsset(u)) return false;
    return API_PATH_KEYWORDS.some(p => u.includes(p));
  });
}
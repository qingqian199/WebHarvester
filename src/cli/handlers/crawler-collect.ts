import fs from "fs/promises";
import path from "path";
import { CliDeps, CliAction } from "../types";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { XhsCrawler, XhsApiEndpoints, XhsFallbackEndpoints } from "../../adapters/crawlers/XhsCrawler";
import { XHS_CONTENT_UNITS, ZHIHU_CONTENT_UNITS, BILI_CONTENT_UNITS, TT_CONTENT_UNITS, BOSS_CONTENT_UNITS, UnitResult } from "../../core/models/ContentUnit";
import { formatUnitResults } from "../../utils/formatter";
import { exportResultsToXlsx } from "../../utils/exporter/xlsx-exporter";
import { resolveBilibiliUrl, resolveZhihuUrl, resolveXiaohongshuUrl, resolveTikTokUrl } from "../../utils/url-resolver";
import { extractWbiKey } from "../../utils/crypto/bilibili-signer";
import biliFetch from "node-fetch";
import { BilibiliCrawler } from "../../adapters/crawlers/BilibiliCrawler";
import { ISiteCrawler, CrawlerSession } from "../../core/ports/ISiteCrawler";
import { ContentUnitDef } from "../../core/models/ContentUnit";
import { coloredLog, createProgressBar } from "../../utils/cli-ui";

export async function handleCrawlerCollect(deps: CliDeps, action: CliAction): Promise<void> {
  const crawler = deps.dispatcher.dispatch(action.url || "");
  if (!crawler) { console.log("❌ 无匹配的特化爬虫"); return; }

  const { default: inq } = await import("inquirer");
  const sm = new FileSessionManager();
  const allProfiles = await sm.listProfiles();
  const profileChoices = [
    { name: "🌐 游客态（不使用登录态）", value: "" },
    ...allProfiles.map((p) => ({ name: `📂 ${p}`, value: p })),
  ];
  const { chosenProfile } = await inq.prompt([{ type: "list", name: "chosenProfile", message: "选择登录会话：", choices: profileChoices }]);

  let session: import("../../core/ports/ISiteCrawler").CrawlerSession | undefined;
  if (chosenProfile) {
    const s = await sm.load(chosenProfile);
    if (s) session = { cookies: s.cookies, localStorage: s.localStorage };
  }

  if (crawler.name === "bilibili" && session?.localStorage) {
    const ls = session.localStorage;
    const imgKey = ls.wbi_img_url ? extractWbiKey(ls.wbi_img_url) : "4932caff0ff746eab6f01bf08b70ac45";
    const subKey = ls.wbi_sub_url ? extractWbiKey(ls.wbi_sub_url) : "4932caff0ff746eab6f01bf08b70ac45";
    (crawler as BilibiliCrawler).setWbiKeys(imgKey, subKey);
  }

  try {
    const contentUnits = (crawler.name === "xiaohongshu") ? XHS_CONTENT_UNITS
      : (crawler.name === "zhihu") ? ZHIHU_CONTENT_UNITS
      : (crawler.name === "bilibili") ? BILI_CONTENT_UNITS
      : (crawler.name === "tiktok") ? TT_CONTENT_UNITS
      : (crawler.name === "boss_zhipin") ? BOSS_CONTENT_UNITS : null;

    if (contentUnits && contentUnits.length > 0) {
      const { mode } = await inq.prompt([{ type: "list", name: "mode", message: "选择采集模式：", choices: [
        { name: "📦 组合采集（推荐）", value: "units" },
        { name: "🔧 高级：自定义端点", value: "advanced" },
      ]}]);

      if (mode === "units") return handleUnitsMode(crawler, contentUnits, action, session, deps);

      return handleAdvancedMode(crawler, action, session, deps);
    }

    const result = await crawler.fetch(action.url || "", session);
    console.log(`\n✅ ${crawler.name} 采集完成`);
    console.log(`   状态码: ${result.statusCode}`);
    console.log(`   耗时: ${result.responseTime}ms`);
    console.log(`   正文长度: ${result.body.length} 字符`);
    const outDir = path.resolve("output", crawler.name);
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${crawler.name}-${Date.now()}.json`);
    await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
    console.log(`   已保存: ${outFile}`);
  } catch (e) {
    deps.logger.error(`${crawler.name} 采集失败`, { err: (e as Error).message });
    console.log("❌ 采集失败:", (e as Error).message);
  }
}

async function handleUnitsMode(crawler: ISiteCrawler, contentUnits: readonly ContentUnitDef[], action: CliAction, session: CrawlerSession | undefined, _deps: CliDeps): Promise<void> {
  const { default: inq } = await import("inquirer");
  const unitChoices = contentUnits.map((u) => ({
    name: `${u.label} — ${u.description}`, value: u.id, checked: false,
  }));
  const { selectedUnits } = await inq.prompt([{
    type: "checkbox", name: "selectedUnits", message: "选择要采集的内容（空格切换选中，回车确认）：",
    choices: unitChoices,
  }]);
  if (selectedUnits.length === 0) { console.log("⚠️ 未选择任何内容单元"); return; }

  const neededParams = new Set<string>();
  selectedUnits.forEach((u: string) => {
    const def = contentUnits.find((d: any) => d.id === u);
    def?.requiredParams.forEach((p: string) => neededParams.add(p));
  });
  const userParams: Record<string, string> = { url: action.url || "" };

  let resolved: Record<string, string> = {};
  if (crawler.name === "bilibili") resolved = resolveBilibiliUrl(action.url || "");
  else if (crawler.name === "zhihu") resolved = resolveZhihuUrl(action.url || "");
  else if (crawler.name === "xiaohongshu") resolved = resolveXiaohongshuUrl(action.url || "");
  else if (crawler.name === "tiktok") resolved = resolveTikTokUrl(action.url || "");

  if (resolved.bvid && !resolved.aid) {
    try {
      const r = await biliFetch("https://api.bilibili.com/x/web-interface/view?bvid=" + resolved.bvid);
      const d: { data?: { aid?: number; owner?: { mid?: number } } } = await r.json();
      if (d.data?.aid) resolved.aid = String(d.data.aid);
      if (d.data?.owner?.mid) resolved.mid = String(d.data.owner.mid);
    } catch (e) {
      console.log("⚠️ BV 转换失败:", (e as Error).message);
    }
  }

  for (const [k, v] of Object.entries(resolved)) {
    if (v && !userParams[k]) userParams[k] = v;
  }
  for (const p of neededParams) {
    if (!userParams[p]) {
      const { val } = await inq.prompt([{ type: "input", name: "val", message: `请输入 ${p}：` }]);
      userParams[p] = val;
    }
  }

  coloredLog("info", `正在组合采集 ${selectedUnits.length} 个内容单元...`);
  const pb = createProgressBar(selectedUnits.length, "采集进度");
  const results: UnitResult<unknown>[] = await (crawler as BilibiliCrawler | XhsCrawler).collectUnits(selectedUnits, userParams, session);
  pb.update(selectedUnits.length);
  pb.stop();

  const timestamp = Date.now();
  const outDir = path.resolve("output", crawler.name);
  await fs.mkdir(outDir, { recursive: true });
  const jsonFile = path.join(outDir, `combined-${timestamp}.json`);
  await fs.writeFile(jsonFile, JSON.stringify(results, null, 2), "utf-8");
  const xlsxBuf = exportResultsToXlsx(results);
  const xlsxFile = path.join(outDir, `combined-${timestamp}.xlsx`);
  await fs.writeFile(xlsxFile, xlsxBuf);
  console.log(formatUnitResults(results));
  console.log(`\n📁 JSON: ${jsonFile}`);
  console.log(`📊 Excel: ${xlsxFile}`);
}

async function handleAdvancedMode(crawler: ISiteCrawler, action: CliAction, session: CrawlerSession | undefined, deps: CliDeps): Promise<void> {
  const { default: inq } = await import("inquirer");
  const statusIcon = (s: string) => s === "verified" ? "✅" : s === "risk_ctrl" ? "⛔" : "🔶";
  const statusText = (s: string) => s === "verified" ? "" : s === "risk_ctrl" ? "(风控)" : "(签名待优化)";
  const sigChoices = XhsApiEndpoints.map((e) => ({
    name: `${statusIcon(e.status ?? "sig_pending")} ${e.name} ${statusText(e.status ?? "sig_pending")}`.trim(),
    value: `sig:${e.name}`,
  }));
  const fallbackChoices = XhsFallbackEndpoints.map((e: { name: string }) => ({
    name: `🟠 ${e.name} (页面提取)`, value: `fb:${e.name}`,
  }));
  const choices = [
    { name: "━━━ 签名直连 ━━━", value: "__sep1__", disabled: true },
    ...sigChoices,
    { name: "━━━ 兜底：页面 HTML 提取 ━━━", value: "__sep2__", disabled: true },
    ...fallbackChoices,
  ];

  const { selected } = await inq.prompt([{ type: "list", name: "selected", message: "选择端点：", choices }]);

  if (selected.startsWith("sig:")) {
    const epName = selected.slice(4);
    const ep = XhsApiEndpoints.find((e) => e.name === epName);
    if (ep?.status === "risk_ctrl") {
      console.log("\n⛔ 注意：该端点可能触发风控（code 300011）");
      console.log("建议：稍后重试、更换账号，或使用页面提取兜底方案\n");
    }
    let paramsStr = ep?.params ?? "";
    if (ep?.params) {
      const { p } = await inq.prompt([{ type: "input", name: "p", message: "查询参数（留空默认）：", default: ep.params }]);
      paramsStr = p;
    }
    const paramsRecord: Record<string, string> = {};
    paramsStr.split("&").filter(Boolean).forEach((pair) => {
      const [k, ...vs] = pair.split("=");
      if (k) paramsRecord[k] = decodeURIComponent(vs.join("="));
    });

    let authMode: "logged_in" | "guest" = "logged_in";
    if (crawler.name === "xiaohongshu") {
      const { mode } = await inq.prompt([{ type: "list", name: "mode", message: "认证模式：", choices: [
        { name: "🔐 已登录（使用完整 session）", value: "logged_in" },
        { name: "🌐 游客态（仅设备标识）", value: "guest" },
      ]}]);
      authMode = mode;
    }

    const result = await (crawler as XhsCrawler).fetchApi(epName, paramsRecord, session, authMode);
    const outDir = path.resolve("output", crawler.name);
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${crawler.name}-${epName}-${Date.now()}.json`);
    await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
    console.log(`\n✅ ${crawler.name} - ${epName} (签名直连)`);
    console.log(`   耗时: ${result.responseTime}ms`);
    console.log(`   已保存: ${outFile}`);
    if (result.headers["content-type"]?.includes("json")) {
      const body = JSON.parse(result.body);
      console.log(`   响应: code=${body.code} ${body.msg || ""}`);
      if (body.code === 0 || body.code === 1000) {
        console.log(`   数据预览: ${JSON.stringify(body.data).slice(0, 300)}`);
      }
    }
  } else if (selected.startsWith("fb:")) {
    const fbName = selected.slice(3);
    const { params: userParams } = await inq.prompt([{ type: "input", name: "params", message: "请输入参数（如 keyword=原神）：" }]);
    const paramsRecord: Record<string, string> = {};
    userParams.split("&").filter(Boolean).forEach((pair: string) => {
      const [k, ...vs] = pair.split("=");
      if (k) paramsRecord[k] = decodeURIComponent(vs.join("="));
    });
    try {
      const result = await (crawler as XhsCrawler).fetchPageData(fbName, paramsRecord, session);
      const outDir = path.resolve("output", crawler.name);
      await fs.mkdir(outDir, { recursive: true });
      const outFile = path.join(outDir, `${crawler.name}-${fbName}-${Date.now()}.json`);
      await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
      console.log(`\n✅ ${crawler.name} - ${fbName} (页面提取)`);
      console.log(`   耗时: ${result.responseTime}ms`);
      console.log(`   已保存: ${outFile}`);
      try {
        const parsed = JSON.parse(result.body);
        console.log(`   提取数据预览: ${JSON.stringify(parsed).slice(0, 500)}`);
      } catch { console.log(`   原始数据: ${result.body.slice(0, 300)}`); }
    } catch (e: any) {
      deps.logger.error("页面提取失败", { err: e.message });
      console.log("❌ 页面提取失败:", e.message);
    }
  }
}

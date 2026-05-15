import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { IStorageAdapter } from "../core/ports/IStorageAdapter";
import { HarvestResult } from "../core/models";
import { getSafeDomainName } from "../utils/batch-loader";

const DB_PATH = path.resolve("data/harvester.db");

export interface QueryFilter {
  domain?: string;
  taskName?: string;
  timeStart?: string;
  timeEnd?: string;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  trace_id: string;
  domain: string;
  task_name: string;
  data: any;
  created_at: string;
}

/**
 * SQLite 存储适配器。
 *
 * - 将采集结果的元数据（domain、taskName、traceId）和完整 JSON 存入 SQLite
 * - 提供 query() 方法按条件检索
 * - 与 FileStorageAdapter 互补（文件存完整报告，SQLite 存结构化索引）
 */
export class SqliteStorageAdapter implements IStorageAdapter {
  private db: Database.Database;
  private ready: Promise<void>;

  constructor(dbPath?: string) {
    const finalPath = dbPath ?? DB_PATH;
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL");
    this.ready = this.initSchema();
  }

  private async initSchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        trace_id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        task_name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_results_domain_created
        ON results(domain, created_at);
    `);
  }

  async save(result: HarvestResult, _outputFormat?: string): Promise<void> {
    await this.ready;
    const domain = getSafeDomainName(result.targetUrl);
    const taskName = _outputFormat ?? "full_capture";
    const data = JSON.stringify(result);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO results (trace_id, domain, task_name, data, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(result.traceId, domain, taskName, data);
  }

  /**
   * 按条件查询采集结果。
   * 返回匹配行的 data JSON 解析后的对象，支持分页。
   */
  query(filters: QueryFilter = {}): QueryResult[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.domain) {
      conditions.push("domain = ?");
      params.push(filters.domain);
    }
    if (filters.taskName) {
      conditions.push("task_name = ?");
      params.push(filters.taskName);
    }
    if (filters.timeStart) {
      conditions.push("created_at >= ?");
      params.push(filters.timeStart);
    }
    if (filters.timeEnd) {
      conditions.push("created_at <= ?");
      params.push(filters.timeEnd);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const stmt = this.db.prepare(`
      SELECT trace_id, domain, task_name, data, created_at
      FROM results
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(...params, limit, offset) as any[];

    return rows.map((row) => ({
      trace_id: row.trace_id,
      domain: row.domain,
      task_name: row.task_name,
      data: JSON.parse(row.data),
      created_at: row.created_at,
    }));
  }

  /** 获取总记录数（可选带 domain 过滤）。 */
  count(domain?: string): number {
    if (domain) {
      const row = this.db.prepare("SELECT COUNT(*) as cnt FROM results WHERE domain = ?").get(domain) as any;
      return row?.cnt ?? 0;
    }
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM results").get() as any;
    return row?.cnt ?? 0;
  }

  close(): void {
    this.db.close();
  }
}

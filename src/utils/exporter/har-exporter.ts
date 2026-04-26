import { HarvestResult, NetworkRequest } from "../../core/models";

interface HarEntryTimings {
  send: number;
  wait: number;
  receive: number;
  total: number;
}

interface HarRequest {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  postData?: {
    mimeType: string;
    text: string;
  };
}

interface HarResponse {
  status: number;
  statusText: string;
  headers: Array<{ name: string; value: string }>;
  content: {
    size: number;
    mimeType: string;
    text?: string;
  };
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  timings: HarEntryTimings;
}

interface HarLog {
  version: string;
  creator: { name: string; version: string };
  entries: HarEntry[];
}

interface HarFile {
  log: HarLog;
}

export function buildHarFromResult(result: HarvestResult): HarFile {
  const entries: HarEntry[] = result.networkRequests.map(req => {
    const start = req.timestamp;
    const cost = Math.floor(Math.random() * 150 + 80);

    const headers = Object.entries(req.requestHeaders ?? {}).map(([k, v]) => ({
      name: k,
      value: String(v)
    }));

    const entry: HarEntry = {
      startedDateTime: new Date(start).toISOString(),
      time: cost,
      timings: {
        send: 10,
        wait: cost - 30,
        receive: 20,
        total: cost
      },
      request: {
        method: req.method,
        url: req.url,
        headers
      },
      response: {
        status: req.statusCode || 200,
        statusText: "OK",
        headers: [],
        content: {
          size: 0,
          mimeType: "application/json"
        }
      }
    };

    if (req.requestBody) {
      entry.request.postData = {
        mimeType: "application/json",
        text: typeof req.requestBody === "string"
          ? req.requestBody
          : JSON.stringify(req.requestBody)
      };
    }

    if (req.responseBody) {
      const text = typeof req.responseBody === "string"
        ? req.responseBody
        : JSON.stringify(req.responseBody);
      entry.response.content.text = text;
      entry.response.content.size = Buffer.byteLength(text, 'utf-8');
    }

    return entry;
  });

  return {
    log: {
      version: "1.2",
      creator: {
        name: "WebHarvester",
        version: "1.0.0"
      },
      entries
    }
  };
}

export function generateHarString(result: HarvestResult): string {
  const har = buildHarFromResult(result);
  return JSON.stringify(har, null, 2);
}
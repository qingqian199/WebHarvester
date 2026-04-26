export interface LightHttpResult {
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  finalUrl: string;
  responseTime: number;
}

export interface ILightHttpEngine {
  fetch(url: string): Promise<LightHttpResult>;
}

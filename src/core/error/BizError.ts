import { ErrorCode } from "./ErrorCode";

export class BizError extends Error {
  public readonly code: ErrorCode;
  public readonly bizMsg: string;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.bizMsg = message;
    this.name = "BizError";
  }
}

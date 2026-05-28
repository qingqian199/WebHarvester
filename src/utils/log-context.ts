import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";

export interface LogContext { traceId: string; module?: string; }
const als = new AsyncLocalStorage<LogContext>();

export function generateTraceId(): string { return crypto.randomBytes(8).toString("hex"); }

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T { return als.run(ctx, fn); }

export function getTraceId(): string { return als.getStore()?.traceId ?? ""; }

export function getLogContext(): LogContext | undefined { return als.getStore(); }

export function setModule(name: string): void { const ctx = als.getStore(); if (ctx) ctx.module = name; }

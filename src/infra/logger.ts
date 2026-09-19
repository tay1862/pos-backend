import type { AppConfig } from "../config";

type LogLevel = AppConfig["LOG_LEVEL"];

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel): Logger {
  const write = (entryLevel: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    if (levelWeight[entryLevel] < levelWeight[level]) return;

    const payload = {
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...redact(fields)
    };

    const line = JSON.stringify(payload);
    if (entryLevel === "error") {
      console.error(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields)
  };
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (/password|token|secret|session|cookie/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = value;
    }
  }

  return output;
}

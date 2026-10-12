import pino from "pino";

const redactPaths = [
  "req.headers.authorization",
  "req.body.password",
  "req.body.email",
  "req.body.phone",
  "res.headers[\"set-cookie\"]",
];

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  transport: process.env.NODE_ENV !== "production" ? {
    target: "pino-pretty",
    options: { colorize: true },
  } : undefined,
});

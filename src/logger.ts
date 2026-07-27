/**
 * Logger setup using pino.
 *
 * Outputs JSON-structured logs to:
 *   - <logDir>/<name>.log      (all levels)
 *   - <logDir>/<name>.err.log  (errors only)
 *   - stdout                   (info+)
 */

import pino, { Logger } from "pino";
import fs from "fs";
import path from "path";

export function createLogger(
  logDir: string,
  name: string,
  level: string,
): Logger {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  return pino({
    level,
    transport: {
      targets: [
        {
          target: "pino/file",
          options: { destination: path.join(logDir, `${name}.log`) },
          level,
        },
        {
          target: "pino/file",
          options: { destination: path.join(logDir, `${name}.err.log`) },
          level: "error",
        },
        {
          target: "pino/file",
          options: { destination: 1 }, // stdout (fd 1)
          level,
        },
      ],
    },
  });
}

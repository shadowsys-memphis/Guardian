import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin and server-to-server requests (no Origin header),
      // all Replit dev/deployment domains, and local dev servers.
      if (
        !origin ||
        origin.endsWith(".replit.dev") ||
        origin.endsWith(".replit.app") ||
        origin.endsWith(".repl.co") ||
        origin === "http://localhost:5173" ||
        origin === "http://127.0.0.1:5173" ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:23920" ||
        origin === process.env["VITE_PUBLIC_SITE_URL"]
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "15mb",
    // Captures the exact raw bytes onto req.rawBody so the ElevenLabs webhook
    // route (routes/jessica.ts) can verify its HMAC signature against what
    // was actually sent on the wire — re-serializing the parsed JSON body
    // can reorder keys/whitespace and silently break signature verification.
    // See lib/webhook-auth.ts.
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

export default app;

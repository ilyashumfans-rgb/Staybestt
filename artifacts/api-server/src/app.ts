import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { AuthResolutionError } from "./lib/auth";

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
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// Razorpay signs the exact request bytes. This route must be mounted before
// express.json() so the webhook handler can verify the raw body.
app.use("/api/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Express 5 forwards rejected async middleware/handlers here. Keep auth
// failures typed and deliberately free of provider errors, ids, emails, or
// session material.
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof AuthResolutionError) {
    req.log?.warn?.(
      {
        reason: error.reason,
        cookiePresent: Boolean(req.headers.cookie),
        authAuthenticated: error.authenticated,
      },
      "Authentication request rejected",
    );
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  next(error);
});

export default app;

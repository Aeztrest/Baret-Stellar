import { loadConfig } from "./config/index.js";
import { buildApp } from "./app.js";

const config = loadConfig();

if (config.nodeEnv === "production") {
  const hasKeys = config.apiKeys.length > 0;
  const hasX402 = config.x402.enabled && config.x402.payTo.length > 0;
  if (!hasKeys && !hasX402) {
    throw new Error(
      "Production requires DELTAG_API_KEYS and/or X402_ENABLED with X402_PAY_TO",
    );
  }
}

const app = await buildApp(config);

await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info({ port: config.port }, "DeltaG server listening");

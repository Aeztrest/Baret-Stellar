import http from "node:http";
import https from "node:https";
import { loadConfig } from "./config/index.js";
import { buildApp } from "./app.js";

// The Horizon + Soroban RPC clients (both axios-based) default to Node's
// global http/https agents, which don't keep connections alive by
// default — every analyze call was paying a fresh TCP+TLS handshake to
// the same two hosts it had already talked to moments earlier. This is
// the single biggest lever on tail latency that isn't touched by
// anything analysis-depth related: measured locally, a cold connection
// took ~2.8s vs ~150-850ms once a connection was warm. Set once, for the
// life of the process, before anything makes its first outbound call.
http.globalAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
https.globalAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

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

/**
 * DEJOIY AI Gateway — entrypoint.
 */
import { configSummary, loadConfig } from "./config.js";
import { createProviders } from "./providers/index.js";
import { ModelRouter } from "./router/router.js";
import { createApp } from "./gateway/app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  console.log("[gateway] config:", JSON.stringify(configSummary(config)));

  const providers = createProviders(config);
  if (providers.size === 0) {
    console.warn(
      "[gateway] WARNING: no providers enabled — all requests will fail. " +
        "Enable at least one via <PROVIDER>_ENABLED=true",
    );
  }

  const router = new ModelRouter(providers, config);
  router.start();

  const app = createApp(router, config);
  const server = app.listen(config.port, config.host, () => {
    console.log(`[gateway] listening on http://${config.host}:${config.port}`);
    console.log(`[gateway] dashboard: http://${config.host}:${config.port}/dashboard`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[gateway] ${signal} received, shutting down...`);
    server.close();
    await router.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});

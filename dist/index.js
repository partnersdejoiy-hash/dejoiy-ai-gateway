"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * DEJOIY AI Gateway — entrypoint.
 */
const config_js_1 = require("./config.js");
const index_js_1 = require("./providers/index.js");
const router_js_1 = require("./router/router.js");
const app_js_1 = require("./gateway/app.js");
async function main() {
    const config = (0, config_js_1.loadConfig)();
    console.log("[gateway] config:", JSON.stringify((0, config_js_1.configSummary)(config)));
    const providers = (0, index_js_1.createProviders)(config);
    if (providers.size === 0) {
        console.warn("[gateway] WARNING: no providers enabled — all requests will fail. " +
            "Enable at least one via <PROVIDER>_ENABLED=true");
    }
    const router = new router_js_1.ModelRouter(providers, config);
    router.start();
    const app = (0, app_js_1.createApp)(router, config);
    const server = app.listen(config.port, config.host, () => {
        console.log(`[gateway] listening on http://${config.host}:${config.port}`);
        console.log(`[gateway] dashboard: http://${config.host}:${config.port}/dashboard`);
    });
    const shutdown = async (signal) => {
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
//# sourceMappingURL=index.js.map
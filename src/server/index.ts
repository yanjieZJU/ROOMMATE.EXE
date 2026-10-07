import { createApp } from "./app";
import { loadRuntimeConfig } from "./config";

const config = loadRuntimeConfig();
const app = createApp({ config });

try {
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`ROOMMATE.EXE server listening on http://127.0.0.1:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

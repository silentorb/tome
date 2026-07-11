import { startTomeServer } from "./start";

const runtime = await startTomeServer();
const shutdown = async () => {
  await runtime.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { setStandaloneNavigationHandler } from "../src/webview/node-links";
import { resetStandaloneChromeNavigation } from "../src/webview/standalone-navigation";

// Register at module load (not beforeAll) so @testing-library/dom's `screen`
// binds to a real document when test files import it.
// Do not static-import @testing-library/* here — that binds `screen` before happy-dom exists.
GlobalRegistrator.register({ url: "http://127.0.0.1:5173/" });

// Load cleanup after the document exists (top-level await — not inside afterEach).
const { cleanup } = await import("@testing-library/react");

afterEach(async () => {
  // Unmount React trees first — body.replaceChildren alone desyncs React from the DOM
  // and leaves PageTitle timers fighting the next test (CI removeChild flakes).
  cleanup();
  setStandaloneNavigationHandler(null);
  resetStandaloneChromeNavigation();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "http://127.0.0.1:5173/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

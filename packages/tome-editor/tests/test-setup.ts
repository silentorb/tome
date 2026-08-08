import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { setStandaloneNavigationHandler } from "../src/webview/node-links";
import { resetStandaloneChromeNavigation } from "../src/webview/standalone-navigation";

// Register at module load (not beforeAll) so @testing-library/dom's `screen`
// binds to a real document when test files import it.
GlobalRegistrator.register({ url: "http://127.0.0.1:5173/" });

afterEach(async () => {
  // App mounts attach document listeners; body.replaceChildren does not run React unmount.
  setStandaloneNavigationHandler(null);
  resetStandaloneChromeNavigation();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "http://127.0.0.1:5173/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

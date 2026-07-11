import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

// Register at module load (not beforeAll) so @testing-library/dom's `screen`
// binds to a real document when test files import it.
GlobalRegistrator.register({ url: "http://127.0.0.1:5173/" });

afterEach(async () => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "http://127.0.0.1:5173/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

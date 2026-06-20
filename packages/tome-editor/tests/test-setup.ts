import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll } from "bun:test";

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://127.0.0.1:5173/" });
});

afterEach(async () => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "http://127.0.0.1:5173/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

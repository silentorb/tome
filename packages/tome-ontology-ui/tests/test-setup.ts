import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register({ url: "http://127.0.0.1:5173/" });

afterEach(async () => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "http://127.0.0.1:5173/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

import { describe, expect, test } from "bun:test";
import { ClientEditorPageBlockHost } from "../../src/webview/extensions/client-host";
import {
  buildPageBlockSlashMenu,
  composeBlockEditMenus,
} from "../../src/webview/extensions/page-block-menu";

describe("page-block slash menu", () => {
  test("registers menu items for enabled components", () => {
    const host = new ClientEditorPageBlockHost();
    host.registerPageBlock({
      implementationId: "demo",
      insertDefaultData: () => ({ text: "hello" }),
      Component: () => null,
    });

    const components = [
      {
        id: "ext.demo",
        extensionId: "ext",
        implementationId: "demo",
        label: "Demo block",
        slashMenu: { group: "custom", order: 1 },
      },
    ];

    const buildMenu = composeBlockEditMenus(
      (builder) => {
        builder.getGroup("text").addItem("callout", {
          label: "Callout",
          icon: "",
          onRun: () => {},
        });
      },
      buildPageBlockSlashMenu(components, host),
    );

    const groups = new Map<string, Map<string, { label: string }>>();
    buildMenu({
      getGroup: (name: string) => {
        if (!groups.has(name)) groups.set(name, new Map());
        const group = groups.get(name)!;
        return {
          addItem: (id: string, item: { label: string }) => {
            group.set(id, { label: item.label });
          },
        };
      },
    } as never);

    expect(groups.get("text")?.has("callout")).toBe(true);
    expect(groups.get("custom")?.get("page-block-ext.demo")?.label).toBe("Demo block");
  });
});

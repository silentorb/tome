import { describe, expect, test } from "bun:test";
import {
  buildPageBlockSlashMenu,
  composeBlockEditMenus,
  resolveBlockEditGroup,
} from "../../src/webview/extensions/page-block-menu";

function createCrepeLikeBuilder() {
  const groups = new Map<
    string,
    { label: string; items: Map<string, { label: string }> }
  >();

  return {
    addGroup: (name: string, label: string) => {
      if (!groups.has(name)) {
        groups.set(name, { label, items: new Map() });
      }
      const group = groups.get(name)!;
      return {
        addItem: (id: string, item: { label: string }) => {
          group.items.set(id, { label: item.label });
        },
      };
    },
    getGroup: (name: string) => {
      const group = groups.get(name);
      if (!group) throw new Error(`Group with key ${name} not found`);
      return {
        addItem: (id: string, item: { label: string }) => {
          group.items.set(id, { label: item.label });
        },
      };
    },
    groups,
  };
}

describe("page-block slash menu", () => {
  test("resolveBlockEditGroup adds unknown groups", () => {
    const builder = createCrepeLikeBuilder();
    resolveBlockEditGroup(builder as never, "custom").addItem("demo", {
      label: "Demo",
      icon: "",
      onRun: () => {},
    });

    expect(builder.groups.get("custom")?.items.get("demo")?.label).toBe("Demo");
  });

  test("registers menu items for enabled components", () => {
    const components = [
      {
        id: "ext.demo",
        extensionId: "ext",
        implementationId: "demo",
        label: "Demo block",
        slashMenu: { group: "custom", order: 1 },
        insertDefaultData: { text: "hello" },
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
      buildPageBlockSlashMenu(components),
    );

    const builder = createCrepeLikeBuilder();
    builder.addGroup("text", "Text");
    buildMenu(builder as never);

    expect(builder.groups.get("text")?.items.get("callout")?.label).toBe("Callout");
    expect(builder.groups.get("custom")?.items.get("page-block-ext.demo")?.label).toBe(
      "Demo block",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { dropIndicatorConfig } from "@milkdown/kit/plugin/cursor";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import {
  buildTableSlashMenu,
  installMilkdownKitFeatures,
} from "../../src/webview/milkdown-kit-features";

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

describe("milkdown kit features", () => {
  test("installMilkdownKitFeatures creates an editor with kit cursor and code-block config", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "- item\n\n```ts\nconst x = 1;\n```\n");
      })
      .use(commonmark)
      .use(gfm);
    installMilkdownKitFeatures(editor);
    await editor.create();

    editor.action((ctx) => {
      const drop = ctx.get(dropIndicatorConfig.key);
      expect(drop.class).toBe("crepe-drop-cursor");
      expect(drop.width).toBe(4);
      expect(drop.color).toBe(false);

      const codeConfig = ctx.get(codeBlockConfig.key);
      expect(codeConfig.languages.length).toBeGreaterThan(0);
      expect(codeConfig.extensions.length).toBeGreaterThan(0);

      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.childCount).toBeGreaterThan(0);
    });

    await editor.destroy();
    root.remove();
  });

  test("buildTableSlashMenu registers a Table item on the advanced group", () => {
    const builder = createCrepeLikeBuilder();
    builder.addGroup("advanced", "Advanced");
    buildTableSlashMenu(builder as never);
    expect(builder.groups.get("advanced")?.items.get("table")?.label).toBe("Table");
  });
});

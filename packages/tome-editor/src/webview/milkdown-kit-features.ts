import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import type { Editor } from "@milkdown/kit/core";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  codeBlockComponent,
  codeBlockConfig,
} from "@milkdown/kit/component/code-block";
import { listItemBlockComponent } from "@milkdown/kit/component/list-item-block";
import { tableBlock } from "@milkdown/kit/component/table-block";
import { cursor, dropIndicatorConfig } from "@milkdown/kit/plugin/cursor";
import {
  addBlockTypeCommand,
  clearTextInCurrentBlockCommand,
  selectTextNearPosCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";
import { $prose } from "@milkdown/kit/utils";
import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import { basicSetup } from "codemirror";
import { createVirtualCursor } from "prosemirror-virtual-cursor";

const tableIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8078)">
      <path
        d="M20 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H20C21.1 21 22 20.1 22 19V5C22 3.9 21.1 3 20 3ZM20 5V8H5V5H20ZM15 19H10V10H15V19ZM5 10H8V19H5V10ZM17 19V10H20V19H17Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8078">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`;

/**
 * Cursor, list-item, table, and code-block UI via `@milkdown/kit` (not Crepe features).
 * Call before `editor.create()` / `crepe.create()`.
 */
export function installMilkdownKitFeatures(editor: Editor): void {
  editor
    .config((ctx) => {
      ctx.update(dropIndicatorConfig.key, () => ({
        class: "crepe-drop-cursor",
        width: 4,
        color: false as const,
      }));
    })
    .use(cursor);

  editor.use($prose(() => createVirtualCursor()));

  editor.use(listItemBlockComponent);
  editor.use(tableBlock);

  editor
    .config((ctx) => {
      ctx.update(codeBlockConfig.key, (defaultConfig) => ({
        ...defaultConfig,
        extensions: [
          keymap.of(defaultKeymap.concat(indentWithTab)),
          basicSetup,
          oneDark,
        ],
        languages,
      }));
    })
    .use(codeBlockComponent);
}

/**
 * Restores Crepe’s slash-menu Table item after disabling `Crepe.Feature.Table`
 * (BlockEdit gates that entry on Crepe’s FeaturesCtx).
 */
export const buildTableSlashMenu: NonNullable<BlockEditFeatureConfig["buildMenu"]> = (
  builder,
) => {
  builder.getGroup("advanced").addItem("table", {
    label: "Table",
    icon: tableIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const view = ctx.get(editorViewCtx);
      commands.call(clearTextInCurrentBlockCommand.key);
      const { from } = view.state.selection;
      commands.call(addBlockTypeCommand.key, {
        nodeType: createTable(ctx, 3, 3),
      });
      commands.call(selectTextNearPosCommand.key, {
        pos: from,
      });
    },
  });
};

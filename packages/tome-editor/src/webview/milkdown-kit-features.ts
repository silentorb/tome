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
import {
  listItemBlockComponent,
  listItemBlockConfig,
} from "@milkdown/kit/component/list-item-block";
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

/** Same disc Crepe used — kit default is `⦿`, which reads as a toggle control. */
const bulletIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_952_6527)">
      <circle cx="12" cy="12" r="3" />
    </g>
    <defs>
      <clipPath id="clip0_952_6527">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`;

const checkBoxCheckedIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_1803_1151)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM10.71 16.29C10.32 16.68 9.69 16.68 9.3 16.29L5.71 12.7C5.32 12.31 5.32 11.68 5.71 11.29C6.1 10.9 6.73 10.9 7.12 11.29L10 14.17L16.88 7.29C17.27 6.9 17.9 6.9 18.29 7.29C18.68 7.68 18.68 8.31 18.29 8.7L10.71 16.29Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_1803_1151">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`;

const checkBoxUncheckedIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_1803_535)">
      <path
        d="M18 19H6C5.45 19 5 18.55 5 18V6C5 5.45 5.45 5 6 5H18C18.55 5 19 5.45 19 6V18C19 18.55 18.55 19 18 19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_1803_535">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`;

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

  editor
    .config((ctx) => {
      ctx.set(listItemBlockConfig.key, {
        renderLabel: ({ label, listType, checked }) => {
          if (checked == null) {
            if (listType === "bullet") return bulletIcon;
            return label;
          }
          if (checked) return checkBoxCheckedIcon;
          return checkBoxUncheckedIcon;
        },
      });
    })
    .use(listItemBlockComponent);
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

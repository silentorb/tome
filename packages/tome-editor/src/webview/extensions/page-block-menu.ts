import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  setBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import { serializePageBlock, serializePageBlockInner } from "tome-interfaces/page-block";
import type { PublicExtensionComponent } from "../../shared/extensions";
import { pageBlockEmbedSchema } from "./page-block-embed";
import { scheduleSchemaDiagramMermaidRender } from "./schema-diagram-mermaid";

const pageBlockIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 10h8M8 14h5" />
  </svg>
`;

const EXTENSION_GROUP_LABELS: Record<string, string> = {
  custom: "Custom",
};

type BlockEditMenuBuilder = Parameters<
  NonNullable<BlockEditFeatureConfig["buildMenu"]>
>[0];

/** Crepe only pre-registers built-in groups; extension groups must be added explicitly. */
export function resolveBlockEditGroup(
  builder: BlockEditMenuBuilder,
  groupKey: string,
): ReturnType<BlockEditMenuBuilder["getGroup"]> {
  try {
    return builder.getGroup(groupKey);
  } catch {
    const label =
      EXTENSION_GROUP_LABELS[groupKey] ??
      groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
    return builder.addGroup(groupKey, label);
  }
}

export interface PageBlockSlashMenuOptions {
  prepareEditorBody: (markdown: string) => Promise<string>;
}

function codeBlockRange(ctx: Ctx): { from: number; to: number } | null {
  const view = ctx.get(editorViewCtx);
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "code_block") {
      return { from: $from.before(depth), to: $from.after(depth) };
    }
  }
  return null;
}

export function insertPageBlock(ctx: Ctx, component: PublicExtensionComponent): void {
  const commands = ctx.get(commandsCtx);
  const codeBlock = codeBlockSchema.type(ctx);
  const defaultData = component.insertDefaultData ?? {};
  const inner = serializePageBlockInner(component.id, defaultData);

  commands.call(clearTextInCurrentBlockCommand.key);
  commands.call(setBlockTypeCommand.key, {
    nodeType: codeBlock,
    attrs: { language: "tome-block" },
  });

  const view = ctx.get(editorViewCtx);
  const { $from } = view.state.selection;
  const tr = view.state.tr.insertText(inner, $from.start(), $from.end());
  view.dispatch(tr.scrollIntoView());
}

const PREPARED_EMBED_PREFIX_RE = /^<!-- tome-page-block [\s\S]*? -->\s*/;

function parsePreparedPageBlockEmbed(
  expanded: string,
): { comment: string; html: string } | null {
  const match = expanded.match(PREPARED_EMBED_PREFIX_RE);
  if (!match) return null;
  const comment = match[0].trim();
  const html = expanded.slice(match[0].length).trim();
  if (!html) return null;
  return { comment, html };
}

export async function expandInsertedPageBlock(
  ctx: Ctx,
  component: PublicExtensionComponent,
  options: PageBlockSlashMenuOptions,
): Promise<void> {
  const range = codeBlockRange(ctx);
  if (!range) return;

  const defaultData = component.insertDefaultData ?? {};
  const fence = serializePageBlock(component.id, defaultData);
  const expanded = (await options.prepareEditorBody(fence)).trim();
  const parsed = parsePreparedPageBlockEmbed(expanded);
  if (!parsed) return;

  const view = ctx.get(editorViewCtx);
  const nodeType = pageBlockEmbedSchema.node.type(ctx);
  const node = nodeType.create(parsed);
  view.dispatch(view.state.tr.replaceWith(range.from, range.to, node).scrollIntoView());

  scheduleSchemaDiagramMermaidRender(view.dom);
}

export async function insertPageBlockAndExpand(
  ctx: Ctx,
  component: PublicExtensionComponent,
  options: PageBlockSlashMenuOptions,
): Promise<void> {
  insertPageBlock(ctx, component);
  await expandInsertedPageBlock(ctx, component, options);
}

export function buildPageBlockSlashMenu(
  components: PublicExtensionComponent[],
  options?: PageBlockSlashMenuOptions,
): NonNullable<BlockEditFeatureConfig["buildMenu"]> {
  const sorted = [...components].sort(
    (a, b) => (a.slashMenu?.order ?? 0) - (b.slashMenu?.order ?? 0),
  );

  return (builder) => {
    for (const component of sorted) {
      const group = component.slashMenu?.group ?? "custom";
      const label = component.label;
      resolveBlockEditGroup(builder, group).addItem(`page-block-${component.id}`, {
        label,
        icon: pageBlockIcon,
        onRun: (ctx) => {
          if (options) {
            void insertPageBlockAndExpand(ctx, component, options);
            return;
          }
          insertPageBlock(ctx, component);
        },
      });
    }
  };
}

export function composeBlockEditMenus(
  ...builders: Array<NonNullable<BlockEditFeatureConfig["buildMenu"]>>
): NonNullable<BlockEditFeatureConfig["buildMenu"]> {
  return (builder) => {
    for (const build of builders) {
      build(builder);
    }
  };
}

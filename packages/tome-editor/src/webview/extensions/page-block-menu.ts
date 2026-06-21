import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import { replaceRange } from "@milkdown/kit/utils";
import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import { serializePageBlock } from "tome-interfaces/page-block";
import type { PublicExtensionComponent } from "../../shared/extensions";

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

function insertPageBlock(ctx: Ctx, component: PublicExtensionComponent): void {
  const defaultData = component.insertDefaultData ?? {};
  const fence = `\n\n${serializePageBlock(component.id, defaultData)}\n\n`;
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  replaceRange(fence, { from, to })(ctx);
}

export function buildPageBlockSlashMenu(
  components: PublicExtensionComponent[],
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
        onRun: (ctx) => insertPageBlock(ctx, component),
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

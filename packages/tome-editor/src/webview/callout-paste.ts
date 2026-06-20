import { Slice } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { selectionInsideCallout, sliceContainsCalloutBlockquote } from "./callout-nesting";

const calloutPasteKey = new PluginKey("tome-callout-paste");

export function transformPastedCalloutSlice(slice: Slice, view: EditorView): Slice {
  if (!selectionInsideCallout(view.state, view)) return slice;
  if (!sliceContainsCalloutBlockquote(slice)) return slice;
  return new Slice(slice.content, 0, 0);
}

export function createCalloutPastePlugin(): Plugin {
  return new Plugin({
    key: calloutPasteKey,
    props: {
      transformPasted(slice, view) {
        return transformPastedCalloutSlice(slice, view);
      },
    },
  });
}

export function installCalloutPaste(view: EditorView): void {
  const plugin = createCalloutPastePlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}

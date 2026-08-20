import { useCallback, useEffect, useRef, useState } from "react";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { wrapInHeadingCommand } from "@milkdown/kit/preset/commonmark";
import { getMarkdown, replaceRange } from "@milkdown/kit/utils";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame-dark.css";
import type { EditorApi } from "../api/client";
import type { NodeSummary } from "../../shared/types";
import { CorpusSuffix } from "./CorpusSuffix";
import { buildCalloutSlashMenu } from "../callout-block";
import {
  buildPageBlockSlashMenu,
  composeBlockEditMenus,
} from "../extensions/page-block-menu";
import { replaceBlockquoteInputRule } from "../blockquote-input-rule";
import { pageBlockEmbed, setPageBlockEmbedNodeId } from "../extensions/page-block-embed";
import { loadEditorBundles, setPageBlockInvokeExtension } from "../extensions/page-block-registry";
import { scheduleSchemaDiagramViewportInit } from "../extensions/schema-diagram-viewport";
import { installCalloutCursor } from "../callout-cursor";
import { attachEditorLinkNavigation } from "../editor-link-navigation";
import { installLinkHardOpen } from "../editor-link-hard-open";
import { installLinkCursor } from "../link-cursor";
import { installCalloutDecoration } from "../callout-decoration";
import { installCalloutPaste } from "../callout-paste";
import { installDynamicLinkDecoration } from "../dynamic-node-link-decoration";
import { installDynamicLinkDemote } from "../dynamic-node-link-demote";
import { installBlockHandleMenu } from "../block-handle-menu";
import { installHeadingKeymap } from "../heading-keymap";
import { installListItemDeleteKeymap } from "../list-item-delete-keymap";
import { installMentionSync } from "../mention-sync";
import {
  activeMentionRangeAtSelection,
  resolveMentionInsertRange,
} from "../mention-range";
import { formatEditorDynamicNodeLink } from "../standalone-markdown";
import { classifyMarkdownUpdate } from "../editor-markdown-update";
import "./editor.css";

interface MentionState {
  query: string;
  replaceFrom: number;
  replaceTo: number;
  top: number;
  left: number;
  activeIndex: number;
}

interface TomeEditorProps {
  api: EditorApi;
  nodeId: string;
  initialBody: string;
  title?: string;
  hideTitle?: boolean;
  onEditorBaseline?: (body: string) => void;
  onBodyChange?: (body: string) => void;
}

export function TomeEditor({
  api,
  nodeId,
  initialBody,
  title = "",
  hideTitle = true,
  onEditorBaseline,
  onBodyChange,
}: TomeEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [results, setResults] = useState<NodeSummary[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(() => !initialBody.trim());
  const mentionRef = useRef<MentionState | null>(null);
  const mentionRangeRef = useRef<{ replaceFrom: number; replaceTo: number } | null>(null);
  const resultsRef = useRef<NodeSummary[]>([]);
  mentionRef.current = mention;
  resultsRef.current = results;

  const closeMention = useCallback(() => {
    mentionRangeRef.current = null;
    setMention(null);
    setResults([]);
  }, []);

  const insertMention = useCallback(
    (item: NodeSummary) => {
      const editor = crepeRef.current?.editor;
      const stored = mentionRangeRef.current ?? mentionRef.current;
      if (!editor || !stored) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const range = resolveMentionInsertRange(view.state, stored);
        if (!range) return;
        const link = formatEditorDynamicNodeLink(item.id, item.title);
        replaceRange(link, { from: range.replaceFrom, to: range.replaceTo })(ctx);
      });
      closeMention();
    },
    [closeMention],
  );

  useEffect(() => {
    if (!mention) return;
    const handle = window.setTimeout(() => {
      void api.search(mention.query, 12).then(setResults).catch(() => setResults([]));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [api, mention]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let destroyed = false;
    let editorReady = false;
    let baselineCaptured = false;
    let editorDom: HTMLElement | null = null;
    let crepe: Crepe | null = null;
    let onKeyDown: ((event: KeyboardEvent) => void) | null = null;
    let detachEditorLinkNavigation: (() => void) | null = null;
    let detachBlockHandleMenu: (() => void) | null = null;
    let detachHeadingKeymap: (() => void) | null = null;
    setInitError(null);
    setIsEmpty(!initialBody.trim());
    root.replaceChildren();

    void (async () => {
      let blockMenuBuilder = buildCalloutSlashMenu;
      try {
        const manifest = await api.getExtensionsManifest();
        if (destroyed) return;
        await loadEditorBundles(manifest);
        if (destroyed) return;
        setPageBlockEmbedNodeId(nodeId);
        setPageBlockInvokeExtension((componentId, input, invokeNodeId) =>
          api.invokeExtension(componentId, input, invokeNodeId),
        );
        if (manifest.components.length > 0) {
          blockMenuBuilder = composeBlockEditMenus(
            buildCalloutSlashMenu,
            buildPageBlockSlashMenu(manifest.components, {
              prepareEditorBody: (markdown) => api.prepareEditorBody(nodeId, markdown),
            }),
          );
        }
      } catch (err: unknown) {
        if (!destroyed) {
          setInitError(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      if (destroyed) return;

      crepe = new Crepe({
      root,
      defaultValue: initialBody,
      features: {
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.ImageBlock]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Type '/' for blocks, '@' to link a record…",
        },
        [Crepe.Feature.BlockEdit]: {
          buildMenu: blockMenuBuilder,
        },
      },
    });
    crepe.editor.use(pageBlockEmbed);
    await replaceBlockquoteInputRule(crepe.editor);
    if (destroyed) return;

    detachEditorLinkNavigation = attachEditorLinkNavigation(root);

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (
          classifyMarkdownUpdate({
            destroyed,
            editorReady,
            baselineCaptured,
            markdown,
            prevMarkdown,
          }) !== "save"
        ) {
          return;
        }
        setIsEmpty(!markdown.trim());
        onBodyChange?.(markdown);
      });
    });

    if (!crepe) return;
    const activeCrepe = crepe;
    crepeRef.current = activeCrepe;

    void activeCrepe.create().then(async () => {
      if (destroyed) return;
      // Capture baseline from the initial doc so the first user edit (e.g. page-block
      // tab toggle) is saved — not mistaken for the load baseline.
      try {
        const initialMarkdown = await activeCrepe.editor.action(getMarkdown());
        if (destroyed) return;
        baselineCaptured = true;
        editorReady = true;
        setIsEmpty(!initialMarkdown.trim());
        onEditorBaseline?.(initialMarkdown);
      } catch {
        if (destroyed) return;
        baselineCaptured = true;
        editorReady = true;
      }
      activeCrepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const dom = view.dom;
        installCalloutDecoration(view);
        installCalloutPaste(view);
        installCalloutCursor(view);
        installLinkCursor(view);
        installLinkHardOpen(view);
        installDynamicLinkDecoration(view);
        installDynamicLinkDemote(view);
        installListItemDeleteKeymap(view);
        detachHeadingKeymap = installHeadingKeymap(view, (level) => {
          activeCrepe.editor.action((ctx) => {
            ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level);
          });
        });
        detachBlockHandleMenu = installBlockHandleMenu(view, root);

        const syncMentionMenu = () => {
          const { state } = view;
          const { from } = state.selection;
          const mentionRange = activeMentionRangeAtSelection(state);
          if (!mentionRange) {
            mentionRangeRef.current = null;
            if (mentionRef.current) closeMention();
            return;
          }
          mentionRangeRef.current = {
            replaceFrom: mentionRange.replaceFrom,
            replaceTo: mentionRange.replaceTo,
          };
          const coords = view.coordsAtPos(from);
          const hostRect = root.getBoundingClientRect();
          setMention((prev) => ({
            query: mentionRange.query,
            replaceFrom: mentionRange.replaceFrom,
            replaceTo: mentionRange.replaceTo,
            top: coords.bottom - hostRect.top + 4,
            left: coords.left - hostRect.left,
            activeIndex: prev?.activeIndex ?? 0,
          }));
        };

        installMentionSync(view, syncMentionMenu);

        onKeyDown = (event: KeyboardEvent) => {
          const state = mentionRef.current;
          if (!state) return;
          if (event.key === "Escape") {
            closeMention();
            event.preventDefault();
            return;
          }
          if (event.key === "ArrowDown") {
            const count = resultsRef.current.length;
            setMention((prev) =>
              prev ? { ...prev, activeIndex: Math.min(prev.activeIndex + 1, count - 1) } : prev,
            );
            event.preventDefault();
            return;
          }
          if (event.key === "ArrowUp") {
            setMention((prev) =>
              prev ? { ...prev, activeIndex: Math.max(prev.activeIndex - 1, 0) } : prev,
            );
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            const item = resultsRef.current[state.activeIndex];
            event.preventDefault();
            event.stopPropagation();
            syncMentionMenu();
            if (item) insertMention(item);
          }
        };

        editorDom = dom;
        dom.addEventListener("keydown", onKeyDown, true);
        scheduleSchemaDiagramViewportInit(dom);
      });
    }).catch((err: unknown) => {
      console.error("Tome editor failed to initialize:", err);
      if (!destroyed) {
        setInitError(err instanceof Error ? err.message : String(err));
      }
    });

    })();

    return () => {
      destroyed = true;
      setPageBlockInvokeExtension(null);
      if (editorDom && onKeyDown) {
        editorDom.removeEventListener("keydown", onKeyDown, true);
      }
      detachEditorLinkNavigation?.();
      detachHeadingKeymap?.();
      detachBlockHandleMenu?.();
      root.replaceChildren();
      void crepe?.destroy();
      crepeRef.current = null;
    };
  }, [
    api,
    closeMention,
    initialBody,
    insertMention,
    onEditorBaseline,
    onBodyChange,
    nodeId,
    title,
  ]);

  return (
    <div className="tome-editor-shell">
      {hideTitle ? null : (
        <header className="tome-editor-header">
          <h1 className="tome-editor-title">{title}</h1>
        </header>
      )}
      <div
        className={`tome-editor-body${isEmpty ? " is-empty" : ""}`}
        ref={rootRef}
      />
      {initError ? <div className="tome-editor-error">{initError}</div> : null}
      {mention ? (
        <div
          className="tome-mention-menu"
          style={{ top: mention.top, left: mention.left }}
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="tome-mention-empty">No matching records</div>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`tome-mention-item${index === mention.activeIndex ? " is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(item);
                }}
              >
                <span className="tome-mention-title">
                  {item.title}
                  <CorpusSuffix label={item.corpusLabel} />
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

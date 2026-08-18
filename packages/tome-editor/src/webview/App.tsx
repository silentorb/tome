import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphView } from "./components/GraphView";
import { GlobalSearch } from "./components/GlobalSearch";
import { NodePageView } from "./components/NodePageView";
import { SidePanel } from "./components/SidePanel";
import { ToolPanel, type ToolPanelSession } from "./components/ToolPanel";
import { createEditorApi } from "./api/client";
import { UserSettingsProvider, useUserSettings } from "./hooks/useUserSettings";
import { nodeTableTabKey } from "../shared/user-settings";
import type { GetNodeOptions } from "../shared/http-client";
import { documentToStorageBody } from "tome-db/document-to-storage-body";
import {
  isPersistableNodeTitle,
  standaloneNodeUrl,
  type AppView,
  type DatabaseViewDetail,
  type EditorNodePageDetail,
  type NodeBodyDocument,
} from "../shared/types";
import {
  anchorFromLocation,
  corpusFromLocation,
  metadataExpandedFromLocation,
  isStandaloneCreatePageUrl,
  navigateStandaloneCreate,
  navigateStandaloneNode,
  navigateStandaloneView,
  replaceStandaloneHistory,
  resolveGraphExplorerAnchor,
  setStandaloneNavigationHandler,
  standaloneCreatePageUrl,
  stripCorpusParamFromUrl,
  stripMetadataParamFromUrl,
  syncMetadataExpandedParam,
  standaloneViewUrl,
} from "./node-links";
import { attachStandaloneChromeNavigation } from "./standalone-navigation";
import { DRAFT_NODE_ID, isDraftNodeId, makeDraftNodePageDetail } from "./draft-page";
import {
  documentToEditorMarkdown,
} from "./body-document-projection";
import {
  bodyNeedsSave,
  buildPendingSavePayload,
  editorMarkdownToSaveDocument,
  titleNeedsSave,
} from "./editor-save";
import { buildQuickLinkIconMaps } from "./quick-links-nav";
import { resolveDocumentIcon } from "./document-icon";
import { useCorpora } from "./useCorpora";
import {
  readGraphExplorerLayerDepth,
  readGraphExplorerMode,
  readGraphExplorerRelativeDetail,
  readGraphShowNodeLabels,
  readGraphShowRelevanceDiagnostics,
  writeGraphExplorerLayerDepth,
  writeGraphExplorerMode,
  writeGraphExplorerRelativeDetail,
  writeGraphShowNodeLabels,
  writeGraphShowRelevanceDiagnostics,
  normalizeGraphExplorerLayerDepth,
  normalizeGraphExplorerRelativeDetail,
  type GraphExplorerMode,
} from "./graph-preferences";
import { syncDocumentTitle } from "./document-title";
import { syncDocumentIcon } from "./document-icon";
import { setPageBlockParameterHandlers, setPageBlockToolPanelHandlers } from "./extensions/page-block-registry";

export type { AppView };

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const saveDebounceDelay: number = 2000

function nodeFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("node");
}

function viewFromLocation(): AppView {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view === "overview" || view === "explorer") return "graph-explorer";
  return "node-page";
}

function tabFromLocation(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") ?? params.get("dbView") ?? params.get("scope") ?? undefined;
}

function viewToQueryParam(view: AppView): string | null {
  if (view === "graph-explorer") return "explorer";
  return null;
}

function activeTabIdFromNode(node: EditorNodePageDetail): string | undefined {
  for (const section of node.sections) {
    if (section.type === "database") return section.databaseView.tabs.activeTabId;
  }
  return undefined;
}

const EMPTY_DOCUMENT: NodeBodyDocument = { segments: [{ type: "prose", markdown: "" }] };

export function App() {
  const api = useMemo(() => createEditorApi(), []);
  return (
    <UserSettingsProvider api={api}>
      <AppInner api={api} />
    </UserSettingsProvider>
  );
}

function AppInner({ api: baseApi }: { api: ReturnType<typeof createEditorApi> }) {
  const {
    ready: userSettingsReady,
    getTableTab,
    setTableTab,
    getBlockParameters,
    setBlockParameter,
    getBlockParametersRevision,
  } = useUserSettings();
  const {
    corpora,
    activeCorpusId,
    corpusReadonly,
    workspace,
    error: workspaceError,
    refreshWorkspace,
    setActiveCorpus,
  } = useCorpora(baseApi);
  const api = useMemo(
    () => ({
      ...baseApi,
      search: (
        query: string,
        limit?: number,
        allowedTypeIds?: string[],
        options?: { includeBody?: boolean; activeCorpusId?: string },
      ) =>
        baseApi.search(query, limit, allowedTypeIds, {
          ...options,
          activeCorpusId: activeCorpusId ?? undefined,
        }),
    }),
    [activeCorpusId, baseApi],
  );
  const [view, setView] = useState<AppView>(() => viewFromLocation());
  const [node, setNode] = useState<EditorNodePageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [metadataExpanded, setMetadataExpanded] = useState(() => metadataExpandedFromLocation());
  const [showGraphNodeLabels, setShowGraphNodeLabels] = useState(readGraphShowNodeLabels);
  const [showGraphRelevanceDiagnostics, setShowGraphRelevanceDiagnostics] = useState(
    readGraphShowRelevanceDiagnostics,
  );
  const [graphExplorerMode, setGraphExplorerMode] = useState(readGraphExplorerMode);
  const [graphExplorerLayerDepth, setGraphExplorerLayerDepth] = useState(readGraphExplorerLayerDepth);
  const [graphExplorerRelativeDetail, setGraphExplorerRelativeDetail] = useState(() =>
    readGraphExplorerRelativeDetail(readGraphExplorerLayerDepth()),
  );
  const [explorerAnchorStack, setExplorerAnchorStack] = useState<string[]>([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [selectPageTitleOnMount, setSelectPageTitleOnMount] = useState(false);
  const [recentNodesRefreshKey, setRecentNodesRefreshKey] = useState(0);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [explorerAnchorId, setExplorerAnchorId] = useState("");
  const [toolPanelSession, setToolPanelSession] = useState<ToolPanelSession | null>(null);
  const pendingBody = useRef<string | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const savedDocument = useRef<NodeBodyDocument | null>(null);
  const savedTitle = useRef<string | null>(null);
  const nodeIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const toolPanelSessionRef = useRef<ToolPanelSession | null>(null);
  toolPanelSessionRef.current = toolPanelSession;

  const closeToolPanel = useCallback(() => {
    const current = toolPanelSessionRef.current;
    if (!current) return;
    setToolPanelSession(null);
    current.onClose?.();
  }, []);

  const openToolPanel = useCallback((session: ToolPanelSession) => {
    setToolPanelSession(session);
  }, []);

  useEffect(() => {
    setPageBlockToolPanelHandlers({ open: openToolPanel, close: closeToolPanel });
    return () => setPageBlockToolPanelHandlers(null);
  }, [openToolPanel, closeToolPanel]);

  useEffect(() => {
    setPageBlockParameterHandlers({
      getBlockParameters,
      setBlockParameter,
      getBlockParametersRevision,
    });
    return () => setPageBlockParameterHandlers(null);
  }, [getBlockParameters, setBlockParameter, getBlockParametersRevision]);

  const syncExplorerAnchorUrl = useCallback(
    (anchorId: string) => {
      if (view !== "graph-explorer") return;
      const url = new URL(window.location.href);
      url.searchParams.set("anchor", anchorId);
      replaceStandaloneHistory(url.toString());
    },
    [view],
  );

  const defaultGraphAnchorId = workspace?.graphExplorer.defaultAnchorNodeId ?? "";
  const protectedNodeIds = workspace?.protectedNodeIds ?? [];
  const archiveHubTitle = workspace?.archiveNodeTitle ?? "Archive";
  const quickLinkIconMaps = useMemo(
    () => buildQuickLinkIconMaps(workspace?.quickLinks ?? []),
    [workspace?.quickLinks],
  );

  const changeExplorerAnchor = useCallback(
    (nextAnchorId: string) => {
      if (!defaultGraphAnchorId) return;
      const resolved = resolveGraphExplorerAnchor(nextAnchorId, defaultGraphAnchorId);
      setExplorerAnchorStack((current) => [...current, explorerAnchorId]);
      setExplorerAnchorId(resolved);
      syncExplorerAnchorUrl(resolved);
    },
    [defaultGraphAnchorId, explorerAnchorId, syncExplorerAnchorUrl],
  );

  const navigateExplorerAnchorBack = useCallback(() => {
    setExplorerAnchorStack((current) => {
      if (current.length === 0) return current;
      const nextStack = [...current];
      const previousAnchor = nextStack.pop()!;
      setExplorerAnchorId(previousAnchor);
      syncExplorerAnchorUrl(previousAnchor);
      return nextStack;
    });
  }, [syncExplorerAnchorUrl]);

  const setGraphExplorerModePersisted = useCallback((value: GraphExplorerMode) => {
    setGraphExplorerMode(value);
    writeGraphExplorerMode(value);
    if (value === "layers") {
      setExplorerAnchorStack([]);
    }
  }, []);

  const setGraphExplorerLayerDepthPersisted = useCallback((value: number) => {
    const normalized = normalizeGraphExplorerLayerDepth(value);
    setGraphExplorerLayerDepth(normalized);
    writeGraphExplorerLayerDepth(normalized);
    setGraphExplorerRelativeDetail((current) => {
      const clamped = normalizeGraphExplorerRelativeDetail(current, normalized);
      if (clamped !== current) writeGraphExplorerRelativeDetail(clamped, normalized);
      return clamped;
    });
  }, []);

  const setGraphExplorerRelativeDetailPersisted = useCallback(
    (value: number) => {
      const normalized = normalizeGraphExplorerRelativeDetail(value, graphExplorerLayerDepth);
      setGraphExplorerRelativeDetail(normalized);
      writeGraphExplorerRelativeDetail(normalized, graphExplorerLayerDepth);
    },
    [graphExplorerLayerDepth],
  );

  const standaloneUrls = useMemo(() => {
    if (!homeId || !workspace) return undefined;
    const nodes = Object.fromEntries(
      workspace.quickLinks.map(({ nodeId }) => [nodeId, standaloneNodeUrl(nodeId)]),
    );
    return {
      home: standaloneNodeUrl(homeId),
      explorer: standaloneViewUrl(
        "graph-explorer",
        null,
        undefined,
        explorerAnchorId,
        defaultGraphAnchorId,
      ),
      create: standaloneCreatePageUrl(activeCorpusId),
      nodes,
    };
  }, [activeCorpusId, defaultGraphAnchorId, explorerAnchorId, homeId, workspace]);

  const syncStandaloneUrl = useCallback(
    (nextView: AppView, nodeId?: string | null, options?: GetNodeOptions) => {
      const url = new URL(window.location.href);
      const viewParam = viewToQueryParam(nextView);
      if (viewParam) url.searchParams.set("view", viewParam);
      else url.searchParams.delete("view");
      if (nodeId) url.searchParams.set("node", nodeId);
      else url.searchParams.delete("node");
      url.searchParams.delete("dynamicTitle");
      url.searchParams.delete("dynnode");
      if (options?.tab ?? options?.scope ?? options?.view) {
        url.searchParams.set("tab", options.tab ?? options.scope ?? options.view!);
      } else {
        url.searchParams.delete("tab");
      }
      url.searchParams.delete("scope");
      url.searchParams.delete("dbView");
      stripMetadataParamFromUrl(url);
      stripCorpusParamFromUrl(url);
      if (nextView === "graph-explorer") {
        url.searchParams.set("anchor", explorerAnchorId);
      } else {
        url.searchParams.delete("anchor");
      }
      replaceStandaloneHistory(url.toString());
    },
    [explorerAnchorId],
  );

  const applyLoadedNode = useCallback(
    (detail: EditorNodePageDetail, options?: GetNodeOptions) => {
      const title = detail.title;
      const editorMarkdown = documentToEditorMarkdown(detail.document);
      nodeIdRef.current = detail.id;
      setNode(detail);
      setView("node-page");
      setMetadataExpanded(false);
      pendingBody.current = editorMarkdown;
      pendingTitle.current = title;
      savedDocument.current = detail.document;
      savedTitle.current = title;
      setSaveState("idle");
      if (detail.corpusId) {
        setActiveCorpus(detail.corpusId);
        setHomeId(
          corpora.find((c) => c.id === detail.corpusId)?.homeNodeId ?? homeId,
        );
      }
      syncStandaloneUrl("node-page", detail.id, options);
    },
    [corpora, homeId, setActiveCorpus, syncStandaloneUrl],
  );

  const bumpRecentNodes = useCallback(() => {
    setRecentNodesRefreshKey((value) => value + 1);
  }, []);

  const commitDraftPage = useCallback(
    async (options?: { keepalive?: boolean }) => {
      const title = (pendingTitle.current ?? "").trim();
      if (!isPersistableNodeTitle(title)) return;
      const body = pendingBody.current ?? "";
      const document = editorMarkdownToSaveDocument(body, title);
      const storageBody = documentToStorageBody(document);

      if (options?.keepalive) {
        void api
          .createNode({
            title,
            body: storageBody || undefined,
            corpusId: activeCorpusId ?? undefined,
          })
          .then((created) => {
            nodeIdRef.current = created.id;
            savedTitle.current = title;
            savedDocument.current = document;
            pendingTitle.current = title;
            pendingBody.current = body;
            replaceStandaloneHistory(standaloneNodeUrl(created.id));
          })
          .catch(() => {});
        return;
      }

      setSaveState("saving");
      try {
        const created = await api.createNode({
          title,
          body: storageBody || undefined,
          corpusId: activeCorpusId ?? undefined,
        });
        bumpRecentNodes();
        const detail = await api.getNode(created.id);
        applyLoadedNode(detail);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeCorpusId, api, applyLoadedNode, bumpRecentNodes],
  );

  const flushPendingSaves = useCallback(
    async (options?: { keepalive?: boolean }) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const id = nodeIdRef.current;
      if (!id || isDraftNodeId(id)) {
        await commitDraftPage(options);
        return;
      }

      const pageTitle = pendingTitle.current ?? savedTitle.current ?? "";
      const patch = buildPendingSavePayload(
        pendingBody.current,
        pendingTitle.current,
        savedDocument.current,
        savedTitle.current,
        pageTitle,
      );
      if (!patch) return;

      if (options?.keepalive) {
        if (patch.document !== undefined) savedDocument.current = patch.document;
        if (patch.title !== undefined) savedTitle.current = patch.title;
        void api.saveNode(id, patch, { keepalive: true }).catch(() => {});
        return;
      }

      setSaveState("saving");
      try {
        await api.saveNode(id, patch);
        if (patch.document !== undefined) savedDocument.current = patch.document;
        if (patch.title !== undefined) savedTitle.current = patch.title;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [api, commitDraftPage],
  );

  const loadNode = useCallback(
    async (nodeId: string, options?: GetNodeOptions | string) => {
      setError(null);
      closeToolPanel();
      await flushPendingSaves();
      try {
        const normalized =
          typeof options === "string" ? { tab: options } : (options ?? {});
        const detail = await api.getNode(nodeId, normalized);
        applyLoadedNode(detail, normalized);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, applyLoadedNode, closeToolPanel, flushPendingSaves],
  );

  const syncCreatePageUrl = useCallback(() => {
    replaceStandaloneHistory(standaloneCreatePageUrl(activeCorpusId));
  }, [activeCorpusId]);

  const openDraftPage = useCallback(
    async (options?: { syncUrl?: "replace" | "none" }) => {
      setError(null);
      closeToolPanel();
      await flushPendingSaves();
      const draft = makeDraftNodePageDetail();
      nodeIdRef.current = DRAFT_NODE_ID;
      setNode(draft);
      setView("node-page");
      setSelectPageTitleOnMount(true);
      setMetadataExpanded(false);
      pendingBody.current = "";
      pendingTitle.current = "";
      savedDocument.current = EMPTY_DOCUMENT;
      savedTitle.current = "";
      setSaveState("idle");
      if (options?.syncUrl !== "none") {
        syncCreatePageUrl();
      }
    },
    [closeToolPanel, flushPendingSaves, syncCreatePageUrl],
  );

  const hydrateFromLocation = useCallback(
    async (options?: { homeId?: string | null }) => {
      if (!workspace) return;
      setError(null);
      closeToolPanel();

      const graphAnchor = resolveGraphExplorerAnchor(
        anchorFromLocation(),
        workspace.graphExplorer.defaultAnchorNodeId,
      );
      setExplorerAnchorId(graphAnchor);
      setExplorerAnchorStack([]);

      if (isStandaloneCreatePageUrl()) {
        const pinnedCorpusId = corpusFromLocation();
        if (pinnedCorpusId) setActiveCorpus(pinnedCorpusId);
        if (!isDraftNodeId(nodeIdRef.current)) {
          await openDraftPage({ syncUrl: "none" });
        }
        return;
      }

      const nextView = viewFromLocation();
      setView(nextView);
      if (nextView !== "node-page") {
        await flushPendingSaves();
        return;
      }

      const urlTab = tabFromLocation();
      const fromUrl = nodeFromLocation();
      const effectiveHome = options?.homeId ?? homeId;
      const targetId = fromUrl ?? effectiveHome;
      if (!targetId) return;

      if (nodeIdRef.current === targetId && !isDraftNodeId(targetId)) {
        return;
      }

      const tab = urlTab ?? getTableTab(nodeTableTabKey(targetId));
      await loadNode(targetId, tab ? { tab } : undefined);
    },
    [
      closeToolPanel,
      flushPendingSaves,
      getTableTab,
      homeId,
      loadNode,
      openDraftPage,
      setActiveCorpus,
      workspace,
    ],
  );

  const bootstrap = useCallback(async () => {
    if (!userSettingsReady || !workspace) return;
    try {
      const home = await api.getHomeId(activeCorpusId ?? undefined);
      setHomeId(home);
      await hydrateFromLocation({ homeId: home });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the Tome editor API. Start it with: bun run editor:dev",
      );
    }
  }, [activeCorpusId, api, hydrateFromLocation, userSettingsReady, workspace]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setStandaloneNavigationHandler(() => hydrateFromLocation());
    const detachChrome = attachStandaloneChromeNavigation();
    const onPopState = () => {
      void hydrateFromLocation();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      setStandaloneNavigationHandler(null);
      detachChrome();
      window.removeEventListener("popstate", onPopState);
    };
  }, [hydrateFromLocation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setGlobalSearchOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (saveState === "saved") bumpRecentNodes();
  }, [bumpRecentNodes, saveState]);

  useEffect(() => {
    const appTitle = workspace?.branding?.appTitle ?? "Tome";
    syncDocumentTitle(view, node?.title, appTitle);
    const urlNodeId = nodeFromLocation();
    syncDocumentIcon({
      view,
      nodeId: node?.id ?? urlNodeId,
      primaryTypeTitle: node?.primaryTypeTitle,
      recordDocument: node?.document,
      isTypeTable: node?.isTypeTable,
      homeId,
      defaultDocumentIcon: workspace?.branding?.defaultDocumentIcon,
      quickLinkIconByNodeId: quickLinkIconMaps.byNodeId,
      quickLinkIconByLabel: quickLinkIconMaps.byLabel,
    });
  }, [
    view,
    node?.id,
    node?.title,
    node?.primaryTypeTitle,
    node?.document,
    node?.isTypeTable,
    homeId,
    workspace?.branding?.appTitle,
    workspace?.branding?.defaultDocumentIcon,
    quickLinkIconMaps.byLabel,
    quickLinkIconMaps.byNodeId,
  ]);

  useEffect(() => {
    const onPageHide = () => {
      void flushPendingSaves({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushPendingSaves]);

  const syncEditorBaseline = useCallback(
    (markdown: string) => {
      if (!node) return;
      savedDocument.current = editorMarkdownToSaveDocument(markdown, node.title);
      pendingBody.current = markdown;
    },
    [node],
  );

  const scheduleSave = useCallback(
    (body: string) => {
      if (!node) return;
      if (!bodyNeedsSave(body, savedDocument.current, node.title)) return;
      pendingBody.current = body;
      setSaveState("dirty");
      if (isDraftNodeId(nodeIdRef.current)) {
        if (!isPersistableNodeTitle(pendingTitle.current ?? node.title)) return;
      }
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void flushPendingSaves();
      }, saveDebounceDelay);
    },
    [flushPendingSaves, node],
  );

  const scheduleSaveTitle = useCallback(
    (title: string) => {
      if (!node) return;
      const trimmed = title.trim();
      setNode((prev) => (prev && prev.title !== title ? { ...prev, title } : prev));
      pendingTitle.current = trimmed;
      if (isDraftNodeId(nodeIdRef.current)) {
        if (!isPersistableNodeTitle(trimmed)) {
          setSaveState(
            bodyNeedsSave(pendingBody.current ?? "", savedDocument.current, title) ? "dirty" : "idle",
          );
          return;
        }
        setSaveState("dirty");
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void flushPendingSaves();
        }, saveDebounceDelay);
        return;
      }
      if (!titleNeedsSave(title, savedTitle.current)) return;
      setSaveState("dirty");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void flushPendingSaves();
      }, saveDebounceDelay);
    },
    [flushPendingSaves, node],
  );

  const goHome = useCallback(async () => {
    const nextHomeId = homeId ?? (await api.getHomeId());
    navigateStandaloneNode(nextHomeId);
  }, [api, homeId]);

  const changeView = useCallback(
    (nextView: AppView) => {
      navigateStandaloneView(
        nextView,
        node?.id ?? nodeFromLocation(),
        undefined,
        nextView === "graph-explorer" ? explorerAnchorId : undefined,
        defaultGraphAnchorId,
      );
    },
    [defaultGraphAnchorId, explorerAnchorId, node?.id],
  );

  const openNodeFromGraph = useCallback(
    (nodeId: string, openInNewTab = false) => {
      if (openInNewTab) {
        api.navigate(nodeId, true);
        return;
      }
      navigateStandaloneNode(nodeId);
    },
    [api],
  );

  const setShowGraphNodeLabelsPersisted = useCallback((value: boolean) => {
    setShowGraphNodeLabels(value);
    writeGraphShowNodeLabels(value);
  }, []);

  const setShowGraphRelevanceDiagnosticsPersisted = useCallback((value: boolean) => {
    setShowGraphRelevanceDiagnostics(value);
    writeGraphShowRelevanceDiagnostics(value);
  }, []);

  const updateDatabaseView = useCallback((databaseView: DatabaseViewDetail) => {
    setNode((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) =>
          section.type === "database" ? { ...section, databaseView } : section,
        ),
      };
    });
  }, []);

  const selectTab = useCallback(
    async (tabId: string) => {
      if (!node) return;
      setTableTab(nodeTableTabKey(node.id), tabId);
      syncStandaloneUrl("node-page", node.id, { tab: tabId });
      if (activeTabIdFromNode(node) === tabId) return;

      const databaseSection = node.sections.find((section) => section.type === "database");
      if (databaseSection?.type === "database") {
        try {
          const databaseView = await api.getDatabaseView(databaseSection.databaseView.id, tabId);
          updateDatabaseView(databaseView);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      void loadNode(node.id, { tab: tabId });
    },
    [api, loadNode, node, setTableTab, syncStandaloneUrl, updateDatabaseView],
  );

  const archiveCurrentNode = useCallback(
    async (nodeId: string) => {
      await flushPendingSaves();
      try {
        await api.archiveNode(nodeId);
        bumpRecentNodes();
        if (node?.id === nodeId) {
          await goHome();
        } else if (node) {
          await loadNode(node.id, { tab: tabFromLocation() });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, bumpRecentNodes, flushPendingSaves, goHome, loadNode, node],
  );

  const unarchiveCurrentNode = useCallback(
    async (nodeId: string) => {
      await flushPendingSaves();
      try {
        await api.unarchiveNode(nodeId);
        bumpRecentNodes();
        if (node?.id === nodeId) {
          await loadNode(nodeId, { tab: tabFromLocation() });
        } else if (node) {
          await loadNode(node.id, { tab: tabFromLocation() });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, bumpRecentNodes, flushPendingSaves, loadNode, node],
  );

  const deleteCurrentNode = useCallback(
    async (nodeId: string) => {
      await flushPendingSaves();
      try {
        await api.deleteNode(nodeId);
        bumpRecentNodes();
        if (node?.id === nodeId) {
          await goHome();
        } else if (node) {
          await loadNode(node.id, { tab: tabFromLocation() });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, bumpRecentNodes, flushPendingSaves, goHome, loadNode, node],
  );

  const addQuickLinkForNode = useCallback(
    async (nodeId: string, label: string, icon: string) => {
      try {
        await api.addQuickLink(nodeId, { label, icon });
        await refreshWorkspace();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, refreshWorkspace],
  );

  const switchCorpus = useCallback(
    async (corpusId: string) => {
      const target = corpora.find((c) => c.id === corpusId);
      if (!target) return;
      await flushPendingSaves();
      setActiveCorpus(corpusId);
      setHomeId(target.homeNodeId);
      navigateStandaloneNode(target.homeNodeId);
    },
    [corpora, flushPendingSaves, setActiveCorpus],
  );

  const removeQuickLinkForNode = useCallback(
    async (nodeId: string) => {
      try {
        await api.removeQuickLink(nodeId);
        await refreshWorkspace();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, refreshWorkspace],
  );

  const reorderQuickLinks = useCallback(
    async (nodeIds: string[]) => {
      try {
        await api.reorderQuickLinks(nodeIds);
        await refreshWorkspace();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, refreshWorkspace],
  );

  const isNodeQuickLink = useCallback(
    (nodeId: string) =>
      (workspace?.quickLinks ?? []).some((link) => link.nodeId === nodeId),
    [workspace?.quickLinks],
  );

  return (
    <>
      <div className="tome-layout">
      <SidePanel
        api={api}
        activeView={view}
        activeNodeId={
          view === "node-page" && node && !isDraftNodeId(node.id)
            ? node.id
            : view === "node-page"
              ? nodeFromLocation()
              : null
        }
        homeNodeId={homeId}
        corpora={corpora}
        activeCorpusId={activeCorpusId}
        onCorpusChange={switchCorpus}
        corpusReadonly={corpusReadonly || node?.corpusReadonly === true}
        onViewChange={changeView}
        onNewPage={() => navigateStandaloneCreate(activeCorpusId)}
        onOpenSearch={() => setGlobalSearchOpen(true)}
        standaloneUrls={standaloneUrls}
        recentNodesRefreshKey={recentNodesRefreshKey}
        quickLinks={workspace?.quickLinks ?? []}
        protectedNodeIds={protectedNodeIds}
        archiveHubTitle={archiveHubTitle}
        activeNodeArchived={node?.archived === true}
        onRemoveQuickLink={removeQuickLinkForNode}
        onQuickLinksReorder={reorderQuickLinks}
        onArchiveNode={archiveCurrentNode}
        onUnarchiveNode={unarchiveCurrentNode}
        onDeleteNode={deleteCurrentNode}
      />
      <div className={`tome-main${view === "graph-explorer" ? " tome-main-graph" : ""}`}>
        {workspaceError ? (
          <div className="tome-error">{workspaceError}</div>
        ) : !workspace ? (
          <div className="tome-loading">Loading…</div>
        ) : view === "graph-explorer" ? (
          <GraphView
            api={api}
            anchorId={explorerAnchorId}
            explorerMode={graphExplorerMode}
            onExplorerModeChange={setGraphExplorerModePersisted}
            layerDepth={graphExplorerLayerDepth}
            onLayerDepthChange={setGraphExplorerLayerDepthPersisted}
            relativeDetail={graphExplorerRelativeDetail}
            onRelativeDetailChange={setGraphExplorerRelativeDetailPersisted}
            canNavigateAnchorBack={explorerAnchorStack.length > 0}
            onNavigateAnchorBack={navigateExplorerAnchorBack}
            onAnchorChange={changeExplorerAnchor}
            showNodeLabels={showGraphNodeLabels}
            onShowNodeLabelsChange={setShowGraphNodeLabelsPersisted}
            showRelevanceDiagnostics={showGraphRelevanceDiagnostics}
            onShowRelevanceDiagnosticsChange={setShowGraphRelevanceDiagnosticsPersisted}
            onOpenNode={openNodeFromGraph}
          />
        ) : error ? (
          <div className="tome-error">{error}</div>
        ) : !node ? (
          <div className="tome-loading">Loading…</div>
        ) : (
          <NodePageView
            api={api}
            node={node}
            saveState={saveState}
            metadataExpanded={metadataExpanded}
            onMetadataExpandedChange={(expanded) => {
              setMetadataExpanded(expanded);
              syncMetadataExpandedParam(expanded);
            }}
            onBodyChange={scheduleSave}
            onEditorBaseline={syncEditorBaseline}
            onTitleChange={scheduleSaveTitle}
            onTabSelect={(tabId) => void selectTab(tabId)}
            onDatabaseViewChange={updateDatabaseView}
            onArchiveNode={archiveCurrentNode}
            onUnarchiveNode={unarchiveCurrentNode}
            onDeleteNode={deleteCurrentNode}
            onTableCellUpdated={() => void loadNode(node.id, { tab: tabFromLocation() })}
            selectTitleOnMount={selectPageTitleOnMount}
            onTitleSelected={() => setSelectPageTitleOnMount(false)}
            protectedNodeIds={protectedNodeIds}
            archiveHubTitle={archiveHubTitle}
            markdownBodyPanel={workspace.editor?.markdownBodyPanel === true}
            isQuickLink={isNodeQuickLink(node.id)}
            onAddQuickLink={() =>
              addQuickLinkForNode(
                node.id,
                node.title,
                resolveDocumentIcon({
                  view: "node-page",
                  nodeId: node.id,
                  primaryTypeTitle: node.primaryTypeTitle,
                  recordDocument: node.document,
                  isTypeTable: node.isTypeTable,
                  homeId,
                  defaultDocumentIcon: workspace.branding?.defaultDocumentIcon,
                  quickLinkIconByNodeId: quickLinkIconMaps.byNodeId,
                  quickLinkIconByLabel: quickLinkIconMaps.byLabel,
                }),
              )
            }
            onRemoveQuickLink={() => removeQuickLinkForNode(node.id)}
          />
        )}
      </div>
      <ToolPanel session={toolPanelSession} onClose={closeToolPanel} />
      </div>
      <GlobalSearch
        api={api}
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
      />
    </>
  );
}

import mermaid from "mermaid";
import svgPanZoom from "svg-pan-zoom";

let initialized = false;
let renderSerial = Promise.resolve();
let idCounter = 0;

const DEFAULT_THEME = "dark" as const;

type MermaidTheme = "default" | "base" | "dark" | "forest" | "neutral" | "null";

interface PanZoomInstance {
  destroy(): void;
  fit(): void;
  center(): void;
  resize(): void;
  zoomIn(): void;
  zoomOut(): void;
}

const panZoomByFigure = new WeakMap<HTMLElement, PanZoomInstance>();

export function ensureMermaidInitialized(theme: MermaidTheme = DEFAULT_THEME): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme,
  });
  initialized = true;
}

function themeForFigure(figure: Element): MermaidTheme {
  const raw = figure.getAttribute("data-mermaid-theme");
  if (!raw || !raw.trim().length) return DEFAULT_THEME;
  const allowed = new Set<MermaidTheme>(["default", "base", "dark", "forest", "neutral", "null"]);
  return allowed.has(raw as MermaidTheme) ? (raw as MermaidTheme) : DEFAULT_THEME;
}

function applyTheme(theme: MermaidTheme): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme,
  });
}

function nextRenderId(): string {
  idCounter += 1;
  return `tome-schema-diagram-${idCounter}-${Date.now().toString(36)}`;
}

function buildToolbar(): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "tome-schema-diagram-toolbar";

  const zoomIn = document.createElement("button");
  zoomIn.type = "button";
  zoomIn.className = "tome-schema-diagram-control";
  zoomIn.title = "Zoom in";
  zoomIn.setAttribute("aria-label", "Zoom in");
  zoomIn.textContent = "+";

  const zoomOut = document.createElement("button");
  zoomOut.type = "button";
  zoomOut.className = "tome-schema-diagram-control";
  zoomOut.title = "Zoom out";
  zoomOut.setAttribute("aria-label", "Zoom out");
  zoomOut.textContent = "−";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "tome-schema-diagram-control";
  reset.title = "Reset view";
  reset.setAttribute("aria-label", "Reset view");
  reset.textContent = "⟲";

  toolbar.append(zoomIn, zoomOut, reset);
  return toolbar;
}

function attachToolbarHandlers(
  toolbar: HTMLElement,
  getInstance: () => PanZoomInstance | undefined,
): void {
  const [zoomIn, zoomOut, resetBtn] = toolbar.querySelectorAll("button");

  zoomIn?.addEventListener("mousedown", (event) => event.stopPropagation());
  zoomOut?.addEventListener("mousedown", (event) => event.stopPropagation());
  resetBtn?.addEventListener("mousedown", (event) => event.stopPropagation());

  zoomIn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    getInstance()?.zoomIn();
  });
  zoomOut?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    getInstance()?.zoomOut();
  });
  resetBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const instance = getInstance();
    instance?.resize();
    instance?.fit();
    instance?.center();
  });
}

function initPanZoom(
  figure: HTMLElement,
  viewport: HTMLElement,
  svg: SVGSVGElement,
): PanZoomInstance {
  const existing = panZoomByFigure.get(figure);
  existing?.destroy();

  svg.style.maxWidth = "none";
  svg.style.width = "100%";
  svg.removeAttribute("height");

  const instance = svgPanZoom(svg, {
    zoomEnabled: true,
    panEnabled: true,
    controlIconsEnabled: false,
    fit: true,
    center: true,
    minZoom: 0.1,
    maxZoom: 10,
    zoomScaleSensitivity: 0.3,
    dblClickZoomEnabled: true,
    mouseWheelZoomEnabled: true,
    preventMouseEventsDefault: true,
    contain: false,
    eventsListenerElement: viewport,
  });

  const syncView = () => {
    instance.resize();
    instance.fit();
    instance.center();
  };

  syncView();
  requestAnimationFrame(syncView);

  panZoomByFigure.set(figure, instance);
  return instance;
}

export function destroySchemaDiagramPanZoom(root: ParentNode): void {
  for (const figure of root.querySelectorAll<HTMLElement>(".tome-schema-diagram")) {
    const instance = panZoomByFigure.get(figure);
    if (!instance) continue;
    instance.destroy();
    panZoomByFigure.delete(figure);
  }
}

async function renderSourceIntoHost(
  figure: HTMLElement,
  sourceNode: HTMLElement,
  source: string,
): Promise<void> {
  if (sourceNode.dataset.mermaidRendered === "true") return;
  if (figure.querySelector(".tome-schema-diagram-viewport .mermaid-svg-host")) return;

  const theme = themeForFigure(figure);
  ensureMermaidInitialized(theme);
  applyTheme(theme);

  const id = nextRenderId();
  try {
    const { svg, bindFunctions } = await mermaid.render(id, source);

    const viewport = document.createElement("div");
    viewport.className = "tome-schema-diagram-viewport";

    const host = document.createElement("div");
    host.className = "mermaid-svg-host";
    host.dataset.mermaidRendered = "true";
    host.innerHTML = svg;
    bindFunctions?.(host);
    viewport.appendChild(host);

    const toolbar = buildToolbar();
    viewport.appendChild(toolbar);

    sourceNode.replaceWith(viewport);

    const svgElement = host.querySelector("svg");
    if (svgElement) {
      initPanZoom(figure, viewport, svgElement);
      attachToolbarHandlers(toolbar, () => panZoomByFigure.get(figure));
    }
  } catch (error) {
    console.error("[tome-schema-diagram] mermaid render failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    let errorEl = figure.querySelector<HTMLElement>(".mermaid-render-error");
    if (!errorEl) {
      errorEl = document.createElement("p");
      errorEl.className = "mermaid-render-error";
      figure.appendChild(errorEl);
    }
    errorEl.textContent = `Schema diagram failed to render: ${message}`;
  }
}

export async function renderSchemaDiagramMermaidIn(root: ParentNode): Promise<void> {
  const figures = [...root.querySelectorAll<HTMLElement>(".tome-schema-diagram")];
  if (figures.length === 0) return;

  renderSerial = renderSerial.then(async () => {
    for (const figure of figures) {
      const sourceNodes = [
        ...figure.querySelectorAll<HTMLElement>("pre.mermaid, div.mermaid"),
      ].filter((node) => node.dataset.mermaidRendered !== "true");

      for (const sourceNode of sourceNodes) {
        const source = sourceNode.textContent?.trim();
        if (!source) continue;
        await renderSourceIntoHost(figure, sourceNode, source);
      }
    }
  });

  await renderSerial;
}

/** Run immediately and retry while the editor finishes mounting embeds. */
export function scheduleSchemaDiagramMermaidRender(root: ParentNode): void {
  const run = () => void renderSchemaDiagramMermaidIn(root);
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 100);
  window.setTimeout(run, 500);
}

import svgPanZoom from "svg-pan-zoom";

interface PanZoomInstance {
  destroy(): void;
  fit(): void;
  center(): void;
  resize(): void;
  zoomIn(): void;
  zoomOut(): void;
}

const panZoomByFigure = new WeakMap<HTMLElement, PanZoomInstance>();

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
    const viewport = toolbar.closest<HTMLElement>(".tome-schema-diagram-viewport");
    if (!instance || !viewport) return;
    syncPanZoomView(instance, viewport);
  });
}

function canInitPanZoom(viewport: HTMLElement): boolean {
  return viewport.clientWidth > 0 && viewport.clientHeight > 0;
}

function ensureSvgHost(viewport: HTMLElement, svg: SVGSVGElement): HTMLElement {
  const existing = svg.closest<HTMLElement>(".schema-diagram-svg-host");
  if (existing) return existing;

  const host = document.createElement("div");
  host.className = "schema-diagram-svg-host";
  svg.parentNode?.insertBefore(host, svg);
  host.appendChild(svg);
  return host;
}

function syncPanZoomView(instance: PanZoomInstance, viewport: HTMLElement): void {
  if (!canInitPanZoom(viewport)) return;
  try {
    instance.resize();
    instance.fit();
    instance.center();
  } catch (error) {
    console.warn("[tome-schema-diagram] pan/zoom sync failed:", error);
  }
}

function initPanZoom(
  figure: HTMLElement,
  viewport: HTMLElement,
  svg: SVGSVGElement,
): PanZoomInstance | null {
  const existing = panZoomByFigure.get(figure);
  existing?.destroy();

  if (!canInitPanZoom(viewport)) return null;

  svg.style.maxWidth = "none";
  svg.style.width = "";
  svg.style.height = "";

  let instance: PanZoomInstance;
  try {
    instance = svgPanZoom(svg, {
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
      eventsListenerElement: viewport as unknown as SVGSVGElement,
    });
  } catch (error) {
    console.error("[tome-schema-diagram] pan/zoom init failed:", error);
    return null;
  }

  syncPanZoomView(instance, viewport);
  requestAnimationFrame(() => syncPanZoomView(instance, viewport));

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

function initViewport(figure: HTMLElement, viewport: HTMLElement): void {
  if (viewport.dataset.schemaDiagramViewportReady === "true") return;

  const svg = viewport.querySelector<SVGSVGElement>("svg.schema-diagram-svg, svg");
  if (!svg) return;
  if (!canInitPanZoom(viewport)) return;
  if (viewport.querySelector(".tome-schema-diagram-toolbar")) return;

  ensureSvgHost(viewport, svg);

  const instance = initPanZoom(figure, viewport, svg);
  if (!instance) return;

  const toolbar = buildToolbar();
  viewport.appendChild(toolbar);
  attachToolbarHandlers(toolbar, () => panZoomByFigure.get(figure));
  viewport.dataset.schemaDiagramViewportReady = "true";
}

export function initSchemaDiagramViewportsIn(root: ParentNode): void {
  for (const figure of root.querySelectorAll<HTMLElement>(".tome-schema-diagram")) {
    const viewport = figure.querySelector<HTMLElement>(".tome-schema-diagram-viewport");
    if (!viewport) continue;
    initViewport(figure, viewport);
  }
}

/** Run immediately and retry while the editor finishes mounting embeds. */
export function scheduleSchemaDiagramViewportInit(root: ParentNode): void {
  const run = () => initSchemaDiagramViewportsIn(root);
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 100);
  window.setTimeout(run, 500);
}

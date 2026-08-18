import { useCallback, useMemo, type ReactNode } from "react";
import type {
  EditorPageBlockComponent,
  EditorPageBlockProps,
} from "tome-interfaces/page-block/editor";
import { getPageBlockParameterHandlers } from "./page-block-registry";

/**
 * Injects user-settings-backed block parameter accessors into page-block ctx.
 * Milkdown page-block embeds mount in a separate React root, so they cannot use
 * UserSettingsProvider context — handlers are registered from App via the registry.
 */
export function PageBlockWithUserSettings({
  Component,
  props,
}: {
  Component: EditorPageBlockComponent;
  props: EditorPageBlockProps;
}): ReactNode {
  const nodeId = props.ctx.nodeId;
  const componentId = props.ctx.component.id;

  const getParams = useCallback(() => {
    return getPageBlockParameterHandlers()?.getBlockParameters(nodeId, componentId) ?? {};
  }, [nodeId, componentId]);

  const getParamsRevision = useCallback(() => {
    return getPageBlockParameterHandlers()?.getBlockParametersRevision() ?? 0;
  }, []);

  const getShowDependencyEdges = useCallback(() => {
    return getPageBlockParameterHandlers()?.getSequencingShowDependencyEdges?.() ?? false;
  }, []);

  const setShowDependencyEdges = useCallback(async (value: boolean) => {
    getPageBlockParameterHandlers()?.setSequencingShowDependencyEdges?.(value);
  }, []);

  const setParam = useCallback(
    async (paramId: string, value: string | number | boolean | null) => {
      getPageBlockParameterHandlers()?.setBlockParameter(
        nodeId,
        componentId,
        paramId,
        value,
      );
    },
    [nodeId, componentId],
  );

  const nextProps = useMemo(
    (): EditorPageBlockProps => ({
      ...props,
      ctx: {
        ...props.ctx,
        getBlockParameters: getParams,
        setBlockParameter: setParam,
        getBlockParametersRevision: getParamsRevision,
        getSequencingShowDependencyEdges: getShowDependencyEdges,
        setSequencingShowDependencyEdges: setShowDependencyEdges,
      },
    }),
    [props, getParams, setParam, getParamsRevision, getShowDependencyEdges, setShowDependencyEdges],
  );

  const C = Component as (p: EditorPageBlockProps) => ReactNode;
  return <C {...nextProps} />;
}

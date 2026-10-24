import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PropertyFieldSection } from "tome-graph-interfaces";
import type { EditorApi } from "../api/client";
import {
  closePageBlockToolPanel,
  getPropertyFieldRegistration,
  invokePageBlockExtension,
  openPageBlockToolPanel,
} from "../extensions/page-block-registry";

export function PropertyFieldSectionView({
  api,
  nodeId,
  section,
  onUpdated,
  readOnly,
}: {
  api: EditorApi;
  nodeId: string;
  section: PropertyFieldSection;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  if (section.columnType === "json") {
    return (
      <JsonPropertyFieldSection
        api={api}
        nodeId={nodeId}
        section={section}
        onUpdated={onUpdated}
        readOnly={readOnly}
      />
    );
  }

  if (section.columnType === "imp_graph") {
    return (
      <ImpGraphPropertyFieldSection
        api={api}
        nodeId={nodeId}
        section={section}
        onUpdated={onUpdated}
        readOnly={readOnly}
      />
    );
  }

  return (
    <section className="tome-record-section tome-property-field-section">
      <h2 className="tome-section-title">{section.title}</h2>
      <p className="tome-property-field-unsupported">
        Unsupported property type “{section.columnType}”.
      </p>
    </section>
  );
}

function JsonPropertyFieldSection({
  api,
  nodeId,
  section,
  onUpdated,
  readOnly,
}: {
  api: EditorApi;
  nodeId: string;
  section: PropertyFieldSection;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  const initial = useMemo(() => serializeJsonValue(section.value), [section.value]);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(serializeJsonValue(section.value));
    setError(null);
  }, [section.value]);

  const save = async () => {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = text.trim() ? (JSON.parse(text) as unknown) : null;
      await api.updateStructuredProperty(nodeId, section.databaseId, section.key, parsed);
      onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tome-record-section tome-property-field-section">
      <div className="tome-property-field-header">
        <h2 className="tome-section-title">{section.title}</h2>
        <button type="button" disabled={readOnly || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        className="tome-property-field-json"
        value={text}
        disabled={readOnly || saving}
        rows={8}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <p className="tome-property-field-error">{error}</p> : null}
    </section>
  );
}

function ImpGraphPropertyFieldSection({
  api,
  nodeId,
  section,
  onUpdated,
  readOnly,
}: {
  api: EditorApi;
  nodeId: string;
  section: PropertyFieldSection;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  const match = getPropertyFieldRegistration("imp_graph");
  const [value, setValue] = useState(section.value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(section.value);
  }, [section.value]);

  const persist = useCallback(
    async (next: unknown) => {
      setValue(next);
      setError(null);
      try {
        await api.updateStructuredProperty(nodeId, section.databaseId, section.key, next);
        onUpdated();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, nodeId, onUpdated, section.databaseId, section.key],
  );

  if (!match) {
    return (
      <JsonPropertyFieldSection
        api={api}
        nodeId={nodeId}
        section={section}
        onUpdated={onUpdated}
        readOnly={readOnly}
      />
    );
  }

  const { registration, component } = match;
  const FieldComponent = registration.Component;

  const ctx = {
    component: {
      id: component.id,
      extensionId: component.extensionId,
      implementationId: component.implementationId,
      label: component.label || section.title,
      params: {} as Record<string, unknown>,
    },
    blockType: section.columnType,
    nodeId,
    invoke: (input: unknown) => invokePageBlockExtension(component.id, input, nodeId),
    openToolPanel: openPageBlockToolPanel,
    closeToolPanel: closePageBlockToolPanel,
  };

  return (
    <section className="tome-record-section tome-property-field-section">
      <h2 className="tome-section-title">{section.title}</h2>
      {
        FieldComponent({
          ctx,
          blockData: value ?? {},
          onBlockDataChange: (data: unknown) => {
            void persist(data);
          },
          readOnly,
        }) as ReactNode
      }
      {error ? <p className="tome-property-field-error">{error}</p> : null}
    </section>
  );
}

function serializeJsonValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

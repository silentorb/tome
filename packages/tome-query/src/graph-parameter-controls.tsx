import type { GraphParameterSpec, GraphParameterValue } from "./parameters";

export function GraphParameterControls({
  parameters,
  values,
  onChange,
  className,
}: {
  parameters: GraphParameterSpec[];
  values: Record<string, GraphParameterValue>;
  onChange: (paramId: string, value: GraphParameterValue) => void;
  className?: string;
}) {
  if (parameters.length === 0) return null;
  return (
    <div className={className ?? "tome-graph-parameter-controls"}>
      {parameters.map((param) => {
        const value = Object.prototype.hasOwnProperty.call(values, param.id)
          ? values[param.id]!
          : param.defaultValue;
        if (typeof param.defaultValue === "boolean" || typeof value === "boolean") {
          const checked = Boolean(value);
          return (
            <label key={param.id} className="tome-graph-parameter-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(param.id, event.target.checked)}
              />
              <span>{param.label}</span>
            </label>
          );
        }
        if (typeof param.defaultValue === "number" || typeof value === "number") {
          return (
            <label key={param.id} className="tome-graph-parameter-item">
              <span>{param.label}</span>
              <input
                type="number"
                value={typeof value === "number" ? value : Number(value) || 0}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  onChange(param.id, Number.isFinite(n) ? n : 0);
                }}
              />
            </label>
          );
        }
        return (
          <label key={param.id} className="tome-graph-parameter-item">
            <span>{param.label}</span>
            <input
              type="text"
              value={value == null ? "" : String(value)}
              onChange={(event) => onChange(param.id, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Node, Properties, PropertyValue } from "../graph";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedNodeFile {
  id: string;
  properties: Properties;
  body: string;
}

function frontmatterToProperties(data: Record<string, unknown>): Properties {
  const properties: Properties = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "labels") continue;
    if (value === undefined) continue;
    properties[key] = value as PropertyValue;
  }
  return properties;
}

export function parseNodeFile(id: string, raw: string): ParsedNodeFile {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const match = FRONTMATTER_RE.exec(trimmed);
  if (!match) {
    throw new Error(`Node file ${id}.md: missing YAML frontmatter`);
  }

  const yamlBlock = match[1] ?? "";
  const body = match[2] ?? "";
  const data = parseYaml(yamlBlock);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Node file ${id}.md: frontmatter must be a mapping`);
  }

  const properties = frontmatterToProperties(data as Record<string, unknown>);
  return { id, properties, body };
}

export function serializeNodeFile(node: Node, body: string): string {
  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    if (key === "body") continue;
    if (value === undefined) continue;
    frontmatter[key] = value;
  }

  const yamlBlock = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const normalizedBody = body.replace(/\r\n/g, "\n");
  if (!normalizedBody) return `---\n${yamlBlock}\n---\n`;
  return `---\n${yamlBlock}\n---\n${normalizedBody.endsWith("\n") ? normalizedBody : `${normalizedBody}\n`}`;
}

export function nodeFromFile(id: string, raw: string): Node {
  const parsed = parseNodeFile(id, raw);
  return {
    id: parsed.id,
    properties: { ...parsed.properties, body: parsed.body },
  };
}

export function bodyFromNode(node: Node): string {
  const body = node.properties.body;
  return typeof body === "string" ? body : "";
}

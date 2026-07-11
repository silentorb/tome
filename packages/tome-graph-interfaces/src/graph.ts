export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | PropertyValue[]
  | { [key: string]: PropertyValue };

export type Properties = Record<string, PropertyValue>;

export interface Node {
  id: string;
  properties: Properties;
}

export interface Relationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  properties: Properties;
  recordId?: string;
}

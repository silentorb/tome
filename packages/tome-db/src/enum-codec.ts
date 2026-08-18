import type { Properties } from "tome-graph-interfaces";
import {
  compareEnumLabels,
  compareEnumLabelsForColumn,
  decodeEnumProperties as decodeEnumPropertiesShared,
  decodePropertyLiteral,
  encodeEnumProperties as encodeEnumPropertiesShared,
  encodePropertyLiteral,
  enumIdForPropertyKey,
  indexToEnumLabel,
  labelToEnumIndex,
  resolveEnumIdForPropertyName,
} from "tome-flatfile/enum-property-codec";
import type { EnumDefinition, SchemaFile } from "tome-flatfile/schema-file";

export {
  compareEnumLabels,
  compareEnumLabelsForColumn,
  encodePropertyLiteral,
  decodePropertyLiteral,
  enumIdForPropertyKey,
  indexToEnumLabel,
  labelToEnumIndex,
  resolveEnumIdForPropertyName,
};

export function encodeEnumProperties(properties: Properties, schema: SchemaFile): Properties {
  return encodeEnumPropertiesShared(properties, schema);
}

export function decodeEnumProperties(properties: Properties, schema: SchemaFile): Properties {
  return decodeEnumPropertiesShared(properties, schema);
}

export type { EnumDefinition };

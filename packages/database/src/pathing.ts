import { AdvancedNodePath, DatabaseConfig, DataSource, NodePath } from './types'
import { DataSchema, RecordLink, Structure, TypeDefinition } from '@tome/data-api'
import { joinPaths } from './file-operations'
import path from 'path'

export const idFromPath = (pathString: string) =>
  pathString
    .replace(/^\//, '')
    .replace(/\.md$/, '')

// This could be optimized but is good enough for now
export const dropFirstPathToken = (filePath: string) =>
  filePath.split('/').splice(1).join('/')

export function getStructureByTitle(schema: DataSchema, name: string): TypeDefinition | undefined {
  return Object.values(schema.types).filter(s => s.title == name)[0]
}

export function getStructureByPath(schema: DataSchema, name: string): TypeDefinition | undefined {
  return schema.types[name]
}

export const tokenPathsMatch = (first: string[], second: string[]): boolean => {
  if (first.length != second.length)
    return false

  for (let i = 0; i < first.length; ++i) {
    if (first[i] != second[i])
      return false
  }

  return true
}

export function getMapValueByPathTokens<T>(map: {[key: string]: T}, tokens : string[]): [T | undefined, number] {
  for (const [name, source] of Object.entries(map)) {
    const nameTokens = name.split('/')
    if (tokenPathsMatch(nameTokens, tokens.slice(0, nameTokens.length)))
      return [source, nameTokens.length]
  }
  return [undefined, 0]
}

function getStructure(tokens: string[], schema: DataSchema): [TypeDefinition | undefined, number] {
  return getMapValueByPathTokens(schema.types, tokens)
}

const getTokens = (resourcePath: string) => resourcePath.split('/')

export function getDataSourceFromPath(config: DatabaseConfig, tokens : string[]): [DataSource | undefined, number] {
  return getMapValueByPathTokens(config.sources, tokens)
}

export function getNodePath(config: DatabaseConfig, resourcePath: string): NodePath {
  const tokens = getTokens(resourcePath)
  const [source, sourceLength] = getDataSourceFromPath(config, tokens)
  const schema = source ? config.schemas[source.id] : undefined
  const tokens2 = tokens.slice(sourceLength)
  const [type, structureLength] = schema ? getStructure(tokens2, schema) : [undefined, 0]
  const tokens3 = tokens2.slice(structureLength)
  const nodeName = tokens3.length > 0
    ? tokens3.join('/')
    : type
      ? 'index'
      : undefined

  return {
    path: resourcePath,
    schema,
    schemaFilePath: source?.filePath,
    type,
    nodeName,
  }
}

export async function getAdvancedNodePath(config: DatabaseConfig, resourcePath: string): Promise<AdvancedNodePath> {
  const nodePath = getNodePath(config, resourcePath)
  return {
    ...nodePath,
    title: nodePath.nodeName || 'Unknown',
  }
}

export const getNodeFilePath = (nodePath: NodePath) => {
  const base = nodePath.schemaFilePath || ''
  return nodePath.type
    ? joinPaths(base, nodePath.type.path, nodePath.nodeName || '')
    : joinPaths(base, dropFirstPathToken(nodePath.path)) // This assumes the first token of the child path is already included in the base path
}

export const getMarkdownDocumentFilePath = (nodePath: NodePath) => {
  const baseFilePath = getNodeFilePath(nodePath)
  return `${baseFilePath}.md`
}

export const getIndexDirectoryPath = (nodePath: NodePath): string | undefined => {
  if (isDataSource(nodePath))
    return nodePath.schemaFilePath

  const newNodePath = nodePath.nodeName == 'index'
    ? { ...nodePath, nodeName: undefined }
    : nodePath

  return getNodeFilePath(newNodePath)
}

export const childNodePath = (config: DatabaseConfig, parent: NodePath) => (childName: string): NodePath => {
  const path = `${parent.path}/${childName}`
  const schema = parent.schema
  return {
    ...parent,
    path,
    type: parent.type || (schema ? getStructure(getTokens(path), schema)[0] : undefined),
    nodeName: childName,
  }
}

export const isDataSource = (nodePath: NodePath): boolean =>
  nodePath.path == nodePath.schema?.id

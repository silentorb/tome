import { AdvancedNodePath, DatabaseConfig, DataSource, NodePath } from './types'
import { DataSchema, Structure } from '@tome/data-api'
import { joinPaths } from './file-operations'
import path from 'path'

export const idFromPath = (pathString: string) =>
  pathString
    .replace(/^\//, '')
    .replace(/\.md$/, '')

// This could be optimized but is good enough for now
export const dropFirstPathToken = (filePath: string) =>
  filePath.split('/').splice(1).join('/')

export function getStructureByTitle(schema: DataSchema, name: string): Structure | undefined {
  return Object.values(schema.structures).filter(s => s.title == name)[0]
}

export function getStructureByPath(schema: DataSchema, name: string): Structure | undefined {
  return schema.structures[name]
}

function getStructure(tokens: string[], schema: DataSchema | undefined): Structure | undefined {
  const structureName = tokens[1]
  return schema && structureName ? getStructureByPath(schema, structureName) : undefined
}

const getTokens = (resourcePath: string) => resourcePath.split('/')

export function getNodePath(config: DatabaseConfig, resourcePath: string): NodePath {
  const tokens = getTokens(resourcePath)
  const sourceName = tokens[0]

  // TODO: Support structure paths with multiple tokens instead of just one
  const schema = config.schemas[sourceName]
  const source = config.sources[sourceName]
  const structure = getStructure(tokens, schema)
  const nodeName = tokens.length > 2
    ? tokens[tokens.length - 1]
    : structure
      ? 'index'
      : undefined

  return {
    path: resourcePath,
    schema,
    schemaFilePath: source?.filePath,
    structure,
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
  return nodePath.structure
    ? joinPaths(base, nodePath.structure.path, nodePath.nodeName || '')
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
  const source = parent.schema
  return {
    ...parent,
    path,
    structure: parent.structure || getStructure(getTokens(path), source),
    nodeName: childName,
  }
}

export const isDataSource = (nodePath: NodePath): boolean =>
  nodePath.path == nodePath.schema?.id

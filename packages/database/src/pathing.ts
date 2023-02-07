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

// export function getStructureFromId(config: DatabaseConfig, id: string): Structure | undefined {
//   const pathTokens = id.split('/')
//   if (pathTokens.length < 2)
//     throw new Error(`Incomplete id path: ${id}`)
//
//   // TODO: This will also need to route databases based on the first path token once multiple databases are supported
//   const pluralName = pathTokens[pathTokens.length - 2]
//
//   const schema = getDefaultDataSource(config).schema
//   return getStructureByPathName(schema, pluralName)
// }

function getStructure(tokens: string[], source: DataSource | undefined): Structure | undefined {
  const structureName = tokens[1]
  return source && structureName ? getStructureByPath(source.schema, structureName) : undefined
}

const getTokens = (resourcePath: string) => resourcePath.split('/')

export function getNodePath(config: DatabaseConfig, resourcePath: string): NodePath {
  const tokens = getTokens(resourcePath)
  const sourceName = tokens[0]

  // TODO: Support structure paths with multiple tokens instead of just one
  const source = sourceName ? config.sources[sourceName] : undefined
  const structure = getStructure(tokens, source)
  const nodeName = tokens.length > 2
    ? tokens[tokens.length - 1]
    : structure
      ? 'index'
      : undefined

  return {
    path: resourcePath,
    source,
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
  const base = nodePath.source?.filePath || ''
  return nodePath.structure
    ? joinPaths(base, nodePath.structure.path, nodePath.nodeName || '')
    : joinPaths(base, dropFirstPathToken(nodePath.path)) // This assumes the first token of the child path is already included in the base path
}

export const getMarkdownDocumentFilePath = (nodePath: NodePath) => {
  const baseFilePath = getNodeFilePath(nodePath)
  return `${baseFilePath}.md`
}

export const getIndexDirectoryPath = (nodePath: NodePath) => {
  if (isDataSource(nodePath))
    return nodePath.source!!.filePath

  const newNodePath = nodePath.nodeName == 'index'
    ? { ...nodePath, nodeName: undefined }
    : nodePath

  return getNodeFilePath(newNodePath)
}

export const childNodePath = (config: DatabaseConfig, parent: NodePath) => (childName: string): NodePath => {
  const path = `${parent.path}/${childName}`
  const source = parent.source
  return {
    path,
    source,
    structure: parent.structure || getStructure(getTokens(path), source),
    nodeName: childName,
  }
}

export const isDataSource = (nodePath: NodePath): boolean =>
  nodePath.path == nodePath.source?.id

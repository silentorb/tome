import { AdvancedNodePath, DatabaseConfig, NodePath } from './types'
import { DataSchema, Structure } from '@tome/data-api'
import { joinPaths } from './file-operations'

export const idFromPath = (pathString: string) =>
  pathString
    .replace(/^\//, '')
    .replace(/\.md$/, '')

export function getStructureByName(schema: DataSchema, name: string): Structure | undefined {
  return schema.structures.filter(s => s.name == name)[0]
}

export function getStructureByPathName(schema: DataSchema, name: string): Structure | undefined {
  return schema.structures.filter(s => s.path == name)[0]
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

export function getNodePath(config: DatabaseConfig, resourcePath: string): NodePath {
  const tokens = resourcePath.split('/')
  const sourceName = tokens[0]
  const nodeName = tokens.length > 1 ? tokens[tokens.length - 1] : undefined

  // Todo: Support structure paths with multiple tokens instead of just one
  const structureName = tokens.length > 2 ? tokens[1] : undefined
  const source = sourceName ? config.sources[sourceName] : undefined
  const structure = source && structureName ? getStructureByPathName(source.schema, structureName) : undefined

  return {
    path: resourcePath,
    source,
    structure,
    nodeName,
  }
}

export async function geAdvancedNodePath(config: DatabaseConfig, resourcePath: string): Promise<AdvancedNodePath> {
  const nodePath = getNodePath(config, resourcePath)
  return {
    ...nodePath,
    title: nodePath.nodeName || 'Unknown',
  }
}

export const getNodeFilePath = (nodePath: NodePath) => {
  return joinPaths(nodePath.source?.filePath || '', nodePath.structure?.path || '', nodePath.nodeName || '')
}

export const getMarkdownDocumentFilePath = (nodePath: NodePath) => {
  const baseFilePath = getNodeFilePath(nodePath)
  return `${baseFilePath}.md`
}

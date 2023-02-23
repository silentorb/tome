import { AdvancedNodePath, DatabaseConfig, DataSource, NodePath } from './types'
import { DataSchema, TypeDefinition } from '@tome/data-api'
import { fileExists, joinPaths } from './file-operations'

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

export function getMapValueByPathTokens<T>(map: { [key: string]: T }, tokens: string[]): [T | undefined, number] {
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

export function getDataSourceFromPath(config: DatabaseConfig, tokens: string[]): [DataSource | undefined, number] {
  return getMapValueByPathTokens(config.sources, tokens)
}

export const getNodeFilePath = (source: DataSource, path: string, nodeName?: string, type?: TypeDefinition) => {
  const base = source.filePath || ''
  return type
    ? joinPaths(base, source.typeFilePaths[type.id], nodeName || '')
    : joinPaths(base, dropFirstPathToken(path)) // This assumes the first token of the child path is already included in the base path
}

export function getNodePath(source: DataSource, schema: DataSchema, path: string, tokenNodeName?: string, type?: TypeDefinition): NodePath | undefined {
  const nodeName = tokenNodeName || (type
      ? 'index'
      : undefined
  )

  return {
    path,
    schema,
    filePath: getNodeFilePath(source, path, tokenNodeName, type),
    type,
    nodeName,
  }
}

export function getNodePathFromPath(config: DatabaseConfig, resourcePath: string): NodePath | undefined {
  const tokens = getTokens(resourcePath)
  const [source, sourceLength] = getDataSourceFromPath(config, tokens)
  if (!source)
    return undefined

  const schema = config.schemas[source.id]
  const tokens2 = tokens.slice(sourceLength)
  const [type, structureLength] = schema ? getStructure(tokens2, schema) : [undefined, 0]
  const tokens3 = tokens2.slice(structureLength)
  const tokenNodeName = tokens3.length > 0
    ? tokens3.join('/')
    : undefined

  const nodeName = tokenNodeName || (type
      ? 'index'
      : undefined
  )
  return {
    path: resourcePath,
    schema,
    filePath: getNodeFilePath(source, resourcePath, tokenNodeName, type),
    type,
    nodeName,
  }
}

// Used to resolve union type indirection.
export async function resolveNodePath(config: DatabaseConfig, nodePath: NodePath): Promise<NodePath | undefined> {
  const types = nodePath.type?.union
  const { nodeName, schema } = nodePath
  if (types && types.length > 0 && schema) {
    for (const typeReference of types) {
      const source = config.sources[schema.id]
      const type = schema.types[typeReference.name]
      const resolvedNodePath = getNodePath(source, schema, `${source.id}/${type.id}/${nodeName}`, nodeName, type)
      if (!resolvedNodePath)
        continue

      if (await fileExists(getMarkdownDocumentFilePath(resolvedNodePath)))
        return resolvedNodePath
    }

    return undefined
  }

  return nodePath
}

export async function getResolvedNodePath(config: DatabaseConfig, resourcePath: string): Promise<NodePath | undefined> {
  const nodePath = getNodePathFromPath(config, resourcePath)
  return nodePath ? resolveNodePath(config, nodePath) : undefined
}

export function getNodePathOrError(config: DatabaseConfig, resourcePath: string): NodePath {
  const nodePath = getNodePathFromPath(config, resourcePath)
  if (!nodePath)
    throw new Error(`invalid node path: ${resourcePath}`)

  return nodePath
}

export async function getAdvancedNodePath(config: DatabaseConfig, resourcePath: string): Promise<AdvancedNodePath | undefined> {
  const nodePath = getNodePathFromPath(config, resourcePath)
  return nodePath
    ? {
      ...nodePath,
      title: nodePath.nodeName || 'Unknown',
    }
    : undefined
}

export const getMarkdownDocumentFilePath = (nodePath: NodePath) => {
  return `${nodePath.filePath}.md`
}

export const getIndexDirectoryPath = (nodePath: NodePath): string | undefined => {
  if (isDataSource(nodePath))
    return nodePath.filePath

  const newNodePath = nodePath.nodeName == 'index'
    ? { ...nodePath, nodeName: undefined }
    : nodePath

  return newNodePath.filePath
}

export const childNodePath = (config: DatabaseConfig, parent: NodePath) => (childName: string): NodePath => {
  const path = `${parent.path}/${childName}`
  const schema = parent.schema
  return {
    ...parent,
    path,
    filePath: `${parent.filePath}/${childName}`,
    type: parent.type || (schema ? getStructure(getTokens(path), schema)[0] : undefined),
    nodeName: childName,
  }
}

export const isDataSource = (nodePath: NodePath): boolean =>
  nodePath.path == nodePath.schema?.id

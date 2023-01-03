import { DataSchema, ExpandedDocument, Structure } from '@tome/data-api'
import { DatabaseConfig } from './types'
import path from 'path'
import { parseMarkdownAST, processHeaders } from './markdown-parsing'
import { getDefaultDataSource } from './database'

export function getStructureByName(schema: DataSchema, name: string): Structure | undefined {
  return schema.structures.filter(s => s.name == name)[0]
}

export function getStructureByPathname(schema: DataSchema, name: string): Structure | undefined {
  return schema.structures.filter(s => s.path == name)[0]
}

export function getStructureFromId(config: DatabaseConfig, id: string): Structure | undefined {
  const pathTokens = id.split('/')
  if (pathTokens.length < 2)
    throw new Error(`Incomplete id path: ${id}`)

  // TODO: This will also need to route databases based on the first path token once multiple databases are supported
  const pluralName = pathTokens[pathTokens.length - 2]

  const schema = getDefaultDataSource(config).schema
  return getStructureByPathname(schema, pluralName)
}

export async function expandDocument(config: DatabaseConfig, id: string, content: string, structure?: Structure): Promise<ExpandedDocument> {
  if (!structure) {
    return {
      content,
      lists: [],
    }
  }

  const data = await parseMarkdownAST(content)
  const lists = processHeaders(path.dirname(id), data, structure)

  return {
    content,
    lists,
  }
}

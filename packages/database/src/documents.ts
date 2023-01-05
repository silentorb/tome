import { ExpandedDocument, Structure } from '@tome/data-api'
import { DatabaseConfig } from './types'
import path from 'path'
import { parseMarkdownAST, processHeaders } from './markdown-parsing'

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

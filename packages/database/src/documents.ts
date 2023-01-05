import { ExpandedDocument, Structure } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { parseMarkdownAST, processHeadings } from './markdown-parsing'

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  if (!nodePath.structure) {
    return {
      content,
      lists: [],
    }
  }

  const data = await parseMarkdownAST(content)
  const lists = processHeadings(path.dirname(nodePath.path), nodePath, data)

  return {
    content,
    lists,
  }
}

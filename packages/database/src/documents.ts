import { ExpandedDocument } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { parseMarkdownAST, processHeadings } from './markdown-parsing'
import { generateMarkdown } from './markdown-generation'

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  if (!nodePath.structure) {
    return {
      content,
      lists: [],
    }
  }

  const data = await parseMarkdownAST(content)
  const lists = processHeadings(path.dirname(nodePath.path), nodePath, data)

  const updatedContent = await generateMarkdown(data)
  return {
    content: updatedContent,
    lists,
  }
}

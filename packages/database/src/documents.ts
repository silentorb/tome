import { ExpandedDocument } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { getMarkdownTitle, parseMarkdownAST, processHeadings } from './markdown-parsing'
import { generateDocumentAppendingAst, generateMarkdown } from './markdown-generation'

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  const data = await parseMarkdownAST(content)
  const title = getMarkdownTitle(data) || nodePath.nodeName || 'Unknown'
  if (!nodePath.structure) {
    return {
      title,
      content,
      lists: [],
    }
  }

  const lists = processHeadings(path.dirname(nodePath.path), nodePath, data)

  const updatedContent = await generateMarkdown(data)
  return {
    title,
    content: updatedContent,
    lists,
  }
}

export async function stringifyDocument(nodePath: NodePath, document: ExpandedDocument) {
  const additionalContent = await generateMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  return `${document.content}\n${additionalContent}`
}

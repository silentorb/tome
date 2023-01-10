import { ExpandedDocument } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { parseMarkdownAST, processHeadings } from './markdown-parsing'
import { generateDocumentAppendingAst, generateMarkdown } from './markdown-generation'

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

export async function stringifyDocument(nodePath: NodePath, document: ExpandedDocument) {
  const additionalContent = await generateMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  return `${document.content}\n${additionalContent}`
}

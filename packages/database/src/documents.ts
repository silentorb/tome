import { ExpandedDocument, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { getMarkdownTitle, parseMarkdownAST, processHeadings, processIndexList } from './markdown-parsing'
import { generateDocumentAppendingAst, generateMarkdown } from './markdown-generation'

function getTitle(data: any, nodePath: NodePath): string {
  return getMarkdownTitle(data) || nodePath.nodeName || 'Unknown'
}

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  const data = await parseMarkdownAST(content)
  const title = getTitle(data, nodePath)
  if (!nodePath.structure) {
    return {
      title,
      content,
      lists: [],
    }
  }

  const lists = processHeadings(nodePath, data)

  const updatedContent = await generateMarkdown(data)
  return {
    title,
    content: updatedContent,
    lists,
  }
}

export async function expandIndexList(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<RecordLink[]> {
  const data = await parseMarkdownAST(content)
  return processIndexList(nodePath, data)
}

export async function stringifyDocument(nodePath: NodePath, document: ExpandedDocument) {
  const additionalContent = await generateMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  return `${document.content}\n${additionalContent}`
}

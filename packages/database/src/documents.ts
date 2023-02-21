import { ExpandedDocument, IndexNode, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { getMarkdownTitle, parseMarkdownAST, processHeadings, processIndexList } from './markdown-parsing'
import { generateDocumentAppendingAst, generateIndexListAst, stringifyMarkdown } from './markdown-generation'
import { getMarkdownDocumentFilePath } from './pathing'
import { loadDocumentContent } from './reading'

export function titleOrFallback(nodePath: NodePath, title?: string) {
  return title || nodePath.nodeName || 'Unknown'
}

export function getDocumentTitle(data: any, nodePath: NodePath): string {
  return titleOrFallback(nodePath, getMarkdownTitle(data))
}

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  const data = await parseMarkdownAST(content)
  const title = getDocumentTitle(data, nodePath)
  if (!nodePath.structure) {
    return {
      title,
      content,
      lists: [],
    }
  }

  const lists = processHeadings(nodePath, data)

  const updatedContent = await stringifyMarkdown(data)
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
  const additionalContent = await stringifyMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  return `${document.content}\n${additionalContent}`
}

const consolidateListItems = (items: RecordLink[]): RecordLink[] =>
  items.reduce((a, b) => a.some(i => i.id == b.id) ? a : a.concat([b]), [] as RecordLink[])

export function refineDocument(document: ExpandedDocument): ExpandedDocument {
  const lists = document.lists.map(list => ({
    ...list,
    items: consolidateListItems(list.items),
  }))
  return {
    ...document,
    lists,
  }
}

export async function refineAndStringifyDocument(nodePath: NodePath, document: ExpandedDocument) {
  return stringifyDocument(nodePath, refineDocument(document))
}

export async function stringifyIndex(nodePath: NodePath, items: RecordLink[]) {
  const additionalContent = await stringifyMarkdown(
    generateIndexListAst(nodePath.path, items)
  )

  const { structure } = nodePath

  const titleClause = structure
    ? `# ${structure?.title}\n\n`
    : ''

  return `${titleClause}${additionalContent}`
}

import { DocumentList, ExpandedDocument, IndexNode, Property, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from './types'
import path from 'path'
import { getMarkdownTitle, parseMarkdownAST, processHeadings, processIndexList } from './markdown-parsing'
import { generateDocumentAppendingAst, generateIndexListAst, stringifyMarkdown } from './markdown-generation'
import { getMarkdownDocumentFilePath } from './pathing'
import { loadDocumentContent } from './reading'
import { sortLinks } from '@tome/data-processing/dist/src'

export function titleOrFallback(nodePath: NodePath, title?: string) {
  return title || nodePath.nodeName || 'Unknown'
}

export function getDocumentTitle(data: any, nodePath: NodePath): string {
  return titleOrFallback(nodePath, getMarkdownTitle(data))
}

export function getListItems(lists: DocumentList[], id: string): RecordLink[] | undefined {
  return lists.filter(list => list.id == id)[0]?.items
}

export async function expandDocument(config: DatabaseConfig, nodePath: NodePath, content: string): Promise<ExpandedDocument> {
  const data = await parseMarkdownAST(content)
  const title = getDocumentTitle(data, nodePath)
  const { type } = nodePath
  if (!type) {
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
    type: type.id,
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
  const { type } = nodePath

  const additionalContent = await stringifyMarkdown(
    generateIndexListAst(nodePath.path, sortLinks(undefined, items))
  )

  const titleClause = type
    ? `# ${type?.title}\n\n`
    : ''

  return `${titleClause}${additionalContent}`
}

export const recordLinkListsHaveSameOrder = (first: RecordLink[], second: RecordLink[]): boolean => {
  if (first.length != second.length)
    return false

  for (let i = 0; i < first.length; ++i) {
    if (first[i].id != second[i].id)
      return false
  }

  return true
}

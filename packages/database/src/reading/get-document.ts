import { readFile } from '../file-operations'
import { DocumentNode, ExpandedDocument } from '@tome/data-api'
import { expandDocument, getDocumentTitle, titleOrFallback } from '../documents'
import { DatabaseConfig, NodePath } from '../types'
import { getMarkdownDocumentFilePath } from '../pathing'
import { parseMarkdownAST } from '../markdown-parsing'

export async function loadDocumentContent(config: DatabaseConfig, nodePath: NodePath): Promise<string | undefined> {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  return readFile(filePath)
}

export async function loadDocumentTitle(config: DatabaseConfig, nodePath: NodePath): Promise<string> {
  const { structure} = nodePath
  if (structure && nodePath.path == `${nodePath.source?.id}/${structure.path}` && structure.title)
    return structure.title

  const content = await loadDocumentContent(config, nodePath)
  if (!content)
    return titleOrFallback(nodePath)

  const data = await parseMarkdownAST(content)
  return getDocumentTitle(data, nodePath)
}

export async function loadExpandedDocument(config: DatabaseConfig, nodePath: NodePath): Promise<ExpandedDocument | undefined> {
  const content = await loadDocumentContent(config, nodePath)
  if (typeof content !== 'string')
    return undefined

  return expandDocument(config, nodePath, content)
}

export async function loadDocumentNode(config: DatabaseConfig, nodePath: NodePath): Promise<DocumentNode | undefined> {
  const document = await loadExpandedDocument(config, nodePath)
  return document ? {
    type: 'document',
    id: nodePath.path,
    document,
    structure: nodePath.structure,
  } : undefined
}

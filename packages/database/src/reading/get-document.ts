import { readFile } from '../file-operations'
import { DocumentNode, ExpandedDocument } from '@tome/data-api'
import { expandDocument } from '../documents'
import { DatabaseConfig, NodePath } from '../types'
import { getMarkdownDocumentFilePath } from '../pathing'

export async function loadDocumentContent(config: DatabaseConfig, nodePath: NodePath): Promise<string | undefined> {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  return readFile(filePath)
}

export async function loadExpandedDocument(config: DatabaseConfig, nodePath: NodePath): Promise<ExpandedDocument | undefined> {
  const content = await loadDocumentContent(config, nodePath)
  if (!content)
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

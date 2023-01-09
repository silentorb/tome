import { readFile } from '../file-operations'
import { DocumentNode, ExpandedDocument } from '@tome/data-api'
import { expandDocument } from '../documents'
import { DatabaseConfig, NodePath } from '../types'
import { getMarkdownDocumentFilePath } from '../pathing'

export async function getDocument(config: DatabaseConfig, nodePath: NodePath): Promise<ExpandedDocument | undefined> {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const content = await readFile(filePath)
  if (!content)
    return undefined

  return expandDocument(config, nodePath, content)
}

export async function getDocumentNode(config: DatabaseConfig, nodePath: NodePath): Promise<DocumentNode | undefined> {
  const document = await getDocument(config, nodePath)
  return document ? {
    type: 'document',
    id: nodePath.path,
    document,
    structure: nodePath.structure,
  } : undefined
}

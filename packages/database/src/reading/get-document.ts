import { readFile } from '../file-operations'
import {  DocumentNode } from '@tome/data-api'
import { expandDocument } from '../documents'
import { DatabaseConfig, NodePath } from '../types'

export async function getDocument(config: DatabaseConfig, nodePath: NodePath, filePath: string): Promise<DocumentNode> {
  const content = await readFile(filePath)
  const document = await expandDocument(config, nodePath, content)
  if (content) {
    return {
      type: 'document',
      id: nodePath.path,
      document,
      structure: nodePath.structure,
    }
  } else {
    throw new Error('Could not find file and proper error handling for this is not yet implemented.')
  }
}

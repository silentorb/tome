import { readFile } from '../file-operations'
import {  DocumentNode } from '@tome/data-api'
import { expandDocument, getStructureFromId } from '../documents'
import { DatabaseConfig } from '../types'

export async function getDocument(config: DatabaseConfig, id: string, filePath: string): Promise<DocumentNode> {
  const content = await readFile(filePath)
  const structure = getStructureFromId(config, id)
  const document = await expandDocument(config, id, content, structure)
  if (content) {
    return {
      type: 'document',
      id,
      document,
      structure,
    }
  } else {
    throw new Error('Could not find file and proper error handling for this is not yet implemented.')
  }
}

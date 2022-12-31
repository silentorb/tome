import { readFile } from '../file-operations'
import { DocumentNode } from '@tome/data-api'

export async function getDocument(id: string, filePath: string): Promise<DocumentNode> {
  const content = await readFile(filePath)
  if (content) {
    return {
      type: 'document',
      id,
      document: {
        content,
      }
    }
  } else {
    throw new Error('Could not find file and proper error handling for this is not yet implemented.')
  }
}
import { readFile } from '../file-operations'
import { DocumentContainer } from 'tome-common'
import { idFromPath } from '../string-formatting'

export async function getDocument(filePath: string): Promise<DocumentContainer> {
  const content = await readFile(filePath)
  if (content) {
    return {
      type: 'document',
      id: idFromPath(filePath),
      document: {
        content,
      },
    }
  } else {
    throw new Error('Could not find file and proper error handling for this is not yet implemented.')
  }
}

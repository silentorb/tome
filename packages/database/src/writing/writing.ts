import { DatabaseConfig } from '../types'
import { getMarkdownDocumentFilePath } from '../resource-mapping'
import { writeFile } from '../file-operations'

export interface WriteDocumentProps {
  id: string
  content: string
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { id, content } = props
  const filePath = getMarkdownDocumentFilePath(config, id)
  await writeFile(filePath, content)
}

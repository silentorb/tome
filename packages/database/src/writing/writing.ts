import { DatabaseConfig, NodePath } from '../types'
import { writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath } from '../pathing'

export interface WriteDocumentProps {
  nodePath: NodePath
  content: string
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { nodePath, content } = props
  const filePath = getMarkdownDocumentFilePath(nodePath)
  await writeFile(filePath, content)
}

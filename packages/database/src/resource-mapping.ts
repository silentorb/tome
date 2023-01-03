import { joinPaths } from './file-operations'
import { DatabaseConfig } from './types'
import { getDefaultDataSource } from './database'

export const idFromPath = (pathString: string) =>
  pathString
    .replace(/^\//, '')
    .replace(/\.md$/, '')

export const getDocumentFilePath = (config: DatabaseConfig, id: string) =>
  joinPaths(getDefaultDataSource(config).filePath, id)

export const getMarkdownDocumentFilePath = (config: DatabaseConfig, id: string) =>
  `${getDocumentFilePath(config, id)}.md`

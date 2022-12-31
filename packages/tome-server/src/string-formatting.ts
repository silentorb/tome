import { ServerConfig } from './types'
import { joinPaths } from './file-operations'

export const capitalizeFirstLetter = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

export const idFromPath = (pathString: string) =>
  pathString
    .replace(/^\//, '')
    .replace(/\.md$/, '')

export const getDocumentFilePath = (config: ServerConfig, id: string) =>
  joinPaths(config.data.path, id)

export const getMarkdownDocumentFilePath = (config: ServerConfig, id: string) =>
  `${getDocumentFilePath(config, id)}.md`

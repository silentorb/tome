import { HtmlRenderer, ServerConfig } from '../types'
import fs from 'fs'
import { joinPaths, readFile } from '../file-operations'
import { renderIndexPage } from './index-page'
import { renderEditDocument } from './edit-document'

async function isExistingDirectory(filePath: string) {
  try {
    return (await fs.promises.lstat(filePath)).isDirectory()
  }
  catch {
    return false
  }
}

export const renderPageBaseOnResource: (config: ServerConfig) => HtmlRenderer = config => async context => {
  const urlPath = context.request.params.path || ''
  const baseFilePath = joinPaths(config.data.path, urlPath)
  const isDirectory = await isExistingDirectory(baseFilePath)
  const base = joinPaths('/', config.urlBase, urlPath, '/')
  let partial: any
  if (isDirectory) {
    partial = await renderIndexPage({ urlPath, filePath: baseFilePath })
  } else {
    const filePath = `${baseFilePath}.md`
    const content = await readFile(filePath)
    if (content) {
      partial = await renderEditDocument({ urlPath, filePath, content })
    } else {
      throw new Error('Could not find file and proper error handling for this is not yet implemented.')
    }
  }
  return { base, ...partial }
}

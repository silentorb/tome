import * as React from 'react'
import * as ReactDOMServer from 'react-dom/server'
import { EditDocument } from 'tome-common'
import { ReactElement } from 'react'
import { IndexPage } from 'tome-common/src/pages/index-page'
import { DefaultContext } from 'koa'
import { DatabaseConfig } from './types'
import { joinPaths, listFiles } from './file-operations'

export function renderElement(element: ReactElement) {
  return ReactDOMServer.renderToString(element)

}

export const renderPage = (config: DatabaseConfig) => async (context: DefaultContext) => {
  const urlPath = context.request.path
  const filePath = joinPaths(config.path, urlPath)
  const files = await listFiles(filePath)
  const items = files.map(file => ({
    path: file,
    title: file,
  }))

  const includeParentNavigation = urlPath != '/'
  context.body = renderElement(<IndexPage items={items} includeParentNavigation={includeParentNavigation}/>)
}

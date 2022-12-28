import React from 'react'
import { ReactElement } from 'react'
import ReactDOMServer from 'react-dom/server'
import { DefaultContext } from 'koa'
import { HtmlRenderer } from './types'
import { htmlTemplate } from './html'

export function renderElement(element: ReactElement) {
  return ReactDOMServer.renderToString(element)
}

export const renderPage = (render: HtmlRenderer) => async (context: DefaultContext) => {
  const htmlProps = await render(context)
  context.body = htmlTemplate(htmlProps)
}

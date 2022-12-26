import * as React from 'react'
import * as ReactDOMServer from 'react-dom/server'
import { EditDocument } from './pages'

export function renderPage() {
  return ReactDOMServer.renderToString(<EditDocument/>)
}

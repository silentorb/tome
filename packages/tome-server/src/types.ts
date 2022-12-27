import { DefaultContext } from 'koa'

export interface DatabaseConfig {
  path: string
}

export interface ServerConfig {
  data: DatabaseConfig
  port: number

  urlBase: string
}

export interface HtmlProps {
  title: string
  content: string
  base: string
}

export interface ResourcePageProps {
  filePath: string
  urlPath: string
}

export type HtmlRenderer = (context: DefaultContext) => Promise<HtmlProps>
export type PartialHtmlRenderer = (context: DefaultContext) => Promise<Omit<HtmlProps, 'base'>>

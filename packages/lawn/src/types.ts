import { DefaultContext } from 'koa'

export type HttpMethod = string

export type HttpHandler<Request, Response> = (request: Request) => Promise<Response>
export type HandlerAdapter<Request, Response> = (loader: HttpHandler<Request, Response>) => (context: DefaultContext) => void

export interface LawnServerConfig {
  port: number
}

export interface GenericEndpointDefinition<Request, Response> {
  path: string
  method: HttpMethod
  handler: HttpHandler<Request, Response>
}

export type EndpointDefinition = GenericEndpointDefinition<any, any>

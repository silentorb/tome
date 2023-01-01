import { DefaultContext } from 'koa'

export class HttpError extends Error {
  status: number
  body: any
  key: string = ''
  message: string

  constructor(message: string = 'Server Error', status: number = 500, body = {}) {
    super(message)
    this.status = status
    this.message = message // super(message) doesn't seem to be working.
    this.body = body
  }

  toString() {
    return super.toString() + ' ' + JSON.stringify(this.body)
  }
}

export interface Body {
  key: string
  data?: any
  errors?: any[]
}

export type BodyOrString = Body | string

export class BadRequest extends HttpError {
  constructor(message: string = 'Bad Request', bodyOrKey: BodyOrString = { key: '' }) {
    if (typeof bodyOrKey === 'string') {
      super(message, 400)
      this.key = bodyOrKey
    } else {
      super(message, 400, bodyOrKey)
      this.key = bodyOrKey.key
    }
  }
}

export class NeedsLogin extends HttpError {

  constructor(message: string = 'This request requires a logged in user') {
    super(message, 401)
  }
}

export class Unauthorized extends HttpError {

  constructor(message: string = 'You are not authorized to perform this request') {
    super(message, 403)
  }
}

export class NotFound extends HttpError {

  constructor(message: string = 'Resource not found') {
    super(message, 404)
  }
}

export class ServerError extends HttpError {

  constructor(message: string = 'Server Error') {
    super(message, 500)
  }
}

export interface ErrorHandlerProps {
  context: DefaultContext
  error: HttpError
  request?: object
}

export type ErrorHandler = (props: ErrorHandlerProps) => void

export const sendErrorResponse: ErrorHandler = (props: ErrorHandlerProps) => {
  const { context, error, request } = props
  const message = error.message = error.status == 500 ? 'Server Error' : error.message
  const body: any = {
    message: message,
    key: error.key || (error.body ? error.body.key : undefined)
  }

  context.status = error.status
  context.message = message
  context.body = body
}

export function sanitizeError(error: any): HttpError {
  const httpError = error || new ServerError()
  httpError.status = httpError.status || 500
  return httpError
}

export const chainErrorHandlers: (...handlers: ErrorHandler[]) => ErrorHandler = (...handlers) => props => {
  for (const handler of handlers) {
    handler(props)
  }
}

export function logErrorToConsole(error: HttpError) {
  if (!error.stack)
    console.error('Error', error.status, error.message)
  else
    console.error('Error', error.status, error.stack)
}

export const errorLoggingHandler: ErrorHandler = props => {
  logErrorToConsole(props.error)
}

// TODO: Move this to its own package (Maybe @vineyard/config)
export function getDebugBoolean(key: string, env: any = process.env) {
  const value = env[key]
  return value == '1' || value == 'true'
}

export const defaultErrorHandler: (env?: any) => ErrorHandler = (env = process.env) => {
  if (getDebugBoolean('LAWN_LOG_HTTP_ERRORS', env))
    return chainErrorHandlers(errorLoggingHandler, sendErrorResponse)

  return sendErrorResponse
}

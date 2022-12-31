import { ResourceLoader } from './types'
import { LoaderFunctionArgs } from 'react-router-dom'
import * as React from 'react'

export function getIdFromRequest(url: string) {
  const urlPath = new URL(url).pathname
  // if (urlPath == '/data')
  //   return '/'

  return urlPath
    .replace(/^\/data\/?/, '')
}

export function withRequestId<T>(loader: ResourceLoader<T>) {
  return ({ request }: LoaderFunctionArgs) => loader(getIdFromRequest(request.url))
}

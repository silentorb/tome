import { ResourceLoader } from './types'
import { LoaderFunctionArgs } from 'react-router-dom'
import axios from 'axios'

export function getIdFromRequest(url: string) {
  const urlPath = new URL(url).pathname
  return urlPath
    .replace(/^\/data\/?/, '')
    .replace(/\/$/, '')
}

export function withRequestId<T>(loader: ResourceLoader<T>) {
  return ({ request }: LoaderFunctionArgs) => loader(getIdFromRequest(request.url))
}

export const apiUrl = (path: string) =>
  `/api${path}`


export function withError(response: axios.AxiosResponse) {
  const { status } = response
  if (status < 200 || status >= 400)
    throw new Error(response.statusText)
}

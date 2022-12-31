import { GetNodeResponse } from '@tome/web-api'
import { Node } from '@tome/data-api'

export type ResourceLoader<T> = (id: string) => Promise<T>

export interface GetNodeProps {
  node?: Node
}

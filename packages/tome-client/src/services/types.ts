import { GetNodeResponse } from 'tome-common'

export type ResourceLoader<T> = (id: string) => Promise<T>

export interface GetNodeProps {
  container?: GetNodeResponse
}

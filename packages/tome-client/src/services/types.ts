import { NodeContainer } from 'tome-common'

export type ResourceLoader<T> = (id: string) => Promise<T>

export interface GetNodeProps {
  container?: NodeContainer
}

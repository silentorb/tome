import { Dispatch, SetStateAction } from 'react'
import { Property } from '@tome/data-api'

export type StatePair<T> = [T, Dispatch<SetStateAction<T>>]
export type StatePairs<T> = StatePair<T>[]
export type StatePairMap<T> = { [key: string]: StatePair<T> }

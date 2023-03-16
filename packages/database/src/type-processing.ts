import { ListOrder, TypeDefinition, TypeReference } from '@tome/data-api'
import { DatabaseConfig } from './types'

export function getReferencedTypeName(type: TypeReference): string | undefined {
  const { name, types } = type
  return name == 'list'
    ? types[types.length - 1]
    : name
}

export function getTypeOrder(config: DatabaseConfig, type: TypeDefinition): ListOrder | undefined {
  return undefined
}

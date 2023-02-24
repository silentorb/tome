import { TypeReference } from '@tome/data-api/dist/src'

export function getReferencedTypeName(type: TypeReference): string | undefined {
  const { name, types } = type
  return name == 'list'
    ? types[types.length - 1]
    : name
}

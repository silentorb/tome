import { TypeReference } from '@tome/data-api/dist/src'

const primitiveTypes = ['integer']

export function isPrimitiveType(type: TypeReference) {
  return primitiveTypes.includes(type.name)
}

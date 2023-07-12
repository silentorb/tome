import { Property, PropertyMap } from '@tome/data-api'
import { isPrimitiveType } from '@tome/data-processing'

export function getPrimitiveFieldProperties(properties: PropertyMap): Property[] {
  let result: Property[] = []
  for (const key in properties) {
    const property = properties[key]
    if (isPrimitiveType(property.type)) {
      result.push(property)
    }
  }

  return result
}

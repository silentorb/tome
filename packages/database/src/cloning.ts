/* Supports:
* Nested objects
* Nested arrays
* Strings
* Numbers
* Booleans
 */

export function deepClonePlainData<T>(value: T): T {
  const data = value as any
  if (Array.isArray(data)) {
    return data.map(deepClonePlainData) as any
  }

  if (typeof data == 'object') {
    const result: any = {}
    for (const [key, value] of data) {
      result[key] = deepClonePlainData(value)
    }
    return result
  }

  return data
}

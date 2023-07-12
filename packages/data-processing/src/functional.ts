
export const mapValues = (container: any, predicate: (value: any, key?: string, index?: number) => any) =>
  Object.fromEntries(
    Object.entries(container).map(
      ([key, value], index) => [key, predicate(value, key, index)]
    )
  )

import { GraphLibrary, Node, RecordLink, TypeReference } from '@tome/data-api'
import { QueryContext } from '../types'
import { getListItems } from '../documents'
import { newLibraryFunctions } from './library-creation'
import { loadNode } from '../reading'
import { getNodePath } from '../pathing'

type Item = Node | RecordLink

export const distinctLinks = (items: RecordLink[]): RecordLink[] =>
  Object.values(
    Object.fromEntries(
      items.map(i => [i.id, i])
    )
  )

const queryItem = (context: QueryContext, token: string) => async (item: Item) => {
  const { config, getDocument } = context
  const node: Node | undefined = 'type' in item
    ? item as Node
    : await loadNode(config, getDocument)(item.id)

  if (!node)
    return []

  const nodePath = await getNodePath(context.config, node.id)

  if ('document' in node) {
    const result = getListItems(node.document.lists, token) || []
    const type = nodePath?.type
    if (type) {
      const property = type.properties[token]
      if (property && property.type.name != 'list') {
        return result[0]
      }
    }
    return result
  }

  return node.items
}

export function newStandardQueryLibrary(): GraphLibrary {
  return {

    functions: newLibraryFunctions([
      function count(context: QueryContext, list: any[]) {
        return list && Array.isArray(list) ? list.length : 0
      },

      async function get(context: QueryContext, tokens: string[]) {
        if (tokens.length == 0)
          return undefined

        const { config, getDocument } = context
        const startingNode = await loadNode(config, getDocument)(tokens[0])
        if (tokens.length == 1 || !startingNode)
          return startingNode

        const remaining = tokens.slice(1)
        let currentValue: any = startingNode

        for (const token of remaining) {
          currentValue = Array.isArray(currentValue)
            ? distinctLinks(
              (
                await Promise.all(
                  currentValue.map(queryItem(context, token))
                )
              )
                .flat()
            )
            : await queryItem(context, token)(currentValue)
        }

        return currentValue
      },

    ])
  }
}

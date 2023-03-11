import { GraphLibrary, Node, RecordLink } from '@tome/data-api'
import { QueryContext } from '../types'
import { getListItems } from '../documents'
import { newLibraryFunctions } from './library-creation'
import { loadNode } from '../reading'

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
    ? item
    : await loadNode(config, getDocument)(item.id)

  if (!node)
    return []

  if ('document' in node)
    return getListItems(node.document.lists, token) || []

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
        let items: Item[] = [startingNode]
        for (const token of remaining) {
          items = distinctLinks(
            (
              await Promise.all(
                items.map(queryItem(context, token))
              )
            )
              .flat()
          )
        }

        return items
      },

    ])
  }
}

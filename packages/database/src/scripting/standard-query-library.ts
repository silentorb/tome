import { GraphLibrary } from '@tome/data-api'
import { QueryContext } from '../types'
import { getListItems } from '../documents'

export function newStandardQueryLibrary(): GraphLibrary<QueryContext> {
  return {
    functions: {

      count: (context, state, props) => {
        const list = props['value']
        return list && Array.isArray(list) ? list.length : 0
      },

      getDocument: (context, state, props) => {
        return context.getDocument(props['id'])
      },

      getValue: (context, state, props) => {
        const document = props['owner']
        if (!document || !Array.isArray(document.lists))
          return []

        const { type } = context.nodePath
        const property = type ? type.properties[props['property']] : undefined
        return property ? (getListItems(document.lists, property) || []) : []
      }

    }
  }
}

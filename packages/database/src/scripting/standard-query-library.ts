import { DocumentNode, ExpandedDocument, GraphLibrary, TypeDefinition } from '@tome/data-api'
import { GetExpandedDocument, QueryContext } from '../types'
import { getListItems } from '../documents'
import { newLibraryFunctions } from './library-creation'
import { getNodePath } from '../pathing'
import { loadDocumentNode } from '../reading'

export function newStandardQueryLibrary(): GraphLibrary {
  return {

    functions: newLibraryFunctions([
      function count(context: QueryContext, list: any[]) {
        return list && Array.isArray(list) ? list.length : 0
      },

      function getDocument(context: QueryContext, id: string) {
        return loadDocumentNode(context.getDocument, getNodePath(context.config, id)!)
      },

      function getValue(context: QueryContext, property: string, document: DocumentNode) {
        const node = document
        if (!node || !Array.isArray(node.document.lists))
          return []

        const type = node.dataType
        const prop = type ? type.properties[property] : undefined
        return prop ? (getListItems(node.document.lists, prop) || []) : []
      },

    ])
  }
}

import { GraphFunctionMap } from '@tome/data-api'
import { reflectFunctionParameters } from './reflection'

export const newLibraryFunctions = (functions: Function[]): GraphFunctionMap => {
  const result: GraphFunctionMap = {}
  for (const invoke of functions) {
    result[invoke.name] = {
      parameters: reflectFunctionParameters(invoke).slice(1),
      invoke,
    }
  }

  return result
}

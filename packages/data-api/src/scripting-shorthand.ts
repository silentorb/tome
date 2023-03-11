import { NodeExpressionType } from './scripting'

export namespace Shorthand {
  export interface Input {
    id?: string
    type: NodeExpressionType
    value: any
  }

  export interface Node {
    id?: string
    function: string
    inputs?: Input[]
  }

  export type NodeToken = string | NodeToken[]
  export type ShorthandNode = Node | NodeToken[]
  export type QueryGraph = ShorthandNode[]
}

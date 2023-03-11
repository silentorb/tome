import { NodeExpressionType } from './scripting'

export namespace Shorthand {
  export interface QueryNodeInput {
    id?: string
    type: NodeExpressionType
    value: any
  }

  export interface QueryNode {
    id?: string
    function: string
    inputs?: QueryNodeInput[]
  }

  export interface QueryGraph {
    nodes: QueryNode[]
  }
}

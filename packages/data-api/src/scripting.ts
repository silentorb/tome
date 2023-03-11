export type Bag = { [key: string]: any }

export interface GraphFunctionDefinition {
  parameters: string[]
  invoke: Function
}

export type GraphFunctionMap = { [key: string]: GraphFunctionDefinition }

export interface GraphLibrary {
  functions: GraphFunctionMap
}

export type NodeExpressionType = 'literal' | 'reference'

export interface NodeInput {
  id: string
  type: NodeExpressionType
  value: any
}

export interface QueryNode {
  id: string
  function: GraphFunctionDefinition
  inputs: NodeInput[]
}

export interface QueryGraph {
  nodes: QueryNode[]
}

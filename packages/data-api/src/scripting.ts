export type NodeExpressionType = 'literal' | 'reference'

export interface NodeExpression {
  type: string
  value: NodeExpressionType
}

export interface QueryNodeInput {
  id: string
  expression: NodeExpression
}

export interface QueryNode {
  id: string
  function: string
  inputs: QueryNodeInput[]
}

export interface QueryGraph {
  nodes: QueryNode[]
}

export type Bag = { [key: string]: any }

export type GraphFunction<Context> = (context: Context, state: Bag, props: Bag) => any

export type GraphFunctionMap<Context> = { [key: string]: GraphFunction<Context> }

export interface GraphLibrary<Context> {
  functions: GraphFunctionMap<Context>
}

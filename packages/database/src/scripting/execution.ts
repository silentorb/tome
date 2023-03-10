import { Bag, GraphLibrary, NodeExpression, QueryGraph, QueryNodeInput } from '@tome/data-api'

function resolveInputValue(state: Bag, expression: NodeExpression) {
  switch (expression.type) {
    case 'literal':
      return expression.value
    case 'reference':
      return state[expression.value]
  }
}

function resolveInputValues(state: Bag, inputs: QueryNodeInput[]) {
  const result: Bag = {}
  for (const input of inputs) {
    result[input.id] = resolveInputValue(state, input.expression)
  }

  return result
}

export async function executeGraph<Context>(context: Context, library: GraphLibrary<Context>, graph: QueryGraph, initialState: Bag = {}): Promise<any> {
  const state: Bag = { ...initialState }
  let lastValue: any = undefined
  for (const node of graph.nodes) {
    const f = library.functions[node.function]
    if (!f)
      continue

    const props = resolveInputValues(state, node.inputs)
    const result = f(context, state, props)

    // Support heterogeneous mixing of sync and async functions.
    // The entire graph execution is still wrapped in at least one async call.
    lastValue = result && typeof result.then === 'function'
      ? await Promise.resolve(result)
      : result

    state[node.id] = lastValue
  }
  return lastValue
}

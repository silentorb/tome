import { Bag, NodeInput, QueryGraph } from '@tome/data-api'

const resolveInputValue = (state: Bag) => (expression: NodeInput) => {
  switch (expression.type) {
    case 'literal':
      return expression.value
    case 'reference':
      return state[expression.value]
  }
}

const resolveInputValues = (state: Bag, inputs: NodeInput[]) =>
  inputs.map(resolveInputValue(state))

export async function executeGraph<Context>(context: Context, graph: QueryGraph, initialState: Bag = {}): Promise<any> {
  const state: Bag = { ...initialState }
  let lastValue: any = undefined
  for (const node of graph) {
    const args = resolveInputValues(state, node.inputs)
    const result = node.function.invoke.apply(undefined, [context].concat(args))

    // Support heterogeneous mixing of sync and async functions.
    // The entire graph execution is still wrapped in at least one async call.
    lastValue = result && typeof result.then === 'function'
      ? await Promise.resolve(result)
      : result

    state[node.id] = lastValue
  }
  return lastValue
}

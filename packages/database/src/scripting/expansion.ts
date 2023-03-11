import { GraphLibrary, QueryGraph, QueryNode, Shorthand } from '@tome/data-api'

export const expandGraph = (library: GraphLibrary, graph: Shorthand.QueryGraph): QueryGraph => {
  const nodes: QueryNode[] = []
  let lastNodeId = ''
  let autoNodeId = 1
  const nextAutoNodeId = () => `__${autoNodeId++}__`

  for (const node of graph.nodes) {
    const functionDefinition = library.functions[node.function]
    if (!functionDefinition)
      throw new Error(`Unknown function: ${node.function}`)

    const id = node.id || nextAutoNodeId()
    const { parameters } = functionDefinition
    const initialInputs = (node.inputs || []).map((input, index) => ({
      ...input,
      id: input.id || parameters[index],
    }))
    const countVariance = parameters.length - initialInputs.length
    if (countVariance > 2 || countVariance < 0)
      throw new Error(`Function ${node.function} has ${parameters.length} parameters but ${initialInputs.length} arguments were provided.`)

    const needsPiping = parameters.length == initialInputs.length + 1
    if (needsPiping && lastNodeId === '')
      throw new Error(`Function ${node.function} is missing an argument and there are no previous inputs to pipe`)

    const inputs = needsPiping
      ? initialInputs.concat([
        {
          id: parameters[parameters.length - 1],
          type: 'reference',
          value: lastNodeId,
        }
      ])
      : initialInputs

    lastNodeId = id

    nodes.push({
      ...node,
      id,
      function: functionDefinition,
      inputs,
    })
  }
  return {
    ...graph,
    nodes,
  }
}


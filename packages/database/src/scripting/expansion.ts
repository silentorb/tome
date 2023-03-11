import { GraphLibrary, NodeExpressionType, QueryGraph, QueryNode, Shorthand } from '@tome/data-api'

const typeSymbolMap: { [key: string]: NodeExpressionType } = {
  '@': 'reference',
  'L': 'literal',
}

const mapSymbolToInputType = (name: string, symbol: string): NodeExpressionType => {
  const type = typeSymbolMap[symbol]
  if (!type)
    throw new Error(`Invalid input type symbol for ${name}: ${symbol}.`)

  return type
}

export const expandInputs = (name: string, tokens: string[]): Shorthand.QueryNodeInput[] => {
  const result: Shorthand.QueryNodeInput[] = []
  let lastToken: string | undefined

  for (const token of tokens) {
    if (!lastToken) {
      lastToken = token
    } else {
      result.push({
        type: mapSymbolToInputType(name, lastToken),
        value: token,
      })
      lastToken = undefined
    }
  }

  if (lastToken != undefined)
    throw new Error(`Uneven token count for ${name} arguments: ${tokens.length} tokens.`)

  return result
}

export const stringArrayToNode = (array: string[]): Shorthand.QueryNode => {
  const name = array[0]
  return {
    function: name,
    inputs: expandInputs(name, array.slice(1))
  }
}

export const expandNode = (node: Shorthand.ShorthandNode): Shorthand.QueryNode =>
  Array.isArray(node)
    ? stringArrayToNode(node)
    : node

export const expandGraph = (library: GraphLibrary, graph: Shorthand.QueryGraph): QueryGraph => {
  const nodes: QueryNode[] = []
  let lastNodeId = ''
  let autoNodeId = 1
  const nextAutoNodeId = () => `__${autoNodeId++}__`

  for (const rawNode of graph.nodes) {
    const node = expandNode(rawNode)
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


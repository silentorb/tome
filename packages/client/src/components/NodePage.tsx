import { DocumentPage } from './DocumentPage'
import { IndexPage } from './IndexPage'
import { GetNodeProps } from '../services/types'

interface Props extends GetNodeProps {
}

export const NodePage = (props: Props) => {
  const { node } = props

  if (!node)
    return <>Loading...</>

  switch (node.type) {
    case 'index':
      return <IndexPage key={node.id} node={node}/>

    case 'document':
      return <DocumentPage key={node.id} node={node} />

    default:
      throw Error(`Invalid node type`)
  }
}

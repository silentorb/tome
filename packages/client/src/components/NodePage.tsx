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
      return <IndexPage items={node.items} includeParentNavigation={node.id !== ''}/>

    case 'document':
      return <DocumentPage key={node.id} id={node.id} document={node.document}/>

    default:
      throw Error(`Invalid node type`)
  }
}

import { DocumentPage } from './DocumentPage'
import { IndexPage } from './IndexPage'
import { GetNodeProps } from '../services/types'

interface Props extends GetNodeProps {
}

export const NodePage = (props: Props) => {
  const { container } = props

  if (!container)
    return <>Loading...</>

  switch (container.type) {
    case 'index':
      return <IndexPage items={container.items} includeParentNavigation={container.id !== ''}/>

    case 'document':
      return <DocumentPage document={container.document}/>

    default:
      throw Error(`Invalid node type`)
  }
}

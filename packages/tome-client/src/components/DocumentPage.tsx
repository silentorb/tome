import * as React from 'react'
import { ParentNavigation } from './misc'
import { ExpandedDocument } from 'tome-common'

interface Props {
  document: ExpandedDocument
}

export const DocumentPage = (props: Props) => {
  const { document } = props

  return (
    <>
      <ParentNavigation/>
      <div id="editor"/>
      <div id="raw-content" hidden={true}>
        {document.content}
      </div>
    </>
  )
}

import * as React from 'react'
import { ParentNavigation } from '../components/misc'

interface Props {
  content: string
}

export const EditDocument = (props: Props) => {
  return (
    <>
      <ParentNavigation/>
      <div id="editor"/>
      <div id="raw-content" hidden={true}>
        {props.content}
      </div>
    </>
  )
}

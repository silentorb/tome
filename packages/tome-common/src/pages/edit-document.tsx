import * as React from 'react'
import { ParentNavigation } from '../components/misc'

interface Props {
  content: string
}

export const EditDocument = (props: Props) => {
  return (
    <>
      <ParentNavigation/>
      <p>
        {props.content}
      </p>
    </>
  )
}

import * as React from 'react'
import { Dispatch, SetStateAction, useState } from 'react'
import { IdAndTitleForm, OnSubmitIdAndTitle } from './IdAndTitleForm'
import { IconButton } from './styling'
import { PlusCircle } from 'react-feather'

interface Props {
  onSubmit: OnSubmitIdAndTitle
}

export type DocumentCreation = [boolean, Dispatch<SetStateAction<boolean>>, JSX.Element | undefined, JSX.Element | undefined]

export const documentCreation = (props: Props): DocumentCreation => {
  // const {onSubmit} = props
  const onSubmit:OnSubmitIdAndTitle = submitProps => {
    setCreating(false)
    props.onSubmit(submitProps)
  }
  const [creating, setCreating] = useState<boolean>(false)

  const button =
    creating
      ? undefined
      : <IconButton onClick={() => setCreating(true)}><PlusCircle/></IconButton>

  const form =
    creating
      ? <IdAndTitleForm onSubmit={onSubmit} submitText="Create" onCancel={() => setCreating(false)}/>
      : undefined

  return [creating, setCreating, button, form]
}

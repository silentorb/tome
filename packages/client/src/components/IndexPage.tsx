import * as React from 'react'
import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { ParentNavigation } from './ParentNavigation'
import { IndexNode, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { PlusCircle } from 'react-feather'
import { IconButton } from './styling'
import { getIdFromRequest, saveDocument } from '../services'
import { capitalizeFirstLetter } from '../string-formatting'

interface Props {
  node: IndexNode
}

interface CreationFormProps {
  onSubmit: (name: string) => void
}

export const CreationForm = (props: CreationFormProps) => {
  const [name, setName] = useState('')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit(name)
  }

  const onNameChanged = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value)
  }
  return (
    <form onSubmit={onSubmit}>
      <input autoFocus type="text" value={name} onChange={onNameChanged}/>
    </form>
  )
}

const getTitle = (node: IndexNode): string => {
  const structureName = node.structure?.path
  return structureName ? capitalizeFirstLetter(structureName) : 'Items'
}

export const IndexPage = (props: Props) => {
  const { node } = props
  const [creating, setCreating] = useState<boolean>(false)
  const [items, setItems] = useState(node.items)
  const [initialized, setInitialized] = useState(false)

  const links = items.map(item => (
    <RecordNavigationLink key={item.id} item={item}/>
  ))

  const parentNavigation = node.id !== ''
    ? <ParentNavigation/> : undefined

  const onStartCreation = () => {
    setCreating(true)
  }

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
    }
  }, [initialized])

  useEffect(() => {
    // Only run when changes happen after initialization
    if (initialized) {
      saveDocument({
        id: node.id,
        type: "index",
        items: items,
      })
    }
  }, [items])

  const onSetCreationName = (title: string) => {
    const nodeName = title.toLowerCase().replace(/ /g, '-')
    const id = `${getIdFromRequest(window.location.href)}/${nodeName}`

    setItems(items.concat([
      {
        title,
        id,
      }
    ]))
    setCreating(false)
  }

  const creationElement =
    creating
      ? <CreationForm onSubmit={onSetCreationName}/>
      : <IconButton onClick={() => onStartCreation()}><PlusCircle/></IconButton>

  return (
    <>
      <h1>{getTitle(node)}</h1>
      {parentNavigation}
      <div>
        {creationElement}
        {links}
      </div>
    </>
  )
}

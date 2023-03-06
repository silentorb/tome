import * as React from 'react'
import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { ParentNavigation } from './ParentNavigation'
import { IndexNode } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { PlusCircle } from 'react-feather'
import { IconButton } from './styling'
import { getIdFromRequest, saveDocument } from '../services'
import { capitalizeFirstLetter } from '../string-formatting'
import { idFromTitle } from '../id-from-title'
import styled from 'styled-components'
import { sortLinks } from '@tome/data-processing'
import { LinkList } from './LinkList'

const TextInput = styled.input`
  width: 400px;
`

interface Props {
  node: IndexNode
}

interface CreationFormProps {
  onSubmit: (id: string, name: string) => void
}

export const CreationForm = (props: CreationFormProps) => {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit(id, name)
  }

  const onTextChanged = (set: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    set(event.target.value)
  }

  const idPlaceholder = id
    ? ''
    : idFromTitle(name)

  return (
    <form onSubmit={onSubmit}>
      <div>
        <label>Name</label><TextInput autoFocus type="text" value={name} onChange={onTextChanged(setName)} />
      </div>
      <div>
        <label>Id</label><TextInput type="text" value={id} onChange={onTextChanged(setId)}
                                    placeholder={idPlaceholder}/>
      </div>
      <input type="submit" value="Create"/>
    </form>
  )
}

const getTitle = (node: IndexNode): string => {
  const structureName = node.dataType?.id
  return node.dataType?.title || (
    structureName
      ? capitalizeFirstLetter(structureName)
      : 'Items'
  )
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

  const startCreation = () => {
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
        type: 'index',
        items: items,
      })
    }
  }, [items])

  const onSetCreationName = (nodeId: string | undefined, title: string) => {
    if (title) {
      const nodeName = nodeId || idFromTitle(title)
      const id = `${getIdFromRequest(window.location.href)}/${nodeName}`
      const newItems = items.concat([
        {
          title,
          id,
        }
      ])

      setItems(sortLinks([], newItems))
    }
    setCreating(false)
  }

  const creationElement =
    creating
      ? <CreationForm onSubmit={onSetCreationName}/>
      : <IconButton onClick={() => startCreation()}><PlusCircle/></IconButton>

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'n' && e.altKey) {
      e.preventDefault()
      if (!creating) {
        startCreation()
      }
    }
    else if (e.key == 'Escape' && creating) {
      setCreating(false)
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKeydown)
    return function cleanup() {
      window.removeEventListener('keydown', onKeydown)
    }
  })

  return (
    <>
      <h1>{getTitle(node)}</h1>
      {parentNavigation}
      <div>
        {creationElement}
        <LinkList items={items} setItems={setItems} />
      </div>
    </>
  )
}

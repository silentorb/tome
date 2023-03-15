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
import { setPageTitle } from '../browser-utility'
import { IdAndTitleForm } from './IdAndTitleForm'

interface Props {
  node: IndexNode
}


const getTitle = (node: IndexNode): string => {
  if (node.title)
    return node.title

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

  const title = getTitle(node)

  useEffect(() => {
    setPageTitle(title)
  }, [])

  const parentNavigation = node.id !== '' || (node.breadcrumbs?.length || 0 > 0)
    ? <ParentNavigation breadcrumbs={node.breadcrumbs}/> : undefined

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
      ? <IdAndTitleForm onSubmit={onSetCreationName} submitText="Create"/>
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
      <div>{parentNavigation}</div>
      <h1>{title}</h1>
      <div>
        {creationElement}
        <LinkList items={items} setItems={setItems} columns={node.columns} />
      </div>
    </>
  )
}

import { useEffect } from 'react'

export function handleKeyboardInput(onKeydown: (e: KeyboardEvent) => void) {
  useEffect(() => {
    window.addEventListener('keydown', onKeydown)
    return function cleanup() {
      window.removeEventListener('keydown', onKeydown)
    }
  })
}

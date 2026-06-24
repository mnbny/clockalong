import { useHotkeys } from '@mantine/hooks'

export function useDevTools() {
  if (import.meta.env.PROD) {
    return
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useHotkeys([
    [
      'mod+R',
      () => {
        console.info('[dev tools] reload hotkey triggered')
        window.location.reload()
      },
      { preventDefault: true },
    ],
  ])
}

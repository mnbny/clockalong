import { useStorage } from '../services/storage/useStorage'

export function useClockifyTimerProject() {
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyOverrideProject] = useStorage('clockifyOverrideProject')

  return clockifyOverrideProject ?? clockifyDefaultProject
}

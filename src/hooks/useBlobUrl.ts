import { useEffect, useState } from 'react'

export function useBlobUrl(blob: Blob | null | undefined) {
  const [image, setImage] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setImage({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return image?.blob === blob ? image?.url : undefined
}

export function getContrastingColor(color: string, fallback = '#ffffff') {
  let red: number
  let green: number
  let blue: number

  if (color.startsWith('#')) {
    const hex = color.replace('#', '')

    if (hex.length === 3) {
      red = Number.parseInt(hex[0] + hex[0], 16)
      green = Number.parseInt(hex[1] + hex[1], 16)
      blue = Number.parseInt(hex[2] + hex[2], 16)
    } else if (hex.length === 6) {
      red = Number.parseInt(hex.slice(0, 2), 16)
      green = Number.parseInt(hex.slice(2, 4), 16)
      blue = Number.parseInt(hex.slice(4, 6), 16)
    } else {
      return fallback
    }
  } else if (color.startsWith('rgb')) {
    const parts = color
      .replace(/[^\d,]/g, '')
      .split(',')
      .slice(0, 3)
      .map(Number)

    if (parts.length < 3 || parts.some(Number.isNaN)) {
      return fallback
    }

    ;[red, green, blue] = parts
  } else {
    return fallback
  }

  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness >= 128 ? '#000000' : '#ffffff'
}

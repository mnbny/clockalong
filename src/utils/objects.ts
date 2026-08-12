export function pick<O extends object, K extends keyof O>(object: O, ...keys: K[]): Pick<O, K> {
  const result = {} as Pick<O, K>

  for (const key of keys) {
    if (key in object) {
      result[key] = object[key]
    }
  }

  return result
}

import type { ComponentProps, ComponentType, PropsWithChildren, ReactNode } from 'react'

type ProviderProps<T extends { [K: string]: ComponentType<any> }> = PropsWithChildren<{
  registry: T
  providers: Array<keyof T | false>
}> & {
  [K in Exclude<keyof T, symbol> as `${K}Props`]?: Omit<ComponentProps<T[K]>, 'children'> & {
    children?: ReactNode
  }
}

export function ProviderRegistry<T extends { [K: string]: ComponentType<any> }>(props: ProviderProps<T>) {
  const providers = props.providers.filter((name): name is Exclude<typeof name, false> => name !== false)

  return providers.reduceRight<ReactNode>((acc, name) => {
    const ProviderComponent = props.registry[name] as ComponentType<any>
    const providerProps = (props as any)[`${String(name)}Props`] ?? {}

    return <ProviderComponent {...providerProps}>{acc}</ProviderComponent>
  }, props.children)
}

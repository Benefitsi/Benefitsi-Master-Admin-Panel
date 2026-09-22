export type AiMenuDraft = {
  name: string
  currency: string
  categories: Array<{
    name: string
    items: Array<{
      name: string
      description: string
      price: number | null
      allergens: string[]
      tags: string[]
      note: string
    }>
  }>
  warnings: string[]
  complete: boolean
}

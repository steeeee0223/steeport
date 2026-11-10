declare module 'virtual:books' {
  interface Chapter {
    id: string
    title?: string
    date?: string
    html: string
    text: string
  }

  interface BookContent {
    title: string
    label: string
    language: string
    url: string
    chapters: Chapter[]
  }

  const catalog: Partial<Record<import('./props').Book, BookContent>>
  export default catalog
}

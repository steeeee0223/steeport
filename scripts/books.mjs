import { JSON_SCHEMA, load } from 'js-yaml'
import MarkdownIt from 'markdown-it'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../content/books/', import.meta.url))
const markdown = new MarkdownIt()
const escape = markdown.utils.escapeHtml
const placements = new Map([
  ['window', 'notebook'],
  ['shelf', 'shelf'],
  ['journal', 'journal'],
  ['web', null],
  ['draft', null],
])
const imageTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
])

function readMarkdown(file) {
  const source = readFileSync(join(root, file), 'utf8').replaceAll('\r\n', '\n')
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source)
  if (!match) return { meta: {}, body: source.trim() }
  try {
    const meta = load(match[1], { schema: JSON_SCHEMA })
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
      throw new Error('Expected a YAML mapping')
    return { meta, body: source.slice(match[0].length).trim() }
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

markdown.core.ruler.after('inline', 'book_figures', ({ tokens, env }) => {
  for (const [index, token] of tokens.entries()) {
    const children = token.children ?? []
    for (const image of children) {
      if (image.type !== 'image') continue
      const source = image.attrGet('src')
      if (source.startsWith('https://')) continue
      const match = /^images\/([\w.-]+\.([a-z]+))$/i.exec(source)
      if (!match || !imageTypes.has(match[2].toLowerCase()))
        throw new Error(
          `${env.file}: use a raster image in images/ or an HTTPS URL`,
        )
      const path = join(root, env.slug, source)
      if (!statSync(path, { throwIfNoEntry: false })?.isFile())
        throw new Error(`${env.file}: missing ${source}`)
      const url = `/books/${env.slug}/${source}`
      env.images.set(url, {
        path,
        type: imageTypes.get(match[2].toLowerCase()),
      })
      image.attrSet('src', url)
    }
    const image = children.length === 1 && children[0]
    const open = tokens[index - 1]
    const close = tokens[index + 1]
    if (
      image?.type !== 'image' ||
      open?.type !== 'paragraph_open' ||
      close?.type !== 'paragraph_close'
    )
      continue
    const caption = image.attrGet('title')
    open.tag = close.tag = 'figure'
    open.hidden = close.hidden = false
    if (caption) {
      image.attrs = image.attrs.filter(([name]) => name !== 'title')
      const captionToken = new image.constructor('html_inline', '', 0)
      captionToken.content = `<figcaption>${escape(caption)}</figcaption>`
      children.push(captionToken)
    }
  }
})

function compileBooks() {
  const catalog = {}
  const books = []
  const images = new Map()
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue
    const slug = entry.name
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new Error(`Invalid book folder: ${slug}`)
    const index = `${slug}/index.md`
    const { meta, body } = readMarkdown(index)
    const {
      title,
      language = 'zh-Hant',
      placement = 'web',
      label = title,
    } = meta
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof label !== 'string' ||
      !label.trim() ||
      typeof language !== 'string' ||
      !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ||
      !placements.has(placement)
    )
      throw new Error(`${index}: check title, label, language and placement`)
    if (placement === 'draft') continue
    const slot = placements.get(placement)
    if (slot && catalog[slot])
      throw new Error(
        `${index}: ${placement} already holds ${catalog[slot].title}`,
      )
    function render(file, content) {
      return markdown.render(content, { file, slug, images })
    }
    const chapters = readdirSync(join(root, slug), { withFileTypes: true })
      .filter(
        (file) =>
          file.isFile() &&
          file.name !== 'index.md' &&
          file.name.endsWith('.md'),
      )
      .map((file) => file.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((name) => {
        const file = `${slug}/${name}`
        const id = name.slice(0, -3)
        const {
          meta: { title, date },
          body,
        } = readMarkdown(file)
        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
          !body ||
          (title !== undefined &&
            (typeof title !== 'string' || !title.trim())) ||
          (date !== undefined &&
            (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)))
        )
          throw new Error(
            `${file}: use a slug filename, a chapter body, and an optional title and YYYY-MM-DD date`,
          )
        return { id, title, date, html: render(file, body), text: body }
      })
    if (!chapters.length)
      throw new Error(`${index}: add at least one chapter Markdown file`)
    const book = {
      title,
      label,
      language,
      url: `/books/${slug}/`,
      intro: render(index, body),
      chapters,
    }
    books.push(book)
    if (slot) catalog[slot] = book
  }
  return { catalog, books, images }
}

function htmlPage(title, language, content) {
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5eddf">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/book.css">
  <title>${escape(title)} · Steeport</title>
</head>
<body>
<header class="site-header"><a href="/">Steeport<span>.</span></a><a href="/books/">Books</a></header>
<main>${content}</main>
</body>
</html>`
}

function bookPage(book) {
  const chapters = book.chapters
    .map(
      ({ id, title, date, html }) => `
    <section id="${id}">
      ${date ? `<time datetime="${date}">${date.replaceAll('-', '.')}</time>` : ''}
      ${title ? `<h2>${escape(title)}</h2>` : ''}
      ${html}
    </section>`,
    )
    .join('')
  return htmlPage(
    book.title,
    book.language,
    `<article>
  <header class="book-header">
    <h1>${escape(book.title)}</h1>
    ${book.intro}
  </header>
  ${chapters}
</article>`,
  )
}

const id = 'virtual:books'
const resolved = '\0' + id

export function booksPlugin() {
  let compiled
  return {
    name: 'steeport-books',
    buildStart() {
      compiled = undefined
    },
    resolveId(source) {
      if (source === id) return resolved
    },
    load(source) {
      if (source !== resolved) return
      compiled ??= compileBooks()
      return `export default ${JSON.stringify(compiled.catalog)}`
    },
    configureServer(server) {
      server.watcher.add(root)
      function reload(file) {
        if (!file.startsWith(root)) return
        compiled = undefined
        const module = server.moduleGraph.getModuleById(resolved)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', reload).on('change', reload).on('unlink', reload)
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0]
        if (!url || !/^\/books(?:\/|$)/.test(url)) return next()
        compiled ??= compileBooks()
        const image = compiled.images.get(url)
        if (image) {
          response.setHeader('Content-Type', image.type)
          response.end(readFileSync(image.path))
          return
        }
        const pages = bookPages(compiled.books)
        const page = pages.get(url.endsWith('/') ? url : url + '/')
        if (!page) {
          response.statusCode = 404
          response.end('Book not found')
          return
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(page)
      })
    },
    generateBundle() {
      compiled ??= compileBooks()
      for (const [url, page] of bookPages(compiled.books))
        this.emitFile({
          type: 'asset',
          fileName: url.slice(1) + 'index.html',
          source: page,
        })
      for (const [url, image] of compiled.images)
        this.emitFile({
          type: 'asset',
          fileName: url.slice(1),
          source: readFileSync(image.path),
        })
    },
  }
}

function bookPages(books) {
  const links = books
    .map(
      (book) =>
        `<li><a href="${book.url}" lang="${book.language}">${escape(book.title)}</a></li>`,
    )
    .join('')
  const pages = new Map([
    [
      '/books/',
      htmlPage(
        'Books',
        'en',
        `<h1>Books</h1><ul class="book-list">${links}</ul>`,
      ),
    ],
  ])
  for (const book of books) pages.set(book.url, bookPage(book))
  return pages
}

# ADR 0003 Publish both book views from Markdown

## Status

Accepted. Recorded 2026-11-23.

## Context

The first development journal kept its chapter text in TypeScript, so adding a chapter meant editing code. We wanted readers to be able to share the chapter they had open in the café. [The first book entry](../../content/books/steeport-devlog/09-first-book.md)

## Decision

Give each book a folder under `content/books/` and write each chapter in Markdown. The folder name sets the book URL. The chapter filename sets its anchor. `scripts/books.mjs` builds the in-scene reader data and standalone HTML, then copies the book images they reference.

## Alternatives considered

We could keep the reader text in TypeScript and publish separate static pages. Every chapter edit would then need to land in both places. With Markdown, a correction reaches both readers on the next build.

## Consequences

A shared chapter link opens as HTML without JavaScript or WebGL. Keep published folder and chapter names stable because they are part of the address. Set `placement` in the book's front matter to put it in the café, publish it on the web only, or keep it as a draft. [Book authoring instructions](../../README.md#add-a-book)

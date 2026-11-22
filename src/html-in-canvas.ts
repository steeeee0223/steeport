interface DrawableCanvas extends HTMLCanvasElement {
  requestPaint(): void
}

interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(
    element: Element,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void
}

function canPaint(canvas: HTMLCanvasElement): canvas is DrawableCanvas {
  return (
    'content' in canvas &&
    'requestPaint' in canvas &&
    typeof canvas.requestPaint === 'function'
  )
}

function canDraw(
  context: CanvasRenderingContext2D,
): context is DrawableContext {
  return (
    'drawElementImage' in context &&
    typeof context.drawElementImage === 'function'
  )
}

export function htmlInCanvas(
  canvas: HTMLCanvasElement,
  element: HTMLElement,
  onPaint: () => void,
) {
  if (!canPaint(canvas)) return
  const context = canvas.getContext('2d')
  if (!context || !canDraw(context)) return

  canvas.setAttribute('content', 'drawable')
  element.setAttribute('drawable', '')
  const paint = () => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawElementImage(element, 0, 0, canvas.width, canvas.height)
    onPaint()
  }
  canvas.addEventListener('paint', paint)
  return {
    requestPaint: () => canvas.requestPaint(),
    dispose: () => canvas.removeEventListener('paint', paint),
  }
}

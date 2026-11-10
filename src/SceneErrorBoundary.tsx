import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type SceneErrorBoundaryProps = { children: ReactNode }
type SceneErrorBoundaryState = { failed: boolean }

/**
 * Last line of defense when the scene tree throws at mount or mid-frame:
 * without it a runtime crash would leave the eternal loader on screen.
 */
export class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Scene crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      // Portal to body: the boundary sits inside .scene, which keeps
      // opacity: 0 until the scene reports ready — a crashed scene never
      // does, so the panel must escape that subtree to be visible.
      return createPortal(
        <div className="webgl-fallback" role="alert">
          <div className="webgl-fallback-inner">
            <h2>Сцена не запустилась</h2>
            <p>Произошла ошибка во время инициализации сцены. Перезагрузите страницу — если не поможет, проверьте поддержку WebGL и видеодрайвер.</p>
          </div>
        </div>,
        document.body,
      )
    }
    return this.props.children
  }
}

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: Error) { console.error('[ErrorBoundary]', err) }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="text-text-1 font-medium">Something went wrong.</p>
          <button
            onClick={() => { this.setState({ hasError: false }); location.reload() }}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm"
          >
            Try refreshing
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

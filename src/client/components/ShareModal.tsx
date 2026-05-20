import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  boardId: string
  adminToken: string
  onClose: () => void
}

export default function ShareModal({ boardId, adminToken, onClose }: Props) {
  const url = `${location.origin}/b/${boardId}`
  const [copied, setCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function copyToken() {
    await navigator.clipboard.writeText(adminToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-raised rounded-lg p-6 w-full max-w-sm flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-1">Share this board</h2>
          <button onClick={onClose} className="text-text-3 hover:text-text-2 text-lg leading-none">✕</button>
        </div>

        {/* Copy link — primary action */}
        <button
          onClick={copyLink}
          className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 px-4 rounded transition-colors"
        >
          {copied ? '✓ Copied!' : 'Copy board link'}
        </button>

        {/* QR code — secondary (desktop sharing) */}
        <div className="hidden sm:flex flex-col items-center gap-2">
          <QRCodeSVG value={url} size={180} bgColor="#222233" fgColor="#ECEAF5" />
          <p className="text-text-3 text-xs break-all text-center">{url}</p>
        </div>

        {/* Admin token recovery */}
        <div className="border-t border-border pt-4">
          <p className="text-text-3 text-xs mb-2">Save your admin token — it's tied to this browser.</p>
          <button
            onClick={copyToken}
            className="text-text-2 hover:text-text-1 text-xs underline"
          >
            {tokenCopied ? '✓ Copied!' : 'Copy admin token'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-text-2 hover:text-text-1 text-sm transition-colors"
        >
          Enter board →
        </button>
      </div>
    </div>
  )
}

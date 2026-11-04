import { IconExternalLink, IconX, IconZoomIn, IconZoomOut } from '@tabler/icons-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import { appToast } from './AppToaster'

import 'yet-another-react-lightbox/styles.css'

export default function ImageLightbox({
  src,
  alt,
  loading,
  onRetry,
  onClose,
  externalLink,
}: {
  src?: string
  alt: string
  loading: boolean
  onRetry: () => void
  onClose: () => void
  externalLink?: { url: string; label: string }
}) {
  return (
    <Lightbox
      open
      close={onClose}
      slides={[{ src: src ?? '', alt }]}
      plugins={[Zoom]}
      zoom={{ maxZoomPixelRatio: 4 }}
      carousel={{ finite: true, preload: 0 }}
      controller={{ closeOnBackdropClick: true }}
      styles={{
        root: {
          '--yarl__color_backdrop': 'rgba(0, 0, 0, 0.92)',
          '--yarl__color_button': 'var(--color-base-content)',
          '--yarl__color_button_active': 'var(--color-primary)',
          '--yarl__color_button_disabled': 'color-mix(in oklab, var(--color-base-content) 35%, transparent)',
          '--yarl__button_filter': 'none',
        },
        toolbar: {
          background: 'var(--color-base-200)',
          borderRadius: 'var(--radius-box)',
          margin: '1rem',
          gap: '0.25rem',
        },
      }}
      toolbar={{
        buttons: [
          ...(externalLink
            ? [
                <button
                  key="external"
                  type="button"
                  className="yarl__button"
                  aria-label={externalLink.label}
                  title={externalLink.label}
                  onClick={() => {
                    void openUrl(externalLink.url).catch(() => appToast.error('Could not open the source app.'))
                  }}>
                  <IconExternalLink />
                </button>,
              ]
            : []),
          'close',
        ],
      }}
      render={{
        iconClose: () => <IconX />,
        iconZoomIn: () => <IconZoomIn />,
        iconZoomOut: () => <IconZoomOut />,
        buttonPrev: () => null,
        buttonNext: () => null,
        slide: () =>
          !src ? (
            <div className="bg-base-200 text-base-content rounded-box p-6 text-center" role="status">
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm mr-2" />
                  Loading image…
                </>
              ) : (
                <>
                  <p>Could not load this image.</p>
                  <button type="button" className="btn btn-primary btn-sm mt-3" onClick={onRetry}>
                    Retry
                  </button>
                </>
              )}
            </div>
          ) : undefined,
      }}
    />
  )
}

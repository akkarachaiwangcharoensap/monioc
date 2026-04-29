// All download state now lives in ModelDownloadContext (app root) so it
// survives route changes and enables background downloading.
export { useModelDownload } from '../context/ModelDownloadContext';
export type { ModelDownloadContextValue as UseModelDownload } from '../context/ModelDownloadContext';

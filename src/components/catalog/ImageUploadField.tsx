import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, Loader2, ImageOff, X, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { ApiError } from '../../lib/api';
import { filesApi, ACCEPTED_IMAGE_TYPES } from '../../lib/files';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

interface ImageUploadFieldProps {
  /** Which File API category to upload into (drives the objectKey prefix). */
  kind: 'product' | 'category';
  /** Current persisted object key (null when no image). */
  objectKey: string | null;
  /** Backend-resolved preview URL for the current key (null when none). */
  initialUrl: string | null;
  /** Notified on successful upload (key+url) or removal (null,null). */
  onChange: (objectKey: string | null, url: string | null) => void;
  disabled?: boolean;
}

/**
 * Select → local preview → upload → keep the returned objectKey. The browser
 * only ever holds the key (and a short-lived preview URL); it never learns a
 * bucket or builds a storage URL. The allowlist here mirrors the backend for a
 * friendly early hint, but the server stays authoritative.
 */
export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  kind, objectKey, initialUrl, onChange, disabled = false,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // Revoke any transient object URL when it changes / on unmount.
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  // A newly opened record (or a reset) supplies a different persisted key/URL.
  useEffect(() => {
    setState('idle');
    setError(null);
    setUploadedUrl(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectKey, initialUrl]);

  const previewSrc = localPreview ?? uploadedUrl ?? initialUrl;
  const hasImage = !!previewSrc;
  const isUploading = state === 'uploading';

  const pick = () => { if (!disabled && !isUploading) inputRef.current?.click(); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setState('error');
      setError(t('image.wrongType'));
      return;
    }

    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    setState('uploading');
    try {
      const res = kind === 'product'
        ? await filesApi.uploadProductImage(file)
        : await filesApi.uploadCategoryImage(file);
      setUploadedUrl(res.url);
      setState('done');
      onChange(res.objectKey, res.url);
    } catch (err) {
      setState('error');
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      setError(mapUploadError(err, t));
    }
  };

  const remove = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setUploadedUrl(null);
    setState('idle');
    setError(null);
    onChange(null, null);
  };

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-3 rounded-xl border p-2.5 ${
        state === 'error' ? 'border-[#DC2626]/40 bg-[#DC2626]/5' : 'border-[#E5E3DF] dark:border-[#2B2522]'}`}>
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] bg-[#F7F5F2] dark:bg-[#26221F] flex items-center justify-center">
          {hasImage ? (
            <img src={previewSrc ?? undefined} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="w-5 h-5 text-[#8C7C6B]" />
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {!hasImage ? (
              <button type="button" onClick={pick} disabled={disabled || isUploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C48A56] hover:bg-[#A36C3D] disabled:opacity-50 px-3 py-1.5 text-[11px] font-bold text-white transition-colors">
                <UploadCloud className="w-3.5 h-3.5" /> {t('image.select')}
              </button>
            ) : (
              <>
                <button type="button" onClick={pick} disabled={disabled || isUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E3DF] dark:border-[#2B2522] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 px-2.5 py-1.5 text-[11px] font-semibold transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> {t('image.replace')}
                </button>
                <button type="button" onClick={remove} disabled={disabled || isUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-50 transition-colors">
                  <X className="w-3.5 h-3.5" /> {t('image.remove')}
                </button>
              </>
            )}
            {state === 'done' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2E7D32]">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('image.uploaded')}
              </span>
            )}
            {state === 'error' && (
              <button type="button" onClick={pick} disabled={disabled}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#B45309] hover:underline">
                <RefreshCw className="w-3 h-3" /> {t('image.retry')}
              </button>
            )}
          </div>
          <p className="mt-1 truncate text-[10px] text-[#8C7C6B]">
            {objectKey ? t('image.storedKey') + ': ' + objectKey : t('image.none')}
          </p>
        </div>

        <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="hidden" onChange={onFile} />
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#DC2626]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      ) : (
        <p className="text-[10px] text-[#8C7C6B]">{t('image.hint')}</p>
      )}
    </div>
  );
};

function mapUploadError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return t('image.tooLarge');
    if (err.status === 415) return t('image.wrongType');
    if (err.status === 403) return t('image.forbidden');
    if (err.status === 401) return t('image.unauthorized');
    if (err.status === 400) return t('image.rejected');
    if (err.isNetworkError) return t('image.networkError');
    return t('image.uploadFailed');
  }
  return t('image.uploadFailed');
}

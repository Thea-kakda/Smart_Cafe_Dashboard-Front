/**
 * Round 1 product editor shell (Slice 4A §9). A full-screen overlay opened from
 * the product list — deliberately not a route, because the editor is a modal
 * workflow over one row and the dashboard has no router to integrate with.
 *
 * Accessibility contract, since this is the foundation the other tabs inherit:
 *  - the tab strip is a real `role="tablist"` with `role="tab"` buttons and a
 *    roving `tabIndex`, so Tab leaves the strip and arrows move inside it;
 *  - every panel is `role="tabpanel"`, labelled by its tab and reachable by
 *    keyboard as a single tab stop;
 *  - opening moves focus into the dialog and closing returns it to whatever
 *    opened the editor, so a keyboard user is not dropped at the document top;
 *  - Escape closes, except when a tab holds unsaved edits — then it asks first,
 *    in the dialog, rather than raising a blocking native confirm.
 *
 * The shell owns exactly one piece of data: the authoritative product read. Each
 * section fetches and saves its own aggregate, which is why there is no shared
 * "save all" button — the four tabs write to four different lock tokens.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Package, RefreshCw, X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { productsAdminApi } from '../../lib/catalogAdmin';
import { CategoryRow } from '../../lib/storeProducts';
import { ProductDetails } from '../../lib/productEditor';
import { EDITOR_SECTIONS, SectionId, editorErrorKey, nextTabIndex } from '../../lib/productEditorState';
import { Banner } from './EditorPrimitives';
import { GeneralSection } from './sections/GeneralSection';
import { VariantsSection } from './sections/VariantsSection';
import { ChannelsSection } from './sections/ChannelsSection';
import { AvailabilityPreviewSection } from './sections/AvailabilityPreviewSection';
import { OptionsSection } from './sections/OptionsSection';
import { EffectsSection } from './sections/EffectsSection';
import { RecipesSection } from './sections/RecipesSection';
import { InventorySection } from './sections/InventorySection';

export interface ProductEditorProps {
  productId: string;
  categories: CategoryRow[];
  onClose: () => void;
  /** Lets the list refresh after any tab wrote to the product row. */
  onChanged: () => void;
  /** Jumps to another dashboard module; the Inventory tab links to stock ops. */
  onNavigate?: (tab: string) => void;
}

export const ProductEditor: React.FC<ProductEditorProps> = ({ productId, categories, onClose, onChanged, onNavigate }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  // The list only opens the editor for a `product:manage` caller, but the tab
  // resolves its own authority anyway: an editor that assumed permission from
  // its entry point would silently mis-render for any other caller.
  const canWriteProduct = hasPermission('product:manage');

  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>('general');
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const shellRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<Element | null>(null);

  // Remember what had focus so closing hands it back.
  useEffect(() => {
    restoreRef.current = document.activeElement;
    return () => {
      const el = restoreRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorKey(null);
    try {
      setProduct(await productsAdminApi.get(productId));
      setLoadState('ready');
    } catch (err) {
      setErrorKey(editorErrorKey(err instanceof ApiError ? err.code : undefined, err instanceof ApiError ? err.status : -1));
      setLoadState('error');
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  // Focus lands on the dialog itself, not on a random control inside it.
  useEffect(() => {
    if (loadState === 'ready') shellRef.current?.focus();
  }, [loadState]);

  const close = useCallback(() => {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, confirmClose, onClose]);

  // Escape is handled on the container so it works from any control inside,
  // including the section forms. A text input swallowing it would be a trap.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') trapFocus(e, shellRef.current);
  };

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(index, e.key, EDITOR_SECTIONS.length);
    if (next === null) return;
    e.preventDefault();
    const section = EDITOR_SECTIONS[next];
    setActive(section.id);
    tabRefs.current[section.id]?.focus();
  };

  const onProductChange = useCallback((p: ProductDetails) => {
    setProduct(p);
    onChanged();
  }, [onChanged]);

  const sectionNode = useMemo(() => {
    if (!product) return null;
    switch (active) {
      case 'general':
        return (
          <GeneralSection
            product={product}
            categories={categories}
            canWrite={canWriteProduct}
            onDirtyChange={setDirty}
            onProductChange={onProductChange}
          />
        );
      case 'variants':
        return <VariantsSection productId={product.productId} currencyCode={product.currencyCode} onChanged={onChanged} />;
      case 'channels':
        return <ChannelsSection productId={product.productId} />;
      case 'preview':
        return <AvailabilityPreviewSection productId={product.productId} />;
      case 'options':
        return <OptionsSection productId={product.productId} productVersion={product.version} canWrite={canWriteProduct} />;
      case 'effects':
        return <EffectsSection productId={product.productId} canWrite={canWriteProduct} />;
      case 'recipes':
        return <RecipesSection productId={product.productId} productVersion={product.version} canWrite={canWriteProduct} />;
      case 'inventory':
        return <InventorySection product={product} onOpenInventory={onNavigate} />;
      default:
        return null;
    }
  }, [active, product, categories, onChanged, onProductChange, canWriteProduct, onNavigate]);

  const activeSection = EDITOR_SECTIONS.find((s) => s.id === active) ?? EDITOR_SECTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={shellRef} role="dialog" aria-modal="true" aria-labelledby="product-editor-title" tabIndex={-1}
        onKeyDown={onKeyDown}
        className="my-2 w-full max-w-5xl rounded-2xl border border-[#E5E3DF] dark:border-[#2B2522] bg-[#FBFAF8] dark:bg-[#1C1A19] shadow-2xl focus:outline-none">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E3DF] dark:border-[#2B2522] px-4 sm:px-6 py-4">
          <div className="min-w-0">
            <h3 id="product-editor-title" className="text-base sm:text-lg font-bold text-[#1C1A19] dark:text-[#F5F3F0] truncate">
              {product ? product.name : t('productEditor.loadingTitle')}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#6E5E4F] dark:text-[#A89D94]">
              {product && <code className="rounded bg-[#8C7C6B]/10 px-1.5 py-0.5 font-mono">{product.code}</code>}
              {product && <span>{t('prodAdmin.colCategory')}: {product.categoryName}</span>}
              {product && (
                <span className="font-mono">
                  {t('productEditor.lockVersion')}: v{product.version}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {product && (
              <button type="button" onClick={() => void load()} disabled={loadState === 'loading'}
                className="flex items-center gap-1.5 rounded-xl border border-[#E5E3DF] dark:border-[#2B2522] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] disabled:opacity-50 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loadState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{t('common.refresh')}</span>
              </button>
            )}
            <button type="button" onClick={close} aria-label={t('common.close')}
              className="rounded-xl p-2 text-[#6E5E4F] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522] transition-colors">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Tab strip */}
        <div role="tablist" aria-label={t('productEditor.tabsAria')}
          className="flex gap-1 overflow-x-auto border-b border-[#E5E3DF] dark:border-[#2B2522] px-2 sm:px-4 py-2">
          {EDITOR_SECTIONS.map((s, index) => {
            const selected = s.id === active;
            return (
              <button key={s.id} type="button" role="tab" id={`tab-${s.id}`}
                ref={(el) => { tabRefs.current[s.id] = el; }}
                aria-selected={selected} aria-controls={`panel-${s.id}`} tabIndex={selected ? 0 : -1}
                title={t(s.hintKey)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                onClick={() => setActive(s.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  selected
                    ? 'bg-[#C48A56] text-white'
                    : 'text-[#6E5E4F] dark:text-[#A89D94] hover:bg-[#F0EFED] dark:hover:bg-[#2B2522]'
                }`}>
                {t(s.labelKey)}
                {s.round === 2 && s.mode === 'placeholder' && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${selected ? 'bg-white/25' : 'bg-[#8C7C6B]/15'}`}>
                    {t('round2.badge')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Unsaved-changes confirmation, in-dialog rather than as a native alert */}
        {confirmClose && (
          <div className="px-4 sm:px-6 pt-4">
            <div role="alert" aria-live="assertive"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B45309]/30 bg-[#B45309]/10 p-3 text-xs font-semibold text-[#B45309]">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> {t('productEditor.unsavedWarning')}
              </span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => setConfirmClose(false)}
                  className="rounded-lg bg-[#B45309] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90">
                  {t('productEditor.stay')}
                </button>
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-[#B45309]/40 px-2.5 py-1 text-[11px] font-bold hover:bg-[#B45309]/10">
                  {t('productEditor.discard')}
                </button>
              </span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-4 sm:px-6 py-5 max-h-[70vh] overflow-y-auto">
          {loadState === 'loading' && !product && (
            <div className="flex flex-col items-center gap-3 py-16 text-xs text-[#6E5E4F]">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
              <p role="status">{t('common.loading')}</p>
            </div>
          )}
          {loadState === 'error' && (
            <div className="space-y-3">
              <Banner tone="bad" role="alert" text={errorKey ? t(errorKey) : t('productEditor.err.unknown')} />
              <button type="button" onClick={() => void load()}
                className="text-xs font-bold text-[#C48A56] hover:underline">{t('common.retry')}</button>
            </div>
          )}
          {loadState === 'ready' && product && (
            <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} tabIndex={0}
              className="focus:outline-none focus:ring-2 focus:ring-[#C48A56]/40 rounded-2xl">
              <p className="mb-4 flex items-center gap-2 text-xs text-[#6E5E4F] dark:text-[#A89D94]">
                <Package className="w-4 h-4 shrink-0 text-[#8C7C6B]" aria-hidden="true" />
                {t(activeSection.hintKey)}
              </p>
              {sectionNode}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Minimal focus trap: Tab stays inside the dialog while it is open. Without
 * this, `aria-modal` would announce a dialog the keyboard can still leave, and
 * content behind the overlay remains reachable — which is a WCAG failure, not a
 * style choice.
 */
function trapFocus(e: React.KeyboardEvent, container: HTMLElement | null): void {
  if (!container) return;
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeEl = document.activeElement;
  if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && activeEl === last) {
    e.preventDefault();
    first.focus();
  }
}

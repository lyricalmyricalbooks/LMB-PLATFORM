import { CatalogReviewDialog } from "./CatalogReviewDialog";
import { useState, useEffect, useRef } from "react";
import { 
  X, 
  Save, 
  ArrowLeft, 
  Upload, 
  Trash2, 
  ExternalLink,
  Palette,
  ChevronRight,
  Plus,
  Loader2,
  Copy,
  RefreshCw,
  Link2,
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Eye,
  GripVertical,
  Sparkles,
  Undo2,
  Play,
  Film, Crop } from "lucide-react";
import toast from "react-hot-toast";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminApi } from "./api";
import { CATEGORIES } from "../features/site/constants";
import { normalizeCategories, parentOf } from "../features/site/navItems";
import { Book, Variant } from "../features/site/types";
import { useCurrency } from "../CurrencyContext";
import { BookCustomFields } from "./BookCustomFields";
import { BookTemplatePicker } from "./BookTemplatePicker";
import { BUILTIN_DETAILS, builtinDetailValue, editorDetailRows, type DetailRow } from "../features/site/detailRows";
import { ActionMenu, ConfirmDialog, SectionCard, TextField, TextArea, SelectField, Toggle, StatusBadge, Tabs, useConfirm } from "./riso/components";
import "./books.css";
import { uploadBookPhoto } from "./bookPhotoUpload";
import { BOOK_VIDEO_ACCEPT, MAX_BOOK_VIDEOS, MAX_BOOK_VIDEO_BYTES, formatMegabytes, isVideoFile, uploadBookVideo, videoProblem } from "./bookVideoUpload";
import { isVideoItem } from "../features/site/bookVideo";
import { framingStyle, photoAdjust, photoFraming } from "../features/site/photoFraming";
import { smallPhotoUrl } from "../features/site/photoSources";
import { PhotoToneDefs } from "../features/site/PhotoToneDefs";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { studioHash } from "../lib/studioLocation";

import { BookSeoPane } from "./BookSeoPane";
import { askAi, bookAiInput, photoAiUrl, runPool, DESCRIBE_AT_ONCE } from "./aiWriter";
import { describedAlt } from "../features/site/photoAlt";
import { preorderActive, releaseDateOf, formatReleaseDate } from "../features/site/preorder";
import { DEFAULT_CUSTOMS_DESCRIPTION, DEFAULT_HS_CODE, validHsCode } from "./customsFields";
import { AddOnsEditor, BoxSetEditor, ProductTypeCard, SaleWindowFields } from "./BookEditorExtras";
import { MediaLibraryDialog, WeightField, DescriptionLinkDialog } from "./BookEditorFields";
import { applyFormat, linkMarkup, type FormatAction } from "../features/site/descriptionLinks";
import { DescriptionText } from "../features/site/DescriptionText";
import { editorDirty, fillEmpty, isbnWarning, lookupIsbn, needsPublishReview, slugClash, slugFollowsTitle, slugLocked, slugifyTitle, withMetricWeights } from "./bookEditorState";
import { LOW_STOCK } from "./catalogList";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { isStockLinked, type InventoryLinks } from "./inventoryLink";
import { releaseArrived } from "../features/site/liveBook";
import { DETAILS_FIELD_TAB, detailsSubTabs, shownDetailsSubTab, type DetailsSubTab } from "./bookDetailsTabs";
import { addOnProblems, bundleProblems, giftCardProblems, isBoxSet, isGiftCardProduct, productForSave, saleStatus, saleWindowProblem } from "./productExtras";

const MAX_BOOK_PHOTOS = 50;

type BookTab = "details" | "media" | "pricing" | "inventory" | "editions" | "addons" | "boxset" | "organize" | "more" | "seo";

function SortablePhoto({ photo, index, onRemove, onAlt, onMakeCover, onCrop, onDescribe, describing, aiLocked }: {
  photo: any; index: number; onRemove: (id: string) => void; onAlt: (id: string, alt: string) => void; onMakeCover: (id: string) => void;
  onCrop: (id: string) => void; onDescribe: (id: string) => void; describing: boolean; aiLocked: boolean;
}) {
  const fileNameAlt = !isVideoItem(photo) && !!String(photo.altText || "").trim() && !describedAlt(photo.altText);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : 1, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="be-photo">
      <div className="be-photo-img">
        <img src={smallPhotoUrl(photo, 480 * (photoFraming(photo)?.zoom || 1))} alt={photo.altText || ""} style={framingStyle(photo)} />
        <PhotoToneDefs photo={photo} />
        {(photoFraming(photo) || photoAdjust(photo)) && <span className="be-photo-framed">{photoFraming(photo) && photoAdjust(photo) ? "Cropped · edited" : photoFraming(photo) ? "Cropped" : "Edited"}</span>}
        <span className="be-photo-badge">{index === 0 ? "Cover" : isVideoItem(photo) ? `Video · ${index + 1}` : `Image ${index + 1}`}</span>
        {isVideoItem(photo) && (
          <a className="be-photo-play" href={photo.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Play video ${index + 1} in a new tab`}>
            <Play size={18} aria-hidden />
            {photo.videoDuration ? <span>{Math.floor(photo.videoDuration / 60)}:{String(photo.videoDuration % 60).padStart(2, "0")}</span> : null}
          </a>
        )}
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className="be-photo-grip" aria-label={`Reorder image ${index + 1}`}><GripVertical size={16} aria-hidden /></button>
      </div>
      <input className="rp-input" aria-label={`${isVideoItem(photo) ? "Description of video" : "Alt text for image"} ${index + 1}`} placeholder={isVideoItem(photo) ? "What the video shows" : "Describe this photo"} value={photo.altText || ""} onChange={(e) => onAlt(photo.id, e.target.value)}
        aria-describedby={fileNameAlt ? `be-alt-hint-${photo.id}` : undefined} />
      {fileNameAlt && <p className="rp-hint" id={`be-alt-hint-${photo.id}`}>This is a file name, so the shop shows its own wording instead. Describe the photo, or use Describe with AI.</p>}
      <div className="be-photo-actions">
        {!isVideoItem(photo) && (
          <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onDescribe(photo.id)} disabled={aiLocked}
            aria-label={`Describe ${index === 0 ? "the cover" : `image ${index + 1}`} with AI`}>
            {describing ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />} {describing ? "Describing…" : "Describe with AI"}
          </button>
        )}
        {!isVideoItem(photo) && <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onCrop(photo.id)} aria-label={`Crop and edit ${index === 0 ? "the cover" : `image ${index + 1}`}`}><Crop size={13} aria-hidden /> Crop & edit</button>}
        {index !== 0 && <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onMakeCover(photo.id)}>Make cover</button>}
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onRemove(photo.id)}><Trash2 size={13} aria-hidden /> Remove</button>
      </div>
    </div>
  );
}

interface BookEditorProps {
  book: Book | null;
  onClose: () => void;
  /** `stayOpen`: the owner pressed Save (not Save & close) — refresh lists but keep the editor open. */
  onSave: (opts?: { stayOpen?: boolean }) => void;
  /** A new book only: fields to start from (e.g. "Add to the shop" from an inventory app book). */
  prefill?: Record<string, any> | null;
  /** A new book only: called once with its id after the first save creates it. */
  onCreated?: (id: string) => void;
}

const DESC_TOOLS: { action: FormatAction; label: string; Icon: typeof Bold }[] = [
  { action: "bold", label: "Bold", Icon: Bold },
  { action: "italic", label: "Italic", Icon: Italic },
  { action: "heading", label: "Heading", Icon: Heading2 },
  { action: "subheading", label: "Small heading", Icon: Heading3 },
  { action: "bullets", label: "Bullet list", Icon: List },
  { action: "numbers", label: "Numbered list", Icon: ListOrdered },
  { action: "quote", label: "Quote", Icon: Quote },
  { action: "divider", label: "Divider line", Icon: Minus },
];

export function BookEditor({ book: bookProp, onClose, onSave, prefill = null, onCreated }: BookEditorProps) {
  const { rates } = useCurrency();
  // The record being edited: the opened book, or the new one once a first Save has created it.
  const [book, setBook] = useState<Book | null>(bookProp);
  useEffect(() => { setBook(bookProp); }, [bookProp]);
  // Books matched to the inventory app (Inventory › Inventory app link) take their stock from it.
  const [stockLinks, setStockLinks] = useState<InventoryLinks>({});
  // Unknown links (the check failed) keep stock read-only rather than looking editable.
  const [stockLinksFailed, setStockLinksFailed] = useState(false);
  useEffect(() => { inventoryLinkApi.links().then(setStockLinks).catch(() => { setStockLinks({}); setStockLinksFailed(true); }); }, []);
  const LINKED_HINT = "Counted in the inventory app. Change it there; the website follows it (Inventory › Inventory app link).";
  const LINKS_FAILED_HINT = "Couldn't check whether this stock is counted in the inventory app. Close and reopen the book to edit it.";
  const stockLocked = (variantId: string | null) => !!book?.id && (stockLinksFailed || isStockLinked(stockLinks, book.id, variantId));
  const stockLockHint = (variantId: string | null) => (stockLocked(variantId) ? (stockLinksFailed ? LINKS_FAILED_HINT : LINKED_HINT) : undefined);
  const [askConfirm, confirmNode] = useConfirm();
  const [defaultProfileId, setDefaultProfileId] = useState("");
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [visited, setVisited] = useState<Set<BookTab>>(() => new Set(["details"]));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isbnBusy, setIsbnBusy] = useState(false);
  const [isbnResult, setIsbnResult] = useState<{ text: string; cover?: string } | null>(null);
  const [formData, setFormData] = useState<any>({
    title: "",
    subtitle: "",
    description: "",
    artistBio: "",
    isbn: "",
    barcode: "",
    sku: "",
    retailPrice: 0,
    usdPrice: 0,
    eurPrice: 0,
    costPrice: 0,
    usdCostPrice: 0,
    eurCostPrice: 0,
    stockLevel: 0,
    format: "Paperback",
    dimensions: "",
    weight: "",
    language: "English",
    status: "draft",
    shippingProfileId: "",
    authorId: "",
    isFeatured: false,
    photos: [],
    slug: "",
    isOnSale: false,
    salePrice: 0,
    usdSalePrice: 0,
    eurSalePrice: 0,
    manualCurrencyOverrides: false,
    categories: [],
    tags: [],
    variants: [],
    scheduleDate: "",
    publisher: "",
    publishDate: "",
    pageCount: 0,
    edition: "",
    chargeTax: true,
    trackInventory: true,
    allowBackorder: false,
    preorder: false,
    metaTitle: "",
    metaDescription: "",
    saleStartsAt: "",
    saleEndsAt: "",
    addOns: [],
    bundleItems: [],
  });

  const [publishReview, setPublishReview] = useState(false);
  const [shippingProfiles, setShippingProfiles] = useState<any[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const [recommendationCatalog, setRecommendationCatalog] = useState<any[]>([]);
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationSearch, setRecommendationSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryDefinitions, setCategoryDefinitions] = useState<any[]>([]);
  // Sub-category name → its parent's name (Studio › Menus › Shop categories › "Sits under").
  const [categoryParents, setCategoryParents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState(false);
  // Each problem names the tab that fixes it, so the summary can jump there.
  const [validationErrors, setValidationErrors] = useState<Array<{ text: string; tab: BookTab; field?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  // Books › edit › Images › Crop & edit (PhotoCropDialog); the design gives the shop's frame shapes.
  const [cropId, setCropId] = useState<string | null>(null);
  const [liveDesign, setLiveDesign] = useState<any>(null);
  const uploadingRef = useRef(false);
  const [metadataError, setMetadataError] = useState(false);
  const [photoInput, setPhotoInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // "Uploading video 2 of 3 · 45%" while a video goes up (Images tab).
  const [videoStatus, setVideoStatus] = useState("");
  const [initialData, setInitialData] = useState<any>(null);
  const [uploadingDigital, setUploadingDigital] = useState(false);
  const digitalFileInputRef = useRef<HTMLInputElement>(null);
  // One download file per digital edition: the edition being uploaded for, and its hidden picker.
  const variantFileInputRef = useRef<HTMLInputElement>(null);
  const variantFileTarget = useRef<string>("");
  const [uploadingVariantFile, setUploadingVariantFile] = useState("");
  const [tab, setTab] = useState<BookTab>("details");
  // Details is split into sub tabs (bookDetailsTabs.ts); jumping to a Details field opens the sub tab holding it.
  const [detailsSub, setDetailsSub] = useState<DetailsSubTab>("bd-basics");
  const goTo = (next: BookTab, field?: string) => {
    setTab(next);
    const sub = field ? DETAILS_FIELD_TAB[field] : undefined;
    if (next === "details" && sub) setDetailsSub(sub);
  };
  const [dragOver, setDragOver] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const savingCategoryRef = useRef(false);
  // What a book had before it was switched to Gift card, so switching back restores it.
  const preGiftRef = useRef<{ trackInventory: any; variants: any[] } | null>(null);
  const saveRef = useRef<() => void>(() => {});
  // Box set switch: on while the owner is choosing the books, even before the first is added.
  const [boxSetOn, setBoxSetOn] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFormData((prev: any) => {
        const oldIndex = prev.photos.findIndex((p: any) => p.id === active.id);
        const newIndex = prev.photos.findIndex((p: any) => p.id === over.id);
        return {
          ...prev,
          photos: arrayMove(prev.photos, oldIndex, newIndex),
        };
      });
    }
  }

  useEffect(() => {
    loadMetadata();
    preGiftRef.current = null;
    adminApi.getAllBooks().then(setRecommendationCatalog).catch(() => setRecommendationError(true));
    const book = bookProp;
    if (book) {
      const defaults = {
        title: "",
        subtitle: "",
        description: "",
        artistBio: "",
        isbn: "",
        barcode: "",
        sku: "",
        retailPrice: 0,
        usdPrice: 0,
        eurPrice: 0,
        costPrice: 0,
        usdCostPrice: 0,
        eurCostPrice: 0,
        stockLevel: 0,
        format: "Paperback",
        dimensions: "",
        weight: "",
        language: "English",
        status: "draft",
        shippingProfileId: "",
        authorId: "",
        isFeatured: false,
        slug: "",
        isOnSale: false,
        salePrice: 0,
        usdSalePrice: 0,
        eurSalePrice: 0,
        manualCurrencyOverrides: false,
        scheduleDate: "",
        publisher: "",
        publishDate: "",
        pageCount: 0,
        edition: "",
        chargeTax: true,
        trackInventory: true,
        allowBackorder: false,
        preorder: false,
        metaTitle: "",
        metaDescription: "",
        saleStartsAt: "",
        saleEndsAt: "",
      };

      const dataToLoad = {
        ...defaults,
        ...book,
        photos: Array.isArray(book.photos) ? book.photos : [],
        variants: Array.isArray(book.variants) ? book.variants : [],
        categories: Array.isArray(book.categories) ? book.categories : [],
        tags: Array.isArray((book as any).tags) ? (book as any).tags : [],
        addOns: Array.isArray((book as any).addOns) ? (book as any).addOns : [],
        bundleItems: Array.isArray((book as any).bundleItems) ? (book as any).bundleItems : [],
      };
      // Sanitize through JSON round-trip to strip any non-serializable Firebase
      // SDK internals (e.g. PlatformLoggerServiceImpl) that Firestore may attach
      // to document objects. Without this they end up in formData and cause a
      // DataCloneError when the live-preview postMessage fires, crashing the editor.
      const safeData = JSON.parse(JSON.stringify(dataToLoad));
      setFormData(safeData);
      setInitialData(JSON.parse(JSON.stringify(safeData)));
      setBoxSetOn(isBoxSet(safeData));
    } else {
      // Set initial data for new books to current empty formData state
      setInitialData(JSON.parse(JSON.stringify(formData)));
      // Filled-in starting values count as unsaved edits until the owner saves.
      if (prefill) setFormData((prev: any) => ({ ...prev, ...JSON.parse(JSON.stringify(prefill)) }));
    }
  }, [bookProp]);

  // Live preview: debounced (typing used to clone the whole book on every keystroke) through one channel.
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => () => { channelRef.current?.close(); channelRef.current = null; }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        // Sanitize before postMessage — structured clone rejects non-serializable
        // values such as Firebase SDK service instances.
        const update = {
          type: "BOOK_PREVIEW_UPDATE",
          book: JSON.parse(JSON.stringify({
            ...formData,
            id: book?.id || 'new-book-preview'
          }))
        };

        // Iframe communication
        window.parent.postMessage(update, "*");

        // Cross-tab communication
        if (!channelRef.current && typeof BroadcastChannel !== "undefined") channelRef.current = new BroadcastChannel("site_preview_updates");
        channelRef.current?.postMessage(update);
      } catch (err) {
        // Non-fatal: preview broadcast failed but the editor stays functional
        console.warn("[BookEditor] Could not broadcast live preview update:", err);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [formData, book?.id]);

  // Auto-calculate USD/EUR prices using exchange rates if manual overrides are disabled
  useEffect(() => {
    if (!formData.manualCurrencyOverrides) {
      const usdRate = rates.USD || 0.73;
      const eurRate = rates.EUR || 0.67;
      
      setFormData((prev: any) => {
        const retailPrice = prev.retailPrice || 0;
        const costPrice = prev.costPrice || 0;
        const salePrice = prev.salePrice || 0;

        const newUsdPrice = Number((retailPrice * usdRate).toFixed(2));
        const newEurPrice = Number((retailPrice * eurRate).toFixed(2));
        const newUsdCostPrice = Number((costPrice * usdRate).toFixed(2));
        const newEurCostPrice = Number((costPrice * eurRate).toFixed(2));
        const newUsdSalePrice = Number((salePrice * usdRate).toFixed(2));
        const newEurSalePrice = Number((salePrice * eurRate).toFixed(2));

        if (
          prev.usdPrice === newUsdPrice &&
          prev.eurPrice === newEurPrice &&
          prev.usdCostPrice === newUsdCostPrice &&
          prev.eurCostPrice === newEurCostPrice &&
          prev.usdSalePrice === newUsdSalePrice &&
          prev.eurSalePrice === newEurSalePrice
        ) {
          return prev;
        }

        return {
          ...prev,
          usdPrice: newUsdPrice,
          eurPrice: newEurPrice,
          usdCostPrice: newUsdCostPrice,
          eurCostPrice: newEurCostPrice,
          usdSalePrice: newUsdSalePrice,
          eurSalePrice: newEurSalePrice,
        };
      });
    }
  }, [
    formData.retailPrice,
    formData.costPrice,
    formData.salePrice,
    formData.manualCurrencyOverrides,
    rates
  ]);

  // Auto-calculate variant pricing if overrides are disabled
  const prevVariantPricesRef = useRef<string>("");
  useEffect(() => {
    if (!formData.manualCurrencyOverrides && Array.isArray(formData.variants)) {
      const usdRate = rates.USD || 0.73;
      const eurRate = rates.EUR || 0.67;
      
      const currentPricesHash = formData.variants.map((v: any) => `${v.id}:${v.price}`).join(",");
      if (currentPricesHash !== prevVariantPricesRef.current) {
        prevVariantPricesRef.current = currentPricesHash;
        
        setFormData((prev: any) => ({
          ...prev,
          variants: prev.variants.map((v: any) => ({
            ...v,
            usdPrice: Number((v.price * usdRate).toFixed(2)),
            eurPrice: Number((v.price * eurRate).toFixed(2)),
          }))
        }));
      }
    }
  }, [
    formData.variants,
    formData.manualCurrencyOverrides,
    rates
  ]);

  // Aggregate stock calculation
  useEffect(() => {
    if (Array.isArray(formData.variants) && formData.variants.length > 0) {
      const totalStock = formData.variants.reduce((sum: number, v: Variant) => sum + (Number((v as any).stockLevel ?? (v as any).stock) || 0), 0);
      if (totalStock !== formData.stockLevel) {
        setFormData((prev: any) => ({ ...prev, stockLevel: totalStock }));
      }
    }
  }, [formData.variants]);

  async function loadMetadata() {
    setMetadataError(false);
    try {
      const [sh, au, settings] = await Promise.all([
        adminApi.getShippingProfiles(),
        adminApi.getAuthors(),
        adminApi.getSettings() as Promise<any>,
      ]);
      setShippingProfiles(sh);
      setAuthors(au);
      setLiveDesign(settings?.design || null);
      
      // Published categories only: a book can't be filed under a category shoppers can't see yet
      // (publish new Studio categories first).
      const siteCats = settings?.design?.categories || CATEGORIES;
      const all = normalizeCategories(Array.isArray(siteCats) ? siteCats : [...CATEGORIES]);
      setCategoryDefinitions(all);
      // PUBLICATIONS already shows every book, so it isn't something to file a book under.
      const pickable = all.filter((c: any) => c?.name && c.name !== 'PUBLICATIONS');
      setCategories(pickable.map((c: any) => c.name));
      setCategoryParents(Object.fromEntries(pickable.map((c: any) => {
        const pid = parentOf(c, all);
        return [c.name, pid ? all.find((p: any) => p.id === pid)?.name || "" : ""];
      })));

      if (sh.length > 0) {
        const defaultProfile = sh.find(p => p.id === "general-profile") || sh[0];
        setDefaultProfileId(defaultProfile.id);
        if (!book) {
          setFormData((prev: any) => ({ ...prev, shippingProfileId: defaultProfile.id }));
        } else if (!book.shippingProfileId) {
          setFormData((prev: any) => ({ ...prev, shippingProfileId: defaultProfile.id }));
        }
      }
    } catch (err) {
      console.error("Failed to load metadata", err);
      setMetadataError(true);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: any = value;
    if (type === "number") val = Number(value);
    if (type === "checkbox") val = (e.target as HTMLInputElement).checked;
    
    setFormData((prev: any) => {
      const newData = { ...prev, [name]: val };
      // A published book keeps its web address when the title is edited (old links would break).
      if (name === "title" && slugFollowsTitle(prev, slugLocked(initialData, slugUnlocked))) {
        newData.slug = slugifyTitle(value);
      }
      return newData;
    });
  };

  // Reference-only values recalculated on open (USD/EUR, edition stock total, default profile) aren't edits;
  // unsaved shared book-field definitions (More details) are.
  const isDirty = editorDirty(formData, initialData, { defaultProfileId, extraDirty: fieldsDirty });

  // Warn before the tab is closed or reloaded with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty) { setConfirmDiscard(true); return; }
    onClose();
  };

  const closeAfterSave = useRef(true);
  const handleSave = async (e?: React.FormEvent, reviewed = false, close = closeAfterSave.current) => {
    closeAfterSave.current = close;
    if (e) e.preventDefault();
    if (loading) return;

    // Collect every problem so the editor can list them together (not one toast at a time), with the tab that fixes it.
    const found: Array<{ text: string; tab: BookTab; field?: string }> = [];
    const add = (tab: BookTab, ...texts: string[]) => texts.forEach((text) => found.push({ text, tab }));
    if (formData.seoImage?.trim()) {
      try {
        if (new URL(formData.seoImage.trim()).protocol !== "https:") add("seo", "Sharing image must use an HTTPS URL.");
      } catch { add("seo", "Sharing image must be a valid HTTPS URL."); }
    }
    if (!formData.title.trim()) found.push({ text: "Book title is required.", tab: "details", field: "title" });
    if (formData.retailPrice < 0) add("pricing", "Retail price cannot be negative.");
    // An edition saved with a blank price would sell for $0.
    (formData.variants || []).forEach((v: any, i: number) => {
      const p = v?.price;
      if (p === "" || p == null || !Number.isFinite(Number(p)) || Number(p) < 0) add("editions", `Edition ${v?.name || i + 1} needs a price (0 or more).`);
    });
    const giftCard = isGiftCardProduct(formData);
    const boxSet = !giftCard && isBoxSet(formData);
    if (formData.isOnSale && !giftCard) { const sale = saleWindowProblem(formData); if (sale) add("pricing", sale); }
    if (giftCard) add("editions", ...giftCardProblems(formData));
    else if (boxSet) add("boxset", ...bundleProblems({ ...formData, id: book?.id }, (id) => recommendationCatalog.find((b: any) => b.id === id)));
    else add("boxset", ...addOnProblems(formData.addOns || []));
    if (formData.manualCurrencyOverrides) {
      if (formData.usdPrice < 0 || formData.eurPrice < 0) add("pricing", "Override prices cannot be negative.");
      if (formData.costPrice < 0 || formData.usdCostPrice < 0 || formData.eurCostPrice < 0) add("pricing", "Cost prices cannot be negative.");
      if (formData.isOnSale && (formData.usdSalePrice < 0 || formData.eurSalePrice < 0)) add("pricing", "Sale prices cannot be negative.");
    }
    setValidationErrors(found);
    const problems = found.map((p) => p.text);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : `${problems.length} problems need fixing before this can be saved.`);
      return;
    }

    // Review when the book goes live, or when a live book gains a problem it didn't have when opened.
    if (!reviewed && needsPublishReview(formData, book ? initialData : null)) { setPublishReview(true); return; }
    // Gift cards are digital and untracked; box sets take stock from the books inside (productExtras).
    const toSave = withMetricWeights(productForSave(formData));
    // Edits typed while the save is in flight are kept (and stay unsaved), never replaced by the saved copy.
    const snapshot = formData;
    setLoading(true);
    try {
      if (book) {
        // Pass what the editor loaded so untouched stock keeps its live value.
        const saved: any = await adminApi.updateBook(book.id, toSave, initialData, { removeMissing: true });
        toast.success("Book updated successfully");
        // Pre-order switch or release date changed: updateBook carried the new date onto paid, unsent pre-orders.
        const sync = saved?.preorderSync;
        if (sync?.failed) toast.error("Book saved, but its paid pre-orders couldn't be updated. Save again to retry.");
        else if (sync?.updated) toast.success(`Release date updated on ${sync.updated} paid pre-order${sync.updated === 1 ? "" : "s"}.`);
        setSlugUnlocked(false);
        setBook({ ...(book as any), ...toSave, id: book.id });
      } else {
        const created = await adminApi.createBook(toSave);
        toast.success("New title added to library");
        onCreated?.(created.id);
        // Further saves update this record instead of creating another copy.
        setBook({ ...toSave, id: created.id } as any);
      }
      setFormData((prev: any) => (prev === snapshot ? toSave : prev));
      setInitialData(toSave);
      onSave({ stayOpen: !close });
    } catch (err: any) {
      console.error("Save error details:", err);
      // Plain words (never the raw error): the edits stay in the editor, so a retry loses nothing.
      toast.error("Couldn't save the book. Check your internet connection and press Save again — your edits are still here.");
    } finally {
      setLoading(false);
    }
  };

  // Ctrl/⌘+S = Save (stay open).
  saveRef.current = () => { handleSave(undefined, false, false); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addPhoto = () => {
    if (!photoInput) return;
    if (formData.photos.length >= MAX_BOOK_PHOTOS) {
      toast.error(`Maximum ${MAX_BOOK_PHOTOS} photos allowed`);
      return;
    }
    setFormData((prev: any) => ({
      ...prev,
      photos: [...prev.photos, { url: photoInput, id: Math.random().toString(36).substr(2, 9) }]
    }));
    setPhotoInput("");
  };

  const uploadFiles = async (files: FileList | null) => {
    if (uploadingRef.current) { toast("Wait for the current upload to finish."); return; }
    const all = Array.from(files || []);
    const videos = all.filter((f) => isVideoFile(f));
    if (videos.length) { await uploadVideos(videos); if (videos.length === all.length) return; }
    const list = all.filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const room = MAX_BOOK_PHOTOS - (formData.photos?.length || 0);
    if (room <= 0) { toast.error(`Maximum ${MAX_BOOK_PHOTOS} photos allowed`); return; }
    if (list.length > room) toast(`Only ${room} more image${room === 1 ? "" : "s"} fit — extra files skipped.`);
    uploadingRef.current = true;
    setUploading(true);
    // One bad file no longer stops the rest; the ones that failed are named afterwards.
    const failedNames: string[] = [];
    for (const file of list.slice(0, room)) {
      try {
        const uploaded = await uploadBookPhoto(file);
        setFormData((prev: any) => ({ ...prev, photos: [...prev.photos, { ...uploaded, id: Math.random().toString(36).substr(2, 9), altText: file.name.replace(/\.[^.]+$/, "") }] }));
      } catch (err: any) {
        console.error("Upload error:", err);
        failedNames.push(file.name);
      }
    }
    uploadingRef.current = false;
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (failedNames.length) toast.error(`Couldn't upload: ${failedNames.join(", ")}. The other images were added — try these again.`);
  };

  // Videos go into the same list as the photos (so they are ordered with them); each one is stored with a
  // still frame that cards, search and emails show instead (admin/bookVideoUpload.ts).
  const uploadVideos = async (files: File[]) => {
    if (uploadingRef.current) { toast("Wait for the current upload to finish."); return; }
    const have = (formData.photos || []).filter(isVideoItem).length;
    const room = Math.min(MAX_BOOK_VIDEOS - have, MAX_BOOK_PHOTOS - (formData.photos?.length || 0));
    if (room <= 0) { toast.error(`A book can have up to ${MAX_BOOK_VIDEOS} videos and ${MAX_BOOK_PHOTOS} images and videos in all.`); return; }
    const refused = files.map((f) => videoProblem(f)).filter(Boolean);
    const ok = files.filter((f) => !videoProblem(f));
    if (ok.length > room) toast(`Only ${room} more video${room === 1 ? "" : "s"} fit — extra files skipped.`);
    const todo = ok.slice(0, room);
    uploadingRef.current = true;
    setUploading(true);
    const failed: string[] = [...refused];
    for (const [i, file] of todo.entries()) {
      const label = todo.length > 1 ? `Uploading video ${i + 1} of ${todo.length}` : "Uploading video";
      setVideoStatus(`${label}…`);
      try {
        const uploaded = await uploadBookVideo(file, (share) => setVideoStatus(`${label} · ${Math.round(share * 100)}%`));
        setFormData((prev: any) => ({ ...prev, photos: [...prev.photos, { ...uploaded, id: Math.random().toString(36).substr(2, 9), altText: file.name.replace(/\.[^.]+$/, "") }] }));
      } catch (err: any) {
        console.error("Video upload error:", err);
        failed.push(err?.message && /video|MP4|browser/i.test(err.message) ? err.message : `Couldn't upload ${file.name}. Check the connection and try again.`);
      }
    }
    uploadingRef.current = false;
    setUploading(false);
    setVideoStatus("");
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (failed.length) toast.error(failed.join(" "));
    else if (todo.length) toast.success(todo.length === 1 ? "Video added. Save the book to show it in the shop." : `${todo.length} videos added. Save the book to show them in the shop.`);
  };

  const fillFromIsbn = async () => {
    setIsbnBusy(true); setIsbnResult(null);
    try {
      const facts = await lookupIsbn(formData.isbn);
      if (!facts) { setIsbnResult({ text: "No public record found for this ISBN (Open Library, Google Books). Fill the details in yourself." }); return; }
      const { filled } = fillEmpty(formData, facts);
      // Fill from the latest form, so anything typed during the lookup is kept.
      if (filled.length) setFormData((prev: any) => ({ ...prev, ...fillEmpty(prev, facts).patch }));
      setIsbnResult({
        text: filled.length ? `Filled ${filled.join(", ")}. Check them before saving — public records can be wrong.` : "Found a record, but every field it has is already filled in. Nothing was changed.",
        cover: facts.coverUrl,
      });
    } finally { setIsbnBusy(false); }
  };

  const commitTags = () => {
    const newTags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (!newTags.length) { setTagInput(""); return; }
    setFormData((prev: any) => ({ ...prev, tags: Array.from(new Set([...(prev.tags || []), ...newTags])) }));
    setTagInput("");
  };

  const duplicateVariant = (id: string) => {
    setFormData((prev: any) => {
      const src = (prev.variants || []).find((v: any) => v.id === id);
      if (!src) return prev;
      // The copy starts with no stock and no download file: stock and files belong to the original edition.
      return { ...prev, variants: [...prev.variants, { ...src, id: crypto.randomUUID(), name: src.name ? `${src.name} (copy)` : "", sku: src.sku ? `${src.sku}-2` : "", stock: 0, stockLevel: 0, digitalFileName: "", digitalFilePath: "" }] };
    });
  };

  const handleDigitalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDigital(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      // digital-assets/ cannot be read from a browser (storage.rules), so keep the Storage path, not a download URL;
      // downloadDigitalAsset opens digital-assets/<digitalFileName> on the server (#4).
      const path = await adminApi.uploadStoragePath(file, `digital-assets/${fileName}`);
      setFormData((prev: any) => ({
        ...prev,
        digitalFilePath: path,
        digitalFileUrl: "",
        digitalFileName: fileName,
      }));
      toast.success("Digital asset uploaded successfully");
    } catch (err: any) {
      console.error("Digital upload error:", err);
      toast.error("Failed to upload digital asset. Please try again.");
    } finally {
      setUploadingDigital(false);
      if (digitalFileInputRef.current) digitalFileInputRef.current.value = "";
    }
  };

  const handleVariantDigitalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const variantId = variantFileTarget.current;
    if (!file || !variantId) return;
    setUploadingVariantFile(variantId);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const path = await adminApi.uploadStoragePath(file, `digital-assets/${fileName}`);
      setFormData((prev: any) => ({
        ...prev,
        variants: (prev.variants || []).map((v: any) => v.id === variantId ? { ...v, digital: true, digitalFileName: fileName, digitalFilePath: path } : v),
      }));
      toast.success("Edition file uploaded");
    } catch (err: any) {
      console.error("Edition file upload error:", err);
      toast.error("Failed to upload the edition file. Please try again.");
    } finally {
      setUploadingVariantFile("");
      if (variantFileInputRef.current) variantFileInputRef.current.value = "";
    }
  };

  const removePhoto = (id: string) => {
    setFormData((prev: any) => ({
      ...prev,
      photos: (prev.photos || []).filter((p: any) => p.id !== id)
    }));
  };

  const addVariant = () => {
    const usdRate = rates.USD || 0.73;
    const eurRate = rates.EUR || 0.67;
    const variantPrice = formData.retailPrice || 0;

    setFormData((prev: any) => ({
      ...prev,
      variants: [...(prev.variants || []), { 
        name: "", 
        price: variantPrice, 
        usdPrice: Number((variantPrice * usdRate).toFixed(2)),
        eurPrice: Number((variantPrice * eurRate).toFixed(2)),
        stock: 0, 
        stockLevel: 0,
        photoUrl: "",
        sku: `${prev.sku || 'SKU'}-${(prev.variants || []).length + 1}`,
        weight: prev.weight || "",
        id: crypto.randomUUID() 
      }]
    }));
  };

  const updateVariant = (id: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      variants: (prev.variants || []).map((v: any) => {
        if (v.id === id) {
          const updated = { ...v, [field]: value };
          if (field === "stock") {
            updated.stockLevel = Number(value) || 0;
          } else if (field === "stockLevel") {
            updated.stock = Number(value) || 0;
          }
          return updated;
        }
        return v;
      })
    }));
  };

  const removeVariant = async (id: string) => {
    const v = (formData.variants || []).find((x: any) => x.id === id);
    const what = isGiftCardProduct(formData) ? "amount" : "edition";
    const ok = await askConfirm({ title: `Remove this ${what}?`, confirmLabel: `Remove ${what}`,
      message: `${v?.name ? `“${v.name}”` : `This ${what}`} will be removed when you save the book. Shoppers will no longer be able to buy it.` });
    if (!ok) return;
    setFormData((prev: any) => ({
      ...prev,
      variants: (prev.variants || []).filter((v: any) => v.id !== id)
    }));
  };

  const toggleCategory = (cat: string) => {
    setFormData((prev: any) => {
      const currentCats = Array.isArray(prev.categories) ? prev.categories : [];
      return {
        ...prev,
        categories: currentCats.includes(cat) 
          ? currentCats.filter((c: string) => c !== cat)
          : [...currentCats, cat]
      };
    });
  };

  const createCategory = async () => {
    const name = newCategory.trim();
    if (!name || savingCategoryRef.current) return;
    if (categoryDefinitions.some((category) => category.name?.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast.error("That category already exists.");
      return;
    }
    const category = {
      id: `cat-${crypto.randomUUID()}`,
      name,
      description: "",
      showInNav: true,
      ...(newCategoryParent ? { parentId: newCategoryParent } : {}),
    };
    const next = [...categoryDefinitions, category];
    savingCategoryRef.current = true;
    setSavingCategory(true);
    try {
      await adminApi.addShopCategory(category);
      setCategoryDefinitions(next);
      setCategories((current) => [...current, name]);
      setCategoryParents((current) => ({
        ...current,
        [name]: newCategoryParent ? categoryDefinitions.find((item) => item.id === newCategoryParent)?.name || "" : "",
      }));
      setFormData((current: any) => ({ ...current, categories: [...new Set([...(current.categories || []), name])] }));
      setNewCategory("");
      setNewCategoryParent("");
      toast.success(`Created ${name} and assigned it to this book.`);
    } catch (error) {
      console.error("Failed to create category", error);
      toast.error("Could not create the category. Try again.");
    } finally {
      savingCategoryRef.current = false;
      setSavingCategory(false);
    }
  };

  const set = (name: string, value: any) => setFormData((prev: any) => ({ ...prev, [name]: value }));
  // Description links: remember the caret so Add link inserts where the owner was typing.
  // The Artist bio box shares the Description's tools: `field` says which box a tool acts on.
  type RichField = "description" | "artistBio";
  const descSelection = useRef<{ start: number; end: number } | null>(null);
  const bioSelection = useRef<{ start: number; end: number } | null>(null);
  const selectionOf = (field: RichField) => (field === "artistBio" ? bioSelection : descSelection);
  const [descLink, setDescLink] = useState<{ text: string; field: RichField } | null>(null);
  const openDescLink = (field: RichField = "description") => {
    const text = String(formData[field] || "");
    const sel = selectionOf(field).current;
    setDescLink({ text: sel ? text.slice(sel.start, sel.end).trim() : "", field });
  };
  const descWrap = useRef<HTMLDivElement>(null);
  const bioWrap = useRef<HTMLDivElement>(null);
  const wrapOf = (field: RichField) => (field === "artistBio" ? bioWrap : descWrap);
  const [descPreview, setDescPreview] = useState(false);
  const [bioPreview, setBioPreview] = useState(false);
  const formatDescription = (action: FormatAction, field: RichField = "description") => {
    const area = wrapOf(field).current?.querySelector("textarea");
    const text = String(formData[field] || "");
    const start = area ? area.selectionStart : text.length;
    const end = area ? area.selectionEnd : text.length;
    const next = applyFormat(text, start, end, action);
    set(field, next.text);
    selectionOf(field).current = { start: next.start, end: next.end };
    requestAnimationFrame(() => { if (area) { area.focus(); area.setSelectionRange(next.start, next.end); } });
  };
  // Write with AI (Gemini, Settings › General › AI writing assistant): drafts or improves the description in
  // the box; the text before it stays one click away (Undo AI draft).
  const [descAiBusy, setDescAiBusy] = useState(false);
  const [descBeforeAi, setDescBeforeAi] = useState<string | null>(null);
  const writeDescriptionWithAi = async () => {
    const current = String(formData.description || "");
    if (!String(formData.title || "").trim()) { toast.error("Give the book a title first."); return; }
    if (current.trim() && !(await askConfirm({
      title: "Improve the description with AI?",
      message: "The AI rewrites the description from what is written now and the book's details. You can undo it, and nothing is saved until you save the book. Check every fact before saving.",
      confirmLabel: "Improve it",
    }))) return;
    setDescAiBusy(true);
    try {
      const { description } = await askAi("bookDescription", bookAiInput(formData));
      setDescBeforeAi(current);
      set("description", description);
      toast.success("Description drafted with AI. Check every fact, then save the book.");
    } catch (err: any) {
      toast.error(err?.message || "The AI assistant couldn't answer.");
    } finally {
      setDescAiBusy(false);
    }
  };
  // Describe with AI (Books › edit › Images): the AI looks at the photo and writes its alt text, which screen
  // readers and Google Images read. One photo, or every photo without a real description, a few at a time.
  const [describingIds, setDescribingIds] = useState<Set<string>>(() => new Set());
  const [describeAll, setDescribeAll] = useState<{ done: number; total: number } | null>(null);
  const markDescribing = (id: string, on: boolean) => setDescribingIds((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const describePhoto = async (photo: any, index: number) => {
    const out = await askAi("photoAlt", { ...bookAiInput(formData), imageUrl: photoAiUrl(photo), photoNumber: index + 1 });
    setFormData((prev: any) => ({ ...prev, photos: prev.photos.map((p: any) => (p.id === photo.id ? { ...p, altText: out.alt } : p)) }));
    return out;
  };
  const backupNote = "Google's free AI allowance had run out, so OpenRouter wrote";
  const describeOne = async (id: string) => {
    if (!String(formData.title || "").trim()) { toast.error("Give the book a title first."); return; }
    const index = formData.photos.findIndex((p: any) => p.id === id);
    if (index < 0) return;
    const current = describedAlt(formData.photos[index].altText);
    if (current && !(await askConfirm({ title: "Replace this description?", message: `The AI writes a new description for this photo in place of “${current}”. Nothing is saved until you save the book.`, confirmLabel: "Replace it" }))) return;
    markDescribing(id, true);
    try {
      const out = await describePhoto(formData.photos[index], index);
      toast.success(out.fellBack ? `Photo described. ${backupNote} it. Check it, then save the book.` : "Photo described. Check it, then save the book.");
    } catch (err: any) {
      toast.error(err?.message || "The AI assistant couldn't answer.");
    } finally {
      markDescribing(id, false);
    }
  };
  const photosToDescribe = (formData.photos || []).filter((p: any) => !isVideoItem(p) && !describedAlt(p.altText));
  const describeAllPhotos = async () => {
    if (!String(formData.title || "").trim()) { toast.error("Give the book a title first."); return; }
    const todo: { photo: any; index: number }[] = photosToDescribe.map((p: any) => ({ photo: p, index: formData.photos.findIndex((x: any) => x.id === p.id) }));
    if (!todo.length) return;
    setDescribeAll({ done: 0, total: todo.length });
    let finished = 0;
    let byBackup = 0;
    // A 429 means the AI ran out even after the backup was tried (or no key is saved): more would fail the same way.
    const { done, failed, firstError } = await runPool(todo, DESCRIBE_AT_ONCE, async ({ photo, index }) => {
      markDescribing(photo.id, true);
      try {
        const out = await describePhoto(photo, index);
        if (out.fellBack) byBackup += 1;
      } finally {
        markDescribing(photo.id, false);
        finished += 1;
        setDescribeAll({ done: finished, total: todo.length });
      }
    }, (err: any) => err?.status === 429 || err?.needsKey === true);
    setDescribeAll(null);
    const backup = byBackup ? ` ${backupNote} ${byBackup === done ? "them" : `${byBackup} of them`}.` : "";
    if (!failed) {
      toast.success(`${done} ${done === 1 ? "photo" : "photos"} described.${backup} Check them, then save the book.`);
    } else {
      const reason = (firstError as any)?.message || "The AI assistant couldn't answer.";
      toast.error(`${done} of ${todo.length} described.${backup} The rest didn't work: ${reason}`);
    }
  };
  const insertDescLink = (label: string, href: string) => {
    const markup = linkMarkup(label, href);
    const field: RichField = descLink?.field || "description";
    const selRef = selectionOf(field);
    setFormData((prev: any) => {
      const text = String(prev[field] || "");
      const sel = selRef.current;
      const start = sel ? Math.min(sel.start, text.length) : text.length;
      const end = sel ? Math.min(sel.end, text.length) : text.length;
      const before = text.slice(0, start);
      const gap = before && !/\s$/.test(before) ? " " : "";
      selRef.current = { start: start + gap.length + markup.length, end: start + gap.length + markup.length };
      return { ...prev, [field]: before + gap + markup + text.slice(end) };
    });
    setDescLink(null);
    requestAnimationFrame(() => {
      const area = wrapOf(field).current?.querySelector("textarea");
      const at = selRef.current;
      if (area && at) { area.focus(); area.setSelectionRange(at.start, at.end); }
    });
  };
  const giftCard = isGiftCardProduct(formData);
  const giftAmount = (n: number) => ({
    id: crypto.randomUUID(), name: `CA$${n}`, price: n,
    usdPrice: Number((n * (rates.USD || 0.73)).toFixed(2)), eurPrice: Number((n * (rates.EUR || 0.67)).toFixed(2)),
    stock: 0, stockLevel: 0, photoUrl: "", sku: "", weight: "", digital: true,
  });
  // Switching type only changes what the editor shows; nothing is discarded until the book is saved.
  // Switching back to Book restores the inventory setting and editions it had (the CA$ amounts added here go away).
  const setProductType = (type: "book" | "giftCard") => {
    if (type === "giftCard") {
      if (!isGiftCardProduct(formData)) preGiftRef.current = { trackInventory: formData.trackInventory, variants: formData.variants || [] };
      setFormData((prev: any) => ({ ...prev, productType: "giftCard", trackInventory: false, variants: (prev.variants || []).length ? prev.variants : [25, 50, 100].map(giftAmount) }));
      return;
    }
    const before = preGiftRef.current;
    preGiftRef.current = null;
    setFormData((prev: any) => {
      const next = { ...prev };
      delete next.productType;
      if (before) { next.trackInventory = before.trackInventory; next.variants = before.variants; }
      return next;
    });
  };
  const toggleBoxSet = async (on: boolean) => {
    const parts = (formData.bundleItems || []).length;
    if (!on && parts) {
      const ok = await askConfirm({ title: "Stop selling this as a box set?", confirmLabel: "Remove the books",
        message: `This removes the ${parts} book${parts === 1 ? "" : "s"} chosen for this box set. They are gone for good once you save.` });
      if (!ok) return;
    }
    setBoxSetOn(on);
    if (!on) set("bundleItems", []);
  };
  const removeDigitalFile = async (variantId: string | null) => {
    const ok = await askConfirm({ title: "Remove this download file?", confirmLabel: "Remove file",
      message: variantId ? "Buyers of this edition will get the book's main digital file instead, if it has one, once you save." : "Buyers will have no file to download once you save, until you upload a new one." });
    if (!ok) return;
    if (variantId) setFormData((prev: any) => ({ ...prev, variants: (prev.variants || []).map((x: any) => x.id === variantId ? { ...x, digitalFileName: "", digitalFilePath: "" } : x) }));
    else setFormData((prev: any) => ({ ...prev, digitalFileName: "", digitalFileUrl: "", digitalFilePath: "" }));
  };
  const copyBookLink = async () => {
    const slug = book?.slug;
    if (!slug) return;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL}books/${slug}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Your browser blocked the clipboard.");
    }
  };
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const num = (n: any) => Number(n) || 0;
  const fmt = (n: any) => num(n).toFixed(2);
  const overrides = !!formData.manualCurrencyOverrides;
  const hasVariants = (formData.variants || []).length > 0;
  const isDigital = ["E-book (PDF)", "E-book (EPUB)", "Audiobook"].includes(formData.format);
  // The price shoppers pay today: a scheduled sale that hasn't started (or has ended) doesn't count.
  const saleNow = saleStatus(formData) === "on";
  const activePrice = saleNow ? num(formData.salePrice) : num(formData.retailPrice);
  const marginPct = activePrice > 0 ? ((activePrice - num(formData.costPrice)) / activePrice) * 100 : 0;
  const salePct = formData.isOnSale && num(formData.retailPrice) > 0 ? Math.round((1 - num(formData.salePrice) / num(formData.retailPrice)) * 100) : 0;
  const cover = formData.photos?.[0]?.url as string | undefined;
  const isbnWarn = isbnWarning(formData.isbn) || undefined;
  const addressLocked = slugLocked(initialData, slugUnlocked);
  const slugWarn =slugClash(formData.slug, book?.id, recommendationCatalog);
  const lowStock = formData.trackInventory && !hasVariants && num(formData.stockLevel) <= LOW_STOCK;

  const checklist = [
    { label: "Title", ok: !!formData.title?.trim(), tab: "details" as BookTab, field: "title" },
    { label: "Description", ok: (formData.description || "").trim().length >= 40, tab: "details" as BookTab, field: "description" },
    { label: "Cover image", ok: (formData.photos || []).length > 0, tab: "media" as BookTab },
    { label: "Price above $0", ok: num(formData.retailPrice) > 0 || (formData.variants || []).some((v: any) => num(v.price) > 0), tab: "pricing" as BookTab },
    { label: "ISBN or SKU", ok: !!(formData.isbn || formData.sku), tab: "details" as BookTab, field: "isbn" },
    { label: "Category", ok: (formData.categories || []).length > 0, tab: "organize" as BookTab },
    { label: "Search description", ok: !!formData.metaDescription, tab: "seo" as BookTab },
  ];
  const doneCount = checklist.filter((c) => c.ok).length;
  const tabIssues: Record<BookTab, number> = { details: 0, media: 0, pricing: 0, inventory: 0, editions: 0, addons: 0, boxset: 0, organize: 0, more: 0, seo: 0 };
  checklist.filter((c) => !c.ok).forEach((c) => { tabIssues[c.tab] += 1; });
  const detailsIssues: Partial<Record<DetailsSubTab, number>> = {};
  checklist.forEach((c) => {
    const sub = !c.ok && c.tab === "details" && "field" in c && c.field ? DETAILS_FIELD_TAB[c.field] : undefined;
    if (sub) detailsIssues[sub] = (detailsIssues[sub] || 0) + 1;
  });
  const detailsTabs = detailsSubTabs({ customs: !giftCard && !isDigital, issues: detailsIssues });
  const shownDetailsSub = shownDetailsSubTab(detailsSub, detailsTabs);
  const tabs: Array<{ id: BookTab; label: string; count?: number }> = [
    { id: "details", label: "Details", count: tabIssues.details || undefined },
    { id: "media", label: "Images", count: (formData.photos || []).length },
    { id: "pricing", label: "Pricing", count: tabIssues.pricing || undefined },
    { id: "inventory", label: "Inventory & shipping" },
    { id: "editions", label: giftCard ? "Amounts" : "Editions", count: (formData.variants || []).length },
    // Add-ons and the box-set builder share one tab; gift cards have neither.
    ...(!giftCard ? [{ id: "boxset" as BookTab, label: "Add-ons & box set", count: (boxSetOn ? (formData.bundleItems || []).length : (formData.addOns || []).length) || undefined }] : []),
    { id: "organize", label: "Categories & tags", count: tabIssues.organize || undefined },
    { id: "more", label: "More details", count: Object.keys(formData.custom || {}).length || undefined },
    { id: "seo", label: "Search (SEO)", count: tabIssues.seo || undefined },
  ];
  const shownTab: BookTab = tabs.some((t) => t.id === tab) ? (tab === "addons" ? "boxset" : tab) : "details";
  // Tabs with their own state (More details, Search) stay mounted once opened, so switching tabs keeps it.
  if (!visited.has(shownTab)) setVisited(new Set([...visited, shownTab]));
  const statusTone = formData.status === "published" ? "success" : formData.status === "archived" ? "neutral" : "warning";
  const STATUS_WORDS: Record<string, string> = { published: "Published", draft: "Draft", archived: "Archived" };

  const money = (label: string, name: string, symbol: string, opts: { disabled?: boolean; hint?: string } = {}) => (
    <div className="be-money">
      <span className="be-money-sym" aria-hidden>{symbol}</span>
      <TextField label={label} type="number" min={0} step="0.01" name={name} value={formData[name] ?? 0}
        onChange={handleChange} disabled={opts.disabled} hint={opts.hint} />
    </div>
  );

  const stockBadge = (n: number) => (n <= 0 ? <StatusBadge tone="danger">Out of stock</StatusBadge> : n <= LOW_STOCK ? <StatusBadge tone="warning">Low: {n}</StatusBadge> : <StatusBadge tone="success">{n} in stock</StatusBadge>);

  return (
    <div className="book-editor-riso w-full h-full flex flex-col relative overflow-hidden">
      <header className="rp-dialog-head be-head shrink-0">
        <div className="be-head-main">
          <button type="button" onClick={handleClose} className="rp-icon-btn" aria-label="Close book editor"><ArrowLeft size={18} aria-hidden /></button>
          <div className="be-title-block">
            <h2 className="rp-dialog-title" title={formData.title?.trim() || undefined}>{formData.title?.trim() || (book ? "Edit book" : "New book")}</h2>
            <span className="be-id">
              <StatusBadge tone={statusTone as any}>{STATUS_WORDS[formData.status] || formData.status}</StatusBadge>
              {isDirty
                ? <span className="be-dirty" role="status"><span aria-hidden>●</span> Unsaved changes</span>
                : book ? <span className="be-saved" role="status"><span aria-hidden>✓</span> All changes saved</span> : null}
              {book && <span className="be-book-id">Book ID {book.id}</span>}
            </span>
          </div>
        </div>
        <div className="be-actions">
          {book && (
            <ActionMenu label="More for this book" actions={[
              ...((book.slug || formData.slug) ? [{ label: "Preview page (new tab)", icon: <ExternalLink size={14} aria-hidden />, onSelect: () => { window.open(`${import.meta.env.BASE_URL}books/${encodeURIComponent(book.id)}?preview=true`, "_blank", "noreferrer"); } }] : []),
              ...(book.slug ? [{ label: "Copy link to this book", icon: <Copy size={14} aria-hidden />, onSelect: () => void copyBookLink() }] : []),
              ...(book.slug && book.status === "published" ? [{ label: "Design this page", icon: <Palette size={14} aria-hidden />, onSelect: () => {
                if (isDirty) { toast.error("Save the book first, then design its page in the Design studio."); return; }
                window.location.hash = studioHash({ templateId: "productPage", productSlug: book.slug });
              } }] : []),
            ]} />
          )}
          <button type="button" onClick={handleClose} className="rp-btn rp-btn-ghost rp-btn-sm">Cancel</button>
          <button type="button" onClick={() => handleSave(undefined, false, false)} disabled={loading} className="rp-btn rp-btn-secondary rp-btn-sm" title="Save and keep editing (Ctrl/⌘ + S)">
            {loading ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Saving…</> : <><Save size={14} aria-hidden /> Save</>}
          </button>
          <button type="button" onClick={() => handleSave(undefined, false, true)} disabled={loading} className="rp-btn rp-btn-primary rp-btn-sm">
            Save &amp; close
          </button>
        </div>
      </header>

      {metadataError && (
        <div role="alert" className="be-alert">
          <strong>⚠ Couldn't load authors, shipping profiles and categories.</strong> Those lists stay empty until they load.{" "}
          <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => void loadMetadata()}><RefreshCw size={13} aria-hidden /> Try again</button>
        </div>
      )}
      {confirmNode}
      {validationErrors.length > 0 && (
        <div role="alert" className="be-alert">
          <strong>⚠ Fix {validationErrors.length === 1 ? "this" : `these ${validationErrors.length} things`} before saving:</strong>
          <ul className="be-problems">
            {validationErrors.map((m) => (
              <li key={m.text}>
                <span>{m.text}</span>
                {tabs.some((t) => t.id === m.tab) && (m.tab !== shownTab || (!!m.field && !!DETAILS_FIELD_TAB[m.field] && DETAILS_FIELD_TAB[m.field] !== shownDetailsSub)) && (
                  <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => goTo(m.tab, m.field)}>
                    Go to {tabs.find((t) => t.id === m.tab)?.label} <ChevronRight size={13} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog open={confirmSlug} appearance="light" title="Change this book's web address?" confirmLabel="Change web address"
        message="Links people already have to this book (search results, emails, social posts, bookmarks) will stop working, and the site cannot redirect them. Only continue if the old address was wrong."
        onConfirm={() => { setConfirmSlug(false); setSlugUnlocked(true); }} onCancel={() => setConfirmSlug(false)} />
      <ConfirmDialog open={confirmDiscard} appearance="light" title="Discard unsaved changes?" confirmLabel="Discard changes"
        message="You have edits that haven't been saved. Closing now will lose them."
        onConfirm={() => { setConfirmDiscard(false); onClose(); }} onCancel={() => setConfirmDiscard(false)} />

      <div className="be-tabbar shrink-0">
        <div className="be-tabs-wide"><Tabs variant="page" label="Book editor sections" tabs={tabs} value={shownTab} onChange={setTab} /></div>
        {/* Phones: one drop-down instead of four rows of tabs. */}
        <div className="be-tabs-narrow">
          <SelectField label="Section" value={shownTab} onChange={(e) => setTab(e.target.value as BookTab)}>
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.label}{t.count ? ` (${t.count})` : ""}</option>)}
          </SelectField>
        </div>
      </div>

      <div className="be-body custom-scrollbar flex-1">
        <form className="be-main" noValidate onSubmit={(e) => { e.preventDefault(); handleSave(undefined, false, false); }}>
          {shownTab === "details" && (
            <>
              <div className="be-subtabs"><Tabs variant="page" label="Details sections" tabs={detailsTabs} value={shownDetailsSub} onChange={setDetailsSub} /></div>
              {/* Hidden sub tabs stay mounted, so the description toolbar, ISBN lookup and row editor keep their state. */}
              <div role="tabpanel" id="bd-panel-basics" aria-labelledby="rp-tab-bd-basics" className="be-subpanel" hidden={shownDetailsSub !== "bd-basics"}>
              {/* A new product chooses its type first; an existing one rarely changes it, so it moves to the end. */}
              {!book && <ProductTypeCard form={formData} onChange={setProductType} />}
              <SectionCard title="Book details" description="The essentials shoppers see first.">
                <div className="be-grid">
                  <div className="be-span-2"><TextField label="Book title" name="title" value={formData.title} onChange={handleChange} placeholder="e.g. Find Still Catches Me Shifted" required /></div>
                  <SelectField label="Author (linked profile)" name="authorId" value={formData.authorId || ""} onChange={handleChange} hint="Optional. Links this book to an author page.">
                    <option value="">— None —</option>
                    {authors.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </SelectField>
                  <TextField label="Author / contributors (display)" name="subtitle" value={formData.subtitle} onChange={handleChange} placeholder="e.g. Zoe Moss, Lucia Bellemare" />
                  <div className="be-span-2">
                    <TextField label="Web address (URL slug)" name="slug" value={formData.slug} onChange={handleChange} placeholder="the-book-slug"
                      readOnly={addressLocked}
                      hint={addressLocked ? `/books/${formData.slug || "your-book"} — locked while the book is published, so existing links keep working.` : `/books/${formData.slug || "your-book"}`} error={slugWarn || undefined} />
                    <div className="be-inline-actions">
                      {addressLocked
                        ? <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setConfirmSlug(true)}><RefreshCw size={13} aria-hidden /> Change web address</button>
                        : <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => set("slug", slugify(formData.title || ""))}><RefreshCw size={13} aria-hidden /> Regenerate from title</button>}
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => void copyBookLink()} disabled={!book?.slug}
                        title={!book?.slug ? "Save the book first to get its link." : book.slug !== formData.slug ? "Copies the saved web address. Save to use the new one." : undefined}><Copy size={13} aria-hidden /> Copy link</button>
                    </div>
                  </div>
                  <div className="be-span-2">
                    <div className="be-desc-toolbar" role="toolbar" aria-label="Description formatting">
                      {DESC_TOOLS.map(({ action, label, Icon }) => (
                        <button key={action} type="button" className="rp-btn rp-btn-ghost rp-btn-sm" title={label} aria-label={label}
                          onMouseDown={(e) => e.preventDefault()} onClick={() => formatDescription(action)}><Icon size={14} aria-hidden /></button>
                      ))}
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" title="Add link" onMouseDown={(e) => e.preventDefault()} onClick={() => openDescLink("description")}><Link2 size={14} aria-hidden /> Add link</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-pressed={descPreview} onClick={() => setDescPreview((v) => !v)}><Eye size={14} aria-hidden /> {descPreview ? "Hide preview" : "Preview"}</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={descAiBusy} onClick={() => void writeDescriptionWithAi()}
                        title="Draft this description with AI (Settings › General › AI writing assistant)">
                        {descAiBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} {descAiBusy ? "Writing…" : (formData.description || "").trim() ? "Improve with AI" : "Write with AI"}
                      </button>
                      {descBeforeAi !== null && (
                        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { set("description", descBeforeAi); setDescBeforeAi(null); }}>
                          <Undo2 size={14} aria-hidden /> Undo AI draft
                        </button>
                      )}
                    </div>
                    <div ref={descWrap}>
                      <TextArea label="Description" name="description" value={formData.description} onChange={handleChange} rows={9}
                        onSelect={(e) => { const t = e.currentTarget; descSelection.current = { start: t.selectionStart, end: t.selectionEnd }; }}
                        placeholder="Why this book matters, what readers will discover, notes on the edition…"
                        hint={`${(formData.description || "").trim().split(/\s+/).filter(Boolean).length} words · Select words and use the buttons above for bold, italic, headings, lists, quotes and links. Fonts, sizes and colours: Design › Style › Product page · buy card & details › Description text.`} />
                    </div>
                    {descPreview && (
                      <div className="be-desc-preview" aria-label="Description preview">
                        <p className="rp-hint">Preview — the shop uses its own fonts and colours.</p>
                        <div className="fm-pdp-desc-text" style={{ whiteSpace: "pre-line" }}>{formData.description ? <DescriptionText text={formData.description} /> : <span className="rp-hint">Nothing written yet.</span>}</div>
                      </div>
                    )}
                    <div className="be-desc-toolbar" role="toolbar" aria-label="Artist bio formatting">
                      {DESC_TOOLS.map(({ action, label, Icon }) => (
                        <button key={action} type="button" className="rp-btn rp-btn-ghost rp-btn-sm" title={label} aria-label={`${label} (Artist bio)`}
                          onMouseDown={(e) => e.preventDefault()} onClick={() => formatDescription(action, "artistBio")}><Icon size={14} aria-hidden /></button>
                      ))}
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" title="Add link" onMouseDown={(e) => e.preventDefault()} onClick={() => openDescLink("artistBio")}><Link2 size={14} aria-hidden /> Add link</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-pressed={bioPreview} onClick={() => setBioPreview((v) => !v)}><Eye size={14} aria-hidden /> {bioPreview ? "Hide preview" : "Preview"}</button>
                    </div>
                    <div ref={bioWrap}>
                      <TextArea label="Artist bio" name="artistBio" value={formData.artistBio || ""} onChange={handleChange} rows={5}
                        onSelect={(e) => { const t = e.currentTarget; bioSelection.current = { start: t.selectionStart, end: t.selectionEnd }; }}
                        placeholder="Who made this book: a short bio of the artist or artists."
                        hint="Optional. Fill it in and the book page gets an Artist bio tab; leave it empty and there is no tab. Select words and use the buttons above for bold, italic, links and more." />
                    </div>
                    {bioPreview && (
                      <div className="be-desc-preview" aria-label="Artist bio preview">
                        <p className="rp-hint">Preview — the shop uses its own fonts and colours.</p>
                        <div className="fm-pdp-desc-text" style={{ whiteSpace: "pre-line" }}>{formData.artistBio ? <DescriptionText text={formData.artistBio} /> : <span className="rp-hint">Nothing written yet.</span>}</div>
                      </div>
                    )}
                    <DescriptionLinkDialog open={!!descLink} initialText={descLink?.text || ""} onClose={() => setDescLink(null)} onInsert={insertDescLink} />
                  </div>
                </div>
              </SectionCard>
              {book && <ProductTypeCard form={formData} onChange={setProductType} />}
              </div>
              <div role="tabpanel" id="bd-panel-publishing" aria-labelledby="rp-tab-bd-publishing" className="be-subpanel" hidden={shownDetailsSub !== "bd-publishing"}>
              <SectionCard title="Publishing details" description="Bibliographic data used on the product page and in search.">
                <div className="be-grid be-grid-3">
                  <div>
                    <TextField label="ISBN" name="isbn" value={formData.isbn} onChange={handleChange} placeholder="978-0-…" error={isbnWarn} />
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={!String(formData.isbn || "").trim() || isbnBusy} onClick={() => void fillFromIsbn()}
                      title="Looks the ISBN up on Open Library (then Google Books) and fills only empty fields">
                      {isbnBusy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RefreshCw size={13} aria-hidden />} Fill from ISBN
                    </button>
                  </div>
                  <TextField label="SKU" name="sku" value={formData.sku} onChange={handleChange} placeholder="LM-2024-…" />
                  <TextField label="Barcode / UPC" name="barcode" value={formData.barcode || ""} onChange={handleChange} placeholder="0-00000-00000-0" />
                  <SelectField label="Format" name="format" value={formData.format} onChange={handleChange}>
                    {["Paperback", "Hardcover", "Special Edition", "Box Set", "Zine", "E-book (PDF)", "E-book (EPUB)", "Audiobook"].map((f) => <option key={f}>{f}</option>)}
                  </SelectField>
                  <TextField label="Publisher" name="publisher" value={formData.publisher || ""} onChange={handleChange} placeholder="Lyricalmyrical Books" />
                  <TextField label="Edition" name="edition" value={formData.edition || ""} onChange={handleChange} placeholder="First Edition" />
                  <TextField label="Publication date" type="date" name="publishDate" value={formData.publishDate || ""} onChange={handleChange} />
                  <TextField label="Page count" type="number" min={0} name="pageCount" value={formData.pageCount ?? 0} onChange={handleChange} />
                  <TextField label="Language" name="language" value={formData.language || ""} onChange={handleChange} placeholder="English" />
                  {!giftCard && <TextField label="Dimensions" name="dimensions" value={formData.dimensions || ""} onChange={handleChange} placeholder="6 x 9 in" />}
                  {!giftCard && <WeightField label="Weight" value={formData.weight || ""} onChange={(w) => set("weight", w)} hint={boxSetOn ? "Used for weight-based shipping. Leave blank to use the books inside added together." : "Used for weight-based shipping."} />}
                </div>
                {isbnResult && (
                  <div role="status" className="be-note">
                    {isbnResult.text}
                    {isbnResult.cover && <> Suggested cover (not added): <a href={isbnResult.cover} target="_blank" rel="noopener noreferrer">view</a>{" "}
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { setPhotoInput(isbnResult.cover!); setTab("media"); }}>Put in “Add image from URL”</button>
                      {" "}Only use it if you have the right to.</>}
                  </div>
                )}
              </SectionCard>
              </div>
              {!giftCard && !isDigital && (
                <div role="tabpanel" id="bd-panel-customs" aria-labelledby="rp-tab-bd-customs" className="be-subpanel" hidden={shownDetailsSub !== "bd-customs"}>
                <SectionCard title="International parcels (customs)" foldKey="book-editor-customs"
                  description="Only used on customs forms for parcels leaving the country. Blank boxes use the defaults shown.">
                  <div className="be-grid">
                    <TextField label="Customs description" name="customsDescription" value={formData.customsDescription || ""} onChange={handleChange} placeholder={DEFAULT_CUSTOMS_DESCRIPTION} hint="Printed on the customs form of international labels. Blank = “Printed books”." />
                    <TextField label="Tariff (HS) code" name="hsTariffNumber" value={formData.hsTariffNumber || ""} onChange={handleChange} placeholder={DEFAULT_HS_CODE}
                      error={formData.hsTariffNumber && !validHsCode(formData.hsTariffNumber) ? "Use 4 to 10 digits, like 4901.99." : undefined}
                      hint="Customs code for international parcels. Blank = 4901.99 (printed books)." />
                    <TextField label="Country of origin" name="customsOriginCountry" value={formData.customsOriginCountry || ""} onChange={handleChange} placeholder="CA" maxLength={2}
                      hint="Where the book was printed (2-letter code). Blank = your shipping-from country." />
                  </div>
                </SectionCard>
                </div>
              )}
              <div role="tabpanel" id="bd-panel-rows" aria-labelledby="rp-tab-bd-rows" className="be-subpanel" hidden={shownDetailsSub !== "bd-rows"}>
              <SectionCard title="Rows on the book page's Details tab" foldKey="book-editor-detail-rows"
                description="Every row of the book page's Details tab, in the order shown there. Change any label or value, hide a row, move rows with ↑ / ↓, or add your own (Paper, Printing, Design…). A blank value on a standard row uses the matching field in Publishing details.">
                <div>
                  {(() => {
                    const rows = editorDetailRows(formData);
                    const put = (next: DetailRow[]) => setFormData((prev: any) => ({ ...prev, detailRows: next, extraDetails: [] }));
                    return (
                      <>
                        {rows.map((row, i) => {
                          const builtin = BUILTIN_DETAILS.find((b) => b.key === row.key);
                          const fieldValue = builtin ? builtinDetailValue(formData, row.key) : "";
                          const name = builtin ? builtin.name : `Row ${i + 1}`;
                          return (
                            <div key={row.key} className="be-detail-row" data-hidden={row.hidden || undefined}>
                              <TextField label={builtin ? `${name} · label` : `${name} · label`} value={row.label || ""} maxLength={60}
                                placeholder={builtin ? name : "Paper"}
                                onChange={(e) => put(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                              <TextArea label={`${name} · value`} value={row.value || ""} rows={2} maxLength={500}
                                placeholder={builtin ? (fieldValue || "Empty — fill it in Publishing details, or type here") : "Mohawk Digital 80lb"}
                                hint={builtin && !row.value ? (fieldValue ? "Using what Publishing details says. Type here to show something else." : "Empty rows don't show.") : undefined}
                                onChange={(e) => put(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                              <div className="be-detail-row-tools">
                                <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === 0} aria-label={`Move ${name} up`}
                                  onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; put(n); }}>↑</button>
                                <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === rows.length - 1} aria-label={`Move ${name} down`}
                                  onClick={() => { const n = [...rows]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; put(n); }}>↓</button>
                                <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-pressed={!!row.hidden}
                                  onClick={() => put(rows.map((r, j) => (j === i ? { ...r, hidden: !r.hidden } : r)))}>{row.hidden ? "Show" : "Hide"}</button>
                                {!builtin && <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => put(rows.filter((_, j) => j !== i))}>Remove</button>}
                              </div>
                            </div>
                          );
                        })}
                        {rows.length < 40 && (
                          <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm"
                            onClick={() => put([...rows, { key: `custom:${Date.now().toString(36)}`, label: "", value: "", hidden: false }])}>+ Add a detail row</button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </SectionCard>
              </div>
            </>
          )}

          {shownTab === "media" && (
            <SectionCard title="Book images" description="Use genuine cover and interior photographs. Drag the ⠿ handle to reorder; the first image is the cover shown in the shop and search."
              actions={<>
                <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading || formData.photos.length >= MAX_BOOK_PHOTOS}><Upload size={14} aria-hidden /> Upload images</button>
                {photosToDescribe.length > 0 && (
                  <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={describeAllPhotos} disabled={describingIds.size > 0 || uploading}>
                    {describeAll ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}{" "}
                    {describeAll ? `Described ${describeAll.done} of ${describeAll.total}…` : `Describe ${photosToDescribe.length} ${photosToDescribe.length === 1 ? "photo" : "photos"} with AI`}
                  </button>
                )}
                <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => videoInputRef.current?.click()} disabled={uploading || formData.photos.length >= MAX_BOOK_PHOTOS || formData.photos.filter(isVideoItem).length >= MAX_BOOK_VIDEOS}><Film size={14} aria-hidden /> Add video</button>
              </>}>
              <div className={`be-drop ${dragOver ? "is-over" : ""}`}
                onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <div className="be-photos">
                    <SortableContext items={formData.photos.map((p: any) => p.id)} strategy={rectSortingStrategy}>
                      {formData.photos.map((photo: any, i: number) => (
                        <SortablePhoto key={photo.id} photo={photo} index={i} onRemove={removePhoto}
                          onAlt={(id, alt) => setFormData((prev: any) => ({ ...prev, photos: prev.photos.map((p: any) => (p.id === id ? { ...p, altText: alt } : p)) }))}
                          onCrop={setCropId}
                          onDescribe={describeOne} describing={describingIds.has(photo.id)} aiLocked={describingIds.size > 0}
                          onMakeCover={(id) => setFormData((prev: any) => { const p = prev.photos.find((x: any) => x.id === id); return { ...prev, photos: [p, ...prev.photos.filter((x: any) => x.id !== id)] }; })} />
                      ))}
                    </SortableContext>
                    {formData.photos.length < MAX_BOOK_PHOTOS && (
                      <button type="button" className="be-photo-add" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <Upload size={22} aria-hidden />}
                        <span>{uploading ? (videoStatus || "Uploading…") : "Add or drop images or videos"}</span>
                      </button>
                    )}
                  </div>
                </DndContext>
              </div>
              {cropId && (() => {
                const i = (formData.photos || []).findIndex((p: any) => p.id === cropId);
                const photo = i >= 0 ? formData.photos[i] : null;
                return photo ? (
                  <PhotoCropDialog photo={photo} label={i === 0 ? "Cover" : `Image ${i + 1}`} design={liveDesign}
                    onClose={() => setCropId(null)}
                    onSave={({ framing, adjust }) => setFormData((prev: any) => ({
                      ...prev,
                      photos: prev.photos.map((p: any) => {
                        if (p.id !== cropId) return p;
                        const { framing: _old, adjust: _oldAdjust, ...rest } = p;
                        return { ...rest, ...(framing ? { framing } : {}), ...(adjust ? { adjust } : {}) };
                      }),
                    }))} />
                ) : null;
              })()}
              <input type="file" ref={fileInputRef} multiple onChange={(e) => uploadFiles(e.target.files)} accept="image/*" className="hidden" />
              <input type="file" ref={videoInputRef} multiple onChange={(e) => uploadVideos(Array.from(e.target.files || []))} accept={BOOK_VIDEO_ACCEPT} className="hidden" />
              {videoStatus && <p className="be-note" role="status">{videoStatus}</p>}
              <p className="be-note">{formData.photos.length} of {MAX_BOOK_PHOTOS} images and videos. Describe each photo in the box under it, so screen readers and search engines know what it shows.</p>
              <details className="be-more-info">
                <summary>About videos</summary>
                <p className="be-note">Videos: up to {MAX_BOOK_VIDEOS} per book, {formatMegabytes(MAX_BOOK_VIDEO_BYTES)} each, MP4 works everywhere (WebM and MOV in most browsers). They play on the book page and in the enlarged viewer; shop cards show a still from the video. Each play downloads the file from your Firebase storage, so short clips (under a minute, 720p or 1080p) keep the shop inside its free monthly allowance.</p>
              </details>
              <div className="be-url-row">
                <TextField label="Add image from URL" value={photoInput} onChange={(e) => setPhotoInput(e.target.value)} placeholder="https://…/cover.jpg"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhoto(); } }} />
                <button type="button" onClick={addPhoto} className="rp-btn rp-btn-secondary"><Plus size={16} aria-hidden /> Add</button>
                <button type="button" onClick={() => setLibraryOpen(true)} className="rp-btn rp-btn-secondary" disabled={formData.photos.length >= MAX_BOOK_PHOTOS}>Choose from library</button>
              </div>
              {libraryOpen && <MediaLibraryDialog onClose={() => setLibraryOpen(false)} onChoose={(url, alt, sizes) => {
                setLibraryOpen(false);
                setFormData((prev: any) => prev.photos.length >= MAX_BOOK_PHOTOS ? prev : ({ ...prev, photos: [...prev.photos, { url, ...sizes, id: Math.random().toString(36).substr(2, 9), altText: alt || "" }] }));
              }} />}
            </SectionCard>
          )}

          {shownTab === "pricing" && giftCard && (
            <SectionCard title="Price" description="A gift card's prices are its amounts. Set them on the Amounts tab — each one is both what the shopper pays and what the card is worth. Gift cards are never taxed, discounted or put on sale.">
              <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => setTab("editions")}>Go to Amounts</button>
            </SectionCard>
          )}
          {shownTab === "pricing" && !giftCard && (
            <>
              <SectionCard title="Price" description="Enter the CAD price. Shoppers who pick USD or EUR see, and are charged, the CAD price converted at today's exchange rate. The USD/EUR figures below are for your reference only.">
                <div className="be-toggles"><Toggle label="Edit reference USD & EUR prices" checked={overrides} onChange={(v) => set("manualCurrencyOverrides", v)} /></div>
                <div className="be-grid be-grid-3">
                  {money("Price (CAD)", "retailPrice", "$")}
                  {money("Price (USD)", "usdPrice", "$", { disabled: !overrides })}
                  {money("Price (EUR)", "eurPrice", "€", { disabled: !overrides })}
                  {money("Cost (CAD)", "costPrice", "$", { hint: "What it costs you to print/acquire." })}
                  {money("Cost (USD)", "usdCostPrice", "$", { disabled: !overrides })}
                  {money("Cost (EUR)", "eurCostPrice", "€", { disabled: !overrides })}
                </div>
                <div className="be-stats">
                  <div><span>Profit / copy</span><strong>${fmt(activePrice - num(formData.costPrice))}</strong></div>
                  <div><span>Margin</span><strong>{activePrice > 0 ? `${marginPct.toFixed(0)}%` : "—"}</strong></div>
                  <div><span>Charge tax</span><Toggle label="Charge sales tax" checked={!!formData.chargeTax} onChange={(v) => set("chargeTax", v)} /></div>
                </div>
                {activePrice > 0 && num(formData.costPrice) > activePrice && <p className="be-warn" role="status">⚠ Cost is higher than the selling price — you'd lose money on each copy.</p>}
              </SectionCard>
              <SectionCard title="Sale pricing" description="Show a struck-through original price with a discounted one — now, or between the dates you choose.">
                <Toggle label="This book is on sale" checked={!!formData.isOnSale} onChange={(v) => set("isOnSale", v)} />
                {formData.isOnSale && (
                  <>
                    <div className="be-grid be-grid-3 mt-4">
                      {money("Sale (CAD)", "salePrice", "$")}
                      {money("Sale (USD)", "usdSalePrice", "$", { disabled: !overrides })}
                      {money("Sale (EUR)", "eurSalePrice", "€", { disabled: !overrides })}
                    </div>
                    <div className="be-inline-actions">
                      {[10, 20, 30, 50].map((p) => (
                        <button key={p} type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => set("salePrice", Number((num(formData.retailPrice) * (1 - p / 100)).toFixed(2)))}>{p}% off</button>
                      ))}
                      {salePct > 0 && <StatusBadge tone="success">{salePct}% off</StatusBadge>}
                    </div>
                    {num(formData.salePrice) >= num(formData.retailPrice) && <p className="be-warn" role="status">⚠ The sale price isn't lower than the regular price.</p>}
                    <SaleWindowFields form={formData} set={set} />
                  </>
                )}
              </SectionCard>
            </>
          )}

          {shownTab === "inventory" && (
            <>
              {giftCard ? (
                <SectionCard title="Inventory" description="Gift cards have no stock limit. Each one bought creates a new code that is emailed straight away, so there is nothing to ship or count." >
                  <p className="be-note">Inventory tracking is off for gift cards.</p>
                </SectionCard>
              ) : boxSetOn ? (
                <SectionCard title="Inventory" description="A box set has no stock of its own. Each set sold takes copies from the books inside it (Box set tab), so it sells out when any of them does.">
                  <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => setTab("boxset")}>Go to Box set</button>
                </SectionCard>
              ) : (
              <SectionCard title="Inventory" description={hasVariants ? "Stock is totalled from your editions." : "Track how many copies you have."}>
                <div className="be-toggles">
                  <Toggle label="Track inventory (decrement stock on each sale)" checked={!!formData.trackInventory} onChange={(v) => set("trackInventory", v)} />
                  {formData.trackInventory && <Toggle label="Allow backorders when out of stock" checked={!!formData.allowBackorder} onChange={(v) => set("allowBackorder", v)} />}
                </div>
                <div className="be-grid be-grid-3">
                  <TextField label={`Stock level${hasVariants ? " (from editions)" : ""}`} type="number" name="stockLevel" value={formData.stockLevel} onChange={handleChange}
                    disabled={hasVariants || stockLocked(null)}
                    hint={!hasVariants ? stockLockHint(null) : undefined} />
                  <div className="be-stock-status">{formData.trackInventory && stockBadge(num(formData.stockLevel))}</div>
                  <TextField label="Shelf location" name="shelfLocation" value={formData.shelfLocation || ""} onChange={handleChange} placeholder="e.g. B2 or Box 4" hint={hasVariants ? "Shown on the packing checklist for editions without their own shelf location." : "Shown next to this book on the packing checklist."} />
                </div>
                {lowStock && <p className="be-warn" role="status">⚠ Low stock. Consider reprinting or turning on backorders.</p>}
              </SectionCard>
              )}
              {!giftCard && <SectionCard title="Coming soon" description="Show this book in the shop before it can be bought. Shoppers get a Coming soon button that signs them up for an email when it's out.">
                <div className="be-toggles">
                  <Toggle label="Show as Coming soon (not for sale yet)" checked={!!formData.comingSoon} onChange={(v) => setFormData((prev: any) => ({ ...prev, comingSoon: v, ...(v ? { preorder: false } : {}) }))} />
                </div>
                {formData.comingSoon && (
                  <>
                    <div className="be-grid">
                      <div>
                        <p className="be-note">Shown date = <strong>{formData.publishDate || "none (just “Coming soon”)"}</strong>. Set it in Details › Publication date to show “Coming {formData.publishDate ? formatReleaseDate(releaseDateOf(formData), "en-CA") : "<date>"}”.</p>
                        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => goTo("details", "publishDate")}>Go to Publication date</button>
                      </div>
                      <div className="be-stock-status"><StatusBadge tone="info">Coming soon · not for sale</StatusBadge></div>
                    </div>
                    <p className="rp-hint">
                      Shoppers see a “Coming soon” badge on shop cards and a Coming soon button on the book page instead of Add to bag; pressing it lets them leave their email.
                      {" "}When the book is ready, turn this switch off and save: it goes on sale and everyone who signed up gets an “Out now” email (for an edition that has stock, or isn't stock-counted).
                      {" "}It stays on until you turn it off — the publication date doesn't switch it off by itself. Want orders before release instead? Use Pre-order below.
                    </p>
                    {formData.status !== "published" && <p className="be-warn" role="status">⚠ Coming soon books only show in the shop once the book's Status is Published.</p>}
                  </>
                )}
              </SectionCard>}
              {!giftCard && <SectionCard title="Pre-order" description="Sell this book before it comes out. On its publication date it becomes a normal book by itself.">
                <div className="be-toggles">
                  <Toggle label="Take pre-orders until the publication date" checked={!!formData.preorder} onChange={(v) => setFormData((prev: any) => ({ ...prev, preorder: v, ...(v ? { comingSoon: false } : {}) }))} />
                </div>
                {formData.preorder && (
                  <>
                    <div className="be-grid">
                      <div>
                        <p className="be-note">Release day = <strong>{formData.publishDate || "to be announced"}</strong>. Set it in Details › Publication date (leave it empty for “date to be announced”).</p>
                        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => goTo("details", "publishDate")}>Go to Publication date</button>
                      </div>
                      <div className="be-stock-status">
                        {preorderActive(formData)
                          ? <StatusBadge tone="info">{releaseDateOf(formData) ? `On pre-order · releases ${formatReleaseDate(releaseDateOf(formData), "en-CA")}` : "On pre-order · date to be announced"}</StatusBadge>
                          : <StatusBadge tone="neutral">Released — selling normally</StatusBadge>}
                      </div>
                    </div>
                    <p className="rp-hint">
                      Shoppers see “Pre-order” on the button and the release date on the book page, bag and checkout. Paid pre-orders wait in Orders › Pre-orders until release day (or press “Ready to ship now”); e-books unlock on release day.
                      {" "}Pre-orders use the stock above: {formData.trackInventory ? (formData.allowBackorder ? "backorders are on, so pre-orders never run out." : "they stop when stock reaches 0 — enter how many copies you'll accept (e.g. your print run), or turn on backorders.") : "inventory isn't tracked, so pre-orders are unlimited."}
                    </p>
                    {formData.status !== "published" && <p className="be-warn" role="status">⚠ Pre-orders only show in the shop once the book's Status is Published.</p>}
                    {formData.scheduleDate && !releaseArrived(formData.scheduleDate) && <p className="be-warn" role="status">⚠ This book is scheduled to appear later, so shoppers can't pre-order it until then. Clear the schedule to open pre-orders now.</p>}
                  </>
                )}
              </SectionCard>}
              {!giftCard && <SectionCard title="Shipping" description="Which shipping rates apply to this book. Status, schedule and Featured are in the Summary panel (beside the form, or below it on a phone).">
                <div className="be-grid">
                  <SelectField label="Shipping profile" name="shippingProfileId" value={formData.shippingProfileId} onChange={handleChange}>
                    {shippingProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                </div>
              </SectionCard>}
              {isDigital && !giftCard && (
                <SectionCard title="Secure digital file" description="Stored securely and delivered to paying customers only.">
                  {formData.digitalFileName ? (
                    <div className="be-file">
                      <div><span className="be-label-xs">Active file</span><code>{formData.digitalFileName}</code></div>
                      <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => void removeDigitalFile(null)}><Trash2 size={14} aria-hidden /> Remove</button>
                    </div>
                  ) : (
                    <>
                      <input type="file" ref={digitalFileInputRef} onChange={handleDigitalUpload} accept={formData.format.includes("PDF") ? ".pdf" : formData.format.includes("EPUB") ? ".epub" : ".mp3,.m4a,.zip"} className="hidden" />
                      <button type="button" className="be-photo-add be-wide" onClick={() => digitalFileInputRef.current?.click()} disabled={uploadingDigital}>
                        {uploadingDigital ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <Upload size={22} aria-hidden />}
                        <span>{uploadingDigital ? "Uploading…" : "Upload digital book file"}</span>
                      </button>
                    </>
                  )}
                </SectionCard>
              )}
            </>
          )}

          {shownTab === "editions" && (
            <SectionCard title={giftCard ? "Gift card amounts" : "Editions & pricing"}
              description={giftCard ? "Each edition is an amount, e.g. CA$25. Shoppers pick one; the card is worth what they pay. Every amount must be more than $0." : "Sell multiple formats or special editions of the same book. Base price and stock are replaced by these."}
              actions={<button type="button" onClick={giftCard ? () => set("variants", [...(formData.variants || []), { ...giftAmount(0), name: "", price: "" }]) : addVariant} className="rp-btn rp-btn-primary rp-btn-sm"><Plus size={14} aria-hidden /> {giftCard ? "Add amount" : "Add edition"}</button>}>
              {giftCard && (
                <div className="be-inline-actions" role="group" aria-label="Quick add amounts">
                  <span className="be-label-xs">Quick add:</span>
                  {[10, 25, 50, 100].map((n) => (
                    <button key={n} type="button" className="rp-btn rp-btn-secondary rp-btn-sm"
                      disabled={(formData.variants || []).some((v: any) => num(v.price) === n)}
                      onClick={() => set("variants", [...(formData.variants || []), giftAmount(n)])}><Plus size={13} aria-hidden /> CA${n}</button>
                  ))}
                </div>
              )}
              {!hasVariants && <p className="be-note">{giftCard ? "No amounts yet. Add at least one." : "No special editions. The base price and stock on the Pricing and Inventory tabs apply."}</p>}
              <input type="file" ref={variantFileInputRef} onChange={handleVariantDigitalUpload} accept=".pdf,.epub,.mp3,.m4a,.zip" className="hidden" aria-hidden="true" tabIndex={-1} />
              <div className="be-variants">
                {(formData.variants || []).map((v: Variant, i: number) => (
                  <fieldset key={v.id} className="be-variant">
                    <legend>{giftCard ? "Amount" : "Edition"} {i + 1}{v.name ? ` — ${v.name}` : ""}</legend>
                    <div className="be-variant-tools">
                      {!giftCard && stockBadge(num((v as any).stockLevel ?? v.stock))}
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => duplicateVariant(v.id)}><Copy size={13} aria-hidden /> Duplicate</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => void removeVariant(v.id)} aria-label={`Remove ${giftCard ? "amount" : "edition"} ${v.name || i + 1}`}><Trash2 size={13} aria-hidden /> Remove</button>
                    </div>
                    {giftCard ? (
                    <div className="be-grid be-grid-3">
                      <TextField label="Amount name" placeholder="e.g. CA$25" value={v.name} onChange={(e) => updateVariant(v.id, "name", e.target.value)} hint="What shoppers see in the amount picker." />
                      <TextField label="Amount (CA$)" type="number" min={1} step="0.01" value={v.price} onChange={(e) => updateVariant(v.id, "price", e.target.value === "" ? "" : Number(e.target.value))} />
                      <TextField label="SKU" value={v.sku || ""} onChange={(e) => updateVariant(v.id, "sku", e.target.value)} />
                    </div>
                    ) : (
                    <div className="be-grid be-grid-4">
                      <div className="be-span-2"><TextField label="Edition name" placeholder="e.g. Signed Collector's Copy" value={v.name} onChange={(e) => updateVariant(v.id, "name", e.target.value)} /></div>
                      <TextField label="SKU" value={v.sku || ""} onChange={(e) => updateVariant(v.id, "sku", e.target.value)} />
                      <WeightField label="Weight" value={v.weight || ""} onChange={(w) => updateVariant(v.id, "weight", w)} />
                      <TextField label="Price (CAD)" type="number" min={0} step="0.01" value={v.price} onChange={(e) => updateVariant(v.id, "price", e.target.value === "" ? "" : Number(e.target.value))} />
                      <TextField label="Price (USD)" type="number" min={0} step="0.01" disabled={!overrides} value={(v as any).usdPrice ?? 0} onChange={(e) => updateVariant(v.id, "usdPrice", Number(e.target.value))} />
                      <TextField label="Price (EUR)" type="number" min={0} step="0.01" disabled={!overrides} value={(v as any).eurPrice ?? 0} onChange={(e) => updateVariant(v.id, "eurPrice", Number(e.target.value))} />
                      <TextField label="Stock" type="number" min={0} value={(v as any).stockLevel ?? v.stock ?? 0} onChange={(e) => updateVariant(v.id, "stock", Number(e.target.value))}
                        disabled={stockLocked(v.id)} hint={stockLockHint(v.id)} />
                      <TextField label="Shelf location" placeholder="e.g. B2" value={(v as any).shelfLocation || ""} onChange={(e) => updateVariant(v.id, "shelfLocation", e.target.value)} hint="Packing checklist; blank = the book's." />
                      <div style={{ gridColumn: "1 / -1" }}>
                        <Toggle label="Digital edition (buyers download a file)" checked={(v as any).digital === true} onChange={(on) => updateVariant(v.id, "digital", on)} />
                        {(v as any).digital === true && (
                          <div className="be-inline-actions" role="group" aria-label={`Download file for ${v.name || "this edition"}`}>
                            {(v as any).digitalFileName ? (
                              <>
                                <span className="be-label-xs">This edition's file</span> <code>{String((v as any).digitalFileName).replace(/^\d{10,}-/, "")}</code>
                                <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => void removeDigitalFile(v.id)}><Trash2 size={13} aria-hidden /> Remove</button>
                              </>
                            ) : (
                              <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={!!uploadingVariantFile}
                                onClick={() => { variantFileTarget.current = v.id; variantFileInputRef.current?.click(); }}>
                                <Upload size={13} aria-hidden /> {uploadingVariantFile === v.id ? "Uploading…" : "Upload this edition's file"}
                              </button>
                            )}
                            <span className="be-note">{(v as any).digitalFileName ? "Buyers of this edition get this file." : "No file yet: buyers of this edition get the book's main digital file, if it has one."}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                    <div className="be-variant-img">
                      {v.photoUrl && <img src={v.photoUrl} alt="" />}
                      <SelectField label="Edition image" value={v.photoUrl || ""} onChange={(e) => updateVariant(v.id, "photoUrl", e.target.value)}>
                        <option value="">— Use the main image —</option>
                        {(formData.photos || []).map((p: any, idx: number) => isVideoItem(p) ? null : <option key={p.id || idx} value={p.url}>Image {idx + 1}{p.altText ? ` (${p.altText})` : ""}</option>)}
                      </SelectField>
                    </div>
                  </fieldset>
                ))}
              </div>
            </SectionCard>
          )}

          {shownTab === "boxset" && (
            <>
              <BoxSetEditor form={formData} set={set} bookId={book?.id} catalog={recommendationCatalog} catalogError={recommendationError} on={boxSetOn} onToggle={toggleBoxSet} />
              {/* Box sets don't offer add-ons. */}
              {!boxSetOn && <AddOnsEditor form={formData} set={set} />}
            </>
          )}

          {shownTab === "organize" && (
            <>
            <SectionCard title="Categories & tags" description="Categories build the shop menus — pick every one this book belongs in. New categories created here are published to the shop and added to Design › Menus automatically. Tags power search.">
              <div className="be-chips" role="group" aria-label="Categories">
                {categories.map((cat) => {
                  const on = (formData.categories || []).includes(cat);
                  const parent = categoryParents[cat];
                  return <button key={cat} type="button" aria-pressed={on} className={`be-chip ${on ? "is-on" : ""}`} onClick={() => toggleCategory(cat)}>{on ? "✓ " : ""}{parent ? `${parent} › ` : ""}{cat}</button>;
                })}
              </div>
              {categories.length === 0 && <p className="be-category-empty">No assignable categories yet. Create the first one below.</p>}
              <div className="be-category-create" aria-label="Create a shop category">
                <TextField label="New category" placeholder="e.g. Zines" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCategory(); } }} />
                <SelectField label="Sits under (optional)" value={newCategoryParent} onChange={(event) => setNewCategoryParent(event.target.value)}>
                  <option value="">Top-level category</option>
                  {categoryDefinitions.filter((category) => !parentOf(category, categoryDefinitions)).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </SelectField>
                <button type="button" className="rp-btn rp-btn-secondary" disabled={!newCategory.trim() || savingCategory} onClick={() => void createCategory()}>
                  {savingCategory ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
                  Create & assign
                </button>
              </div>
              <p className="be-category-help">Category changes appear on the public storefront immediately and stay in sync with the Studio designer.</p>
              <div className="be-tags">
                <span className="be-label-xs">Tags</span>
                <div className="be-chips">
                  {(formData.tags || []).map((tag: string) => (
                    <span key={tag} className="be-tag">{tag}
                      <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setFormData((prev: any) => ({ ...prev, tags: (prev.tags || []).filter((t: string) => t !== tag) }))}><X size={12} aria-hidden /></button>
                    </span>
                  ))}
                </div>
                <TextField label="Add tags" hideLabel placeholder="Type a tag, press Enter or comma" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onBlur={commitTags}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); commitTags(); } }} />
              </div>
            </SectionCard>
            <BookTemplatePicker value={formData.templateId} onChange={id => set("templateId", id ?? null)} />
            <SectionCard title="Curated recommendations" description="Choose up to four companion books in display order. Only published books appear to shoppers. Save this book to apply your selection.">
              <SelectField label="Recommendation source" value={Array.isArray(formData.relatedBookIds) ? "curated" : "automatic"} onChange={(event) => setFormData((prev: any) => {
                const next = { ...prev };
                if (event.target.value === "automatic") delete next.relatedBookIds;
                else next.relatedBookIds = [];
                return next;
              })}>
                <option value="automatic">Automatic category matches</option>
                <option value="curated">Publisher selection (empty hides recommendations)</option>
              </SelectField>
              {Array.isArray(formData.relatedBookIds) && <>
                <ol className="be-chips">
                  {formData.relatedBookIds.map((id: string, index: number) => {
                    const candidate = recommendationCatalog.find(item => item.id === id);
                    return <li key={id} className="be-tag">
                      <span>{index + 1}. {candidate?.title || "Unavailable book"}{candidate && candidate.status !== "published" ? " (not published)" : ""}</span>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Move ${candidate?.title || "book"} up`} disabled={index === 0} onClick={() => setFormData((prev: any) => {
                        const ids = [...prev.relatedBookIds];
                        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                        return { ...prev, relatedBookIds: ids };
                      })}>Move up</button>
                      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Remove recommendation ${candidate?.title || "book"}`} onClick={() => setFormData((prev: any) => ({ ...prev, relatedBookIds: prev.relatedBookIds.filter((value: string) => value !== id) }))}>Remove</button>
                    </li>;
                  })}
                </ol>
                {recommendationError ? <p role="alert">The catalog could not be loaded. Your saved selection is preserved; reopen this editor to retry.</p> : <>
                  <TextField label="Find a companion book" value={recommendationSearch} onChange={(event) => setRecommendationSearch(event.target.value)} />
                  <SelectField label="Add recommendation" value="" disabled={formData.relatedBookIds.length >= 4} onChange={(event) => {
                    const id = event.target.value;
                    if (id) setFormData((prev: any) => ({ ...prev, relatedBookIds: [...prev.relatedBookIds, id] }));
                  }}>
                    <option value="">Choose a book</option>
                    {recommendationCatalog.filter(item => item.id !== book?.id && !formData.relatedBookIds.includes(item.id) && String(item.title || "").toLowerCase().includes(recommendationSearch.toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.title}{item.status !== "published" ? " (not published)" : ""}</option>)}
                  </SelectField>
                </>}
              </>}
            </SectionCard>
            </>
          )}

          {visited.has("more") && <div hidden={shownTab !== "more"}><BookCustomFields form={formData} set={set} onDefinitionsDirty={setFieldsDirty} /></div>}

          {visited.has("seo") && <div hidden={shownTab !== "seo"}><BookSeoPane book={{ ...formData, id: book?.id }} onChange={set} /></div>}
        </form>

        {publishReview && <CatalogReviewDialog books={[{ ...formData, id: book?.id || "new" }]} action="publish" onClose={() => setPublishReview(false)} onConfirm={async () => { setPublishReview(false); await handleSave(undefined, true); }} />}
        <aside className="be-rail" aria-label="Book summary">
          <div className="be-rail-card">
            <p className="be-rail-head">Summary</p>
            <div className="be-rail-summary">
            <div className="be-rail-cover">{cover ? <img src={smallPhotoUrl(formData.photos?.[0], 200) || cover} alt={formData.photos?.[0]?.altText || ""} /> : <span>No cover yet</span>}</div>
            <div className="be-rail-facts">
            <p className="be-rail-title">{formData.title?.trim() || "Untitled book"}</p>
            <p className="be-rail-sub">{formData.subtitle || "—"}</p>
            <div className="be-rail-price">
              {giftCard ? (() => {
                const amounts = (formData.variants || []).map((v: any) => num(v.price)).filter((n: number) => n > 0);
                return <><strong>{amounts.length ? `$${fmt(Math.min(...amounts))}${amounts.length > 1 ? `–${fmt(Math.max(...amounts))}` : ""}` : "No amounts"}</strong> <span>CAD</span></>;
              })() : <>
                {saleNow && <s>${fmt(formData.retailPrice)}</s>}
                <strong>${fmt(activePrice)}</strong> <span>CAD</span>
              </>}
            </div>
            <div className="be-rail-row"><span>Format</span><b>{formData.format}</b></div>
            <div className="be-rail-row"><span>{giftCard ? "Type" : "Stock"}</span><b>{giftCard ? "Gift card" : boxSetOn ? "From the books inside" : formData.trackInventory ? num(formData.stockLevel) : "Not tracked"}</b></div>
            </div>
            </div>
            <div className="be-rail-publish">
            <SelectField label="Status" name="status" value={formData.status} onChange={handleChange} hint="Only Published books appear in the shop.">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </SelectField>
            <TextField label="Schedule publish date" type="date" name="scheduleDate" value={formData.scheduleDate || ""} onChange={handleChange} hint="Optional. Blank = live when published." />
            <Toggle label="Featured on the homepage" checked={!!formData.isFeatured} onChange={(v) => set("isFeatured", v)} />
            </div>
          </div>
          <div className="be-rail-card">
            <p className="be-rail-head">Ready to publish · {doneCount}/{checklist.length}</p>
            <div className="be-progress" role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={doneCount}><span style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>
            <ul className="be-check">
              {checklist.map((c) => (
                <li key={c.label} className={c.ok ? "is-ok" : ""}>
                  <button type="button" onClick={() => goTo(c.tab, "field" in c ? c.field : undefined)}><span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}{!c.ok && <em className="rp-sr-only"> (missing)</em>}</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

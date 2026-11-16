import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BusinessModel,
  CartItem,
  InvoiceRecord,
  PaymentMethod,
  ProductItem,
  ProductStatus,
  ShopConfig,
  TableOrder,
  TableStatus,
} from '../types';
import {
  formatTimeVN,
  formatVND,
  generateOrderId,
  matchesVietnameseSearch,
  playBarcodeBeep,
  speakVietnameseAlert,
} from '../utils/vietnamese';
import {
  appendInvoiceToSheet,
  getGoogleAccessToken,
  pollOrdersFromGas,
  postOrderToGas,
} from '../services/googleWorkspace';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductImage } from './ProductImage';
import { VietQRModal } from './VietQRModal';

interface OperationsViewProps {
  config: ShopConfig;
  products: ProductItem[];
  tableOrders: TableOrder[];
  onSaveInvoice: (invoice: InvoiceRecord) => Promise<void>;
  onUpdateProductStock: (items: CartItem[]) => Promise<void>;
  onSaveTableOrder: (order: TableOrder) => Promise<void>;
  onClearTableOrder: (tableNumber: number) => Promise<void>;
  onOpenTablePreview: (tableNumber: number) => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

export const OperationsView: React.FC<OperationsViewProps> = ({
  config,
  products,
  tableOrders,
  onSaveInvoice,
  onUpdateProductStock,
  onSaveTableOrder,
  onClearTableOrder,
  onOpenTablePreview,
}) => {
  const modelProducts = useMemo(
    () => products.filter((p) => p.model === config.model),
    [products, config.model]
  );

  // ==================== MODEL 1: RETAIL POS ====================
  const [posSearch, setPosSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posMessage, setPosMessage] = useState<string | null>(null);
  const [posCheckoutOpen, setPosCheckoutOpen] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // ==================== MODEL 2: F&B DISPATCH & QR ====================
  const [fnbSubTab, setFnbSubTab] = useState<'dispatch' | 'qr'>('dispatch');
  const [selectedTableNum, setSelectedTableNum] = useState<number>(
    tableOrders[0]?.tableNumber || 1
  );
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastPollTime, setLastPollTime] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);
  const [confirmCollectTable, setConfirmCollectTable] = useState<TableOrder | null>(null);
  const [tableQrPreviewOpen, setTableQrPreviewOpen] = useState(false);
  const [tableQRs, setTableQRs] = useState<Array<{ table: number; url: string; qr: string }>>([]);

  const prevOrdersSnapshotRef = useRef<Record<number, string>>({});

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Barcode camera loop
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let rafId = 0;

    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }
    ).BarcodeDetector;

    const detector = DetectorCtor
      ? new DetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
        })
      : null;

    const tick = async () => {
      if (cancelled) return;
      if (detector && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0 && results[0].rawValue) {
            const code = results[0].rawValue.trim();
            const now = Date.now();
            if (code !== lastScanRef.current.code || now - lastScanRef.current.time > 1800) {
              lastScanRef.current = { code, time: now };
              handleBarcodeMatch(code);
            }
          }
        } catch {
          // Ignore single frame detection failures
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [cameraActive, modelProducts]);

  // F&B Audio Alert Watcher + 4s GAS Short Polling
  useEffect(() => {
    if (config.model !== BusinessModel.FNB) return;

    for (const order of tableOrders) {
      const prevSig = prevOrdersSnapshotRef.current[order.tableNumber];
      const nextSig = `${order.status}-${order.lastOrderId}-${order.updatedAt}`;
      if (prevSig && prevSig !== nextSig && audioEnabled) {
        if (order.status === TableStatus.PAYMENT_REQUESTED) {
          speakVietnameseAlert(
            `Bàn số ${order.tableNumber} yêu cầu thanh toán ${Math.round(order.totalAmount)} đồng`
          );
        } else {
          const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
          speakVietnameseAlert(`Bàn số ${order.tableNumber} vừa đặt ${itemCount} món`);
        }
      }
      prevOrdersSnapshotRef.current[order.tableNumber] = nextSig;
    }
  }, [tableOrders, audioEnabled, config.model]);

  useEffect(() => {
    if (config.model !== BusinessModel.FNB || !config.infra.gasEndpointUrl) return;
    let active = true;
    const gasUrl = config.infra.gasEndpointUrl;

    const doPoll = async () => {
      if (!active) return;
      setIsPolling(true);
      const data = await pollOrdersFromGas(gasUrl, lastPollTime);
      setIsPolling(false);
      if (data && !data.unchanged && data.orders) {
        if (data.updatedAt) setLastPollTime(data.updatedAt);
        for (const remote of data.orders) {
          await onSaveTableOrder(remote);
        }
      }
    };

    const timer = setInterval(doPoll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [config.model, config.infra.gasEndpointUrl, lastPollTime]);

  // Generate QR codes for tables 1..N when in QR sub-tab
  useEffect(() => {
    if (config.model !== BusinessModel.FNB || fnbSubTab !== 'qr') return;
    const baseUrl =
      config.infra.githubPagesUrl ||
      `${window.location.origin}${window.location.pathname}`;

    let cancelled = false;
    (async () => {
      const list: Array<{ table: number; url: string; qr: string }> = [];
      for (let i = 1; i <= config.tableCount; i++) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${separator}ban=${i}`;
        const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });
        list.push({ table: i, url, qr });
      }
      if (!cancelled) setTableQRs(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.model, config.tableCount, config.infra.githubPagesUrl, fnbSubTab]);

  // POS Helpers
  const startBarcodeCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError('Không mở được camera. Vui lòng cấp quyền camera hoặc nhập mã SKU trực tiếp.');
    }
  };

  const stopBarcodeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const addProductToPos = (product: ProductItem) => {
    setPosCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          costPrice: product.costPrice,
          unit: product.unit,
          qty: 1,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const handleBarcodeMatch = (rawCode: string) => {
    const clean = rawCode.trim().toLowerCase();
    const matched = modelProducts.find((p) => p.sku.toLowerCase() === clean);
    if (matched) {
      playBarcodeBeep();
      addProductToPos(matched);
      setPosMessage(`Đã thêm: ${matched.name} (${matched.sku})`);
      setBarcodeInput('');
      setTimeout(() => setPosMessage(null), 2500);
    } else {
      setPosMessage(`Không tìm thấy sản phẩm có mã "${rawCode}"`);
      setTimeout(() => setPosMessage(null), 2500);
    }
  };

  const updatePosQty = (productId: string, delta: number) => {
    setPosCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const posTotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
  const posCost = posCart.reduce((s, i) => s + i.costPrice * i.qty, 0);

  const handleCompletePosPayment = async (method: PaymentMethod) => {
    const invoice: InvoiceRecord = {
      id: generateOrderId('POS'),
      createdAt: new Date().toISOString(),
      model: BusinessModel.RETAIL,
      customerOrTable: 'Khách tại quầy',
      items: posCart,
      totalAmount: posTotal,
      totalCost: posCost,
      profit: posTotal - posCost,
      paymentMethod: method,
      syncedToSheets: false,
    };

    // Save immediately to IndexedDB (offline-first)
    await onSaveInvoice(invoice);
    await onUpdateProductStock(posCart);
    setPosCheckoutOpen(false);
    setPosCart([]);
    setPosMessage(`Thanh toán thành công ${invoice.id} · ${formatVND(invoice.totalAmount)}`);

    // Background sync to Google Sheets
    const gToken = getGoogleAccessToken();
    if (gToken && config.infra.spreadsheetId) {
      try {
        await appendInvoiceToSheet(gToken, config.infra.spreadsheetId, invoice);
        await onSaveInvoice({ ...invoice, syncedToSheets: true });
      } catch {
        // Remains flagged syncedToSheets: false for later sync
      }
    }
  };

  const filteredPosProducts = useMemo(() => {
    return modelProducts.filter(
      (p) =>
        matchesVietnameseSearch(p.name, posSearch) ||
        matchesVietnameseSearch(p.sku, posSearch)
    );
  }, [modelProducts, posSearch]);

  // F&B Confirm Payment handler
  const handleConfirmTablePayment = async (order: TableOrder, method: PaymentMethod) => {
    const totalCost = order.items.reduce((s, i) => s + i.costPrice * i.qty, 0);
    const invoice: InvoiceRecord = {
      id: generateOrderId(`B${order.tableNumber}`),
      createdAt: new Date().toISOString(),
      model: BusinessModel.FNB,
      customerOrTable: `Bàn ${order.tableNumber}`,
      items: order.items,
      totalAmount: order.totalAmount,
      totalCost,
      profit: order.totalAmount - totalCost,
      paymentMethod: method,
      syncedToSheets: false,
    };

    await onSaveInvoice(invoice);
    await onClearTableOrder(order.tableNumber);
    setConfirmCollectTable(null);
    setTableQrPreviewOpen(false);

    if (config.infra.gasEndpointUrl) {
      try {
        await postOrderToGas(config.infra.gasEndpointUrl, 'recordInvoice', {
          invoice,
          clearTableNumber: order.tableNumber,
        });
      } catch {
        // Handled via Sheets API below
      }
    }

    const gToken = getGoogleAccessToken();
    if (gToken && config.infra.spreadsheetId) {
      try {
        await appendInvoiceToSheet(gToken, config.infra.spreadsheetId, invoice);
        await onSaveInvoice({ ...invoice, syncedToSheets: true });
      } catch {
        // Queued in IndexedDB
      }
    }
  };

  // ============================================================
  // RENDER MODEL 1: RETAIL POS
  // ============================================================
  if (config.model === BusinessModel.RETAIL) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
              POS Tính tiền nhanh &amp; Quét mã vạch
            </h1>
            <p className="text-sm text-slate-600">
              Quét mã vạch sản phẩm bằng camera hoặc tìm nhanh; lưu hóa đơn ngoại tuyến vào IndexedDB và đồng bộ Google Sheets.
            </p>
          </div>
          {posMessage && (
            <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
              {posMessage}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Barcode Camera + Quick Product Search */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-900">
                  Máy quét mã vạch Camera &amp; Nhập mã SKU
                </span>
                <button
                  type="button"
                  onClick={cameraActive ? stopBarcodeCamera : startBarcodeCamera}
                  className={`px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer ${
                    cameraActive
                      ? 'bg-red-700 hover:bg-red-800 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {cameraActive ? (
                    <>
                      <CameraOff className="w-3.5 h-3.5" />
                      <span>Tắt camera quét</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      <span>Mở camera quét mã vạch</span>
                    </>
                  )}
                </button>
              </div>

              {cameraActive && (
                <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-28 border-2 border-emerald-400/80 rounded-lg" />
                  </div>
                </div>
              )}
              {cameraError && <p className="text-xs text-red-700">{cameraError}</p>}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (barcodeInput.trim()) handleBarcodeMatch(barcodeInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Nhập hoặc quét mã vạch (VD: 8934588012015) rồi nhấn Enter..."
                  className="flex-1 px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl whitespace-nowrap"
                >
                  Quét mã
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={posSearch}
                  onChange={(e) => setPosSearch(e.target.value)}
                  placeholder="Tìm nhanh sản phẩm theo tên hoặc mã..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredPosProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.status === ProductStatus.OUT_OF_STOCK}
                    onClick={() => {
                      playBarcodeBeep();
                      addProductToPos(item);
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-[#0F766E] hover:bg-teal-50/30 text-left transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      <ProductImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{item.sku}</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-[#0F766E] mt-0.5">
                        {formatVND(item.price)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: POS Cart & Checkout */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-5 sticky top-20">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Hóa đơn hiện tại</h2>
              {posCart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPosCart([])}
                  className="text-xs font-medium text-red-700 hover:underline inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa giỏ</span>
                </button>
              )}
            </div>

            {posCart.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Chưa có sản phẩm nào trong giỏ. Quét mã vạch hoặc chạm sản phẩm bên trái để thêm.
              </div>
            ) : (
              <div className="space-y-3 max-h-[45vh] overflow-y-auto divide-y divide-slate-100">
                {posCart.map((item) => (
                  <div key={item.productId} className="pt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {formatVND(item.price)} / {item.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updatePosQty(item.productId, -1)}
                        className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-mono tabular-nums font-bold">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updatePosQty(item.productId, 1)}
                        className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="w-24 text-right text-sm font-mono tabular-nums font-bold text-slate-900">
                      {formatVND(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Số lượng món</span>
                <span className="font-mono tabular-nums font-semibold">
                  {posCart.reduce((s, i) => s + i.qty, 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Lãi gộp ước tính</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {formatVND(posTotal - posCost)}
                </span>
              </div>
              <div className="flex justify-between text-xl font-bold text-slate-900 pt-2">
                <span>Tổng thu</span>
                <span className="font-mono tabular-nums text-[#0F766E]">
                  {formatVND(posTotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={posCart.length === 0}
              onClick={() => setPosCheckoutOpen(true)}
              className="w-full py-3.5 min-h-[48px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Thanh toán &amp; Tạo VietQR
            </button>
          </div>
        </div>

        <VietQRModal
          open={posCheckoutOpen}
          title="Thanh toán hóa đơn POS"
          amount={posTotal}
          description={`POS ${config.shopName.slice(0, 14)}`}
          bank={config.bank}
          allowCashOption
          confirmLabel="Xác nhận đã thu tiền"
          onConfirmPayment={handleCompletePosPayment}
          onClose={() => setPosCheckoutOpen(false)}
        />
      </div>
    );
  }

  // ============================================================
  // RENDER MODEL 2: F&B KITCHEN / CASHIER DISPATCH & TABLE QR
  // ============================================================
  const selectedOrder = tableOrders.find((t) => t.tableNumber === selectedTableNum);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">
            Điều phối Bếp / Thu ngân &amp; Mã QR Bàn
          </h1>
          <p className="text-sm text-slate-600">
            Kiểm tra đơn mới tự động mỗi 4 giây · Thông báo giọng nói tiếng Việt khi có đơn mới hoặc yêu cầu tính tiền.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            className={`px-3.5 py-2 min-h-[40px] rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              audioEnabled
                ? 'bg-white border-[#0F766E] text-[#0F766E]'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{audioEnabled ? 'Đang bật đọc đơn' : 'Đang tắt âm thanh'}</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFnbSubTab('dispatch')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                fnbSubTab === 'dispatch'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600'
              }`}
            >
              Sơ đồ bàn ({config.tableCount})
            </button>
            <button
              type="button"
              onClick={() => setFnbSubTab('qr')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                fnbSubTab === 'qr'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600'
              }`}
            >
              In mã QR bàn
            </button>
          </div>
        </div>
      </div>

      {fnbSubTab === 'dispatch' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Table Map */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Chạm vào thẻ bàn để xem chi tiết món và thu tiền</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin text-[#0F766E]' : ''}`} />
                {config.infra.gasEndpointUrl ? 'Đang đồng bộ GAS (4s)' : 'Đồng bộ tức thời nội bộ'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: config.tableCount }, (_, idx) => idx + 1).map((num) => {
                const order = tableOrders.find((t) => t.tableNumber === num);
                const isSelected = selectedTableNum === num;
                const isPayReq = order?.status === TableStatus.PAYMENT_REQUESTED;
                const isOccupied = order?.status === TableStatus.OCCUPIED;

                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setSelectedTableNum(num);
                      if (order?.unreadAlert) {
                        onSaveTableOrder({ ...order, unreadAlert: false });
                      }
                    }}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      isPayReq
                        ? 'bg-amber-50 border-amber-400'
                        : isOccupied
                          ? 'bg-teal-50/60 border-[#0F766E]'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                    } ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-slate-900">Bàn {num}</span>
                      {order && (
                        <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600">
                          {order.items.reduce((s, i) => s + i.qty, 0)} món
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-2 text-xs font-semibold ${
                        isPayReq
                          ? 'text-amber-800'
                          : isOccupied
                            ? 'text-[#0F766E]'
                            : 'text-slate-400'
                      }`}
                    >
                      {isPayReq
                        ? 'Yêu cầu tính tiền'
                        : isOccupied
                          ? 'Đang phục vụ'
                          : 'Bàn trống'}
                    </p>
                    <p className="mt-1 text-sm font-mono tabular-nums font-bold text-slate-900">
                      {order ? formatVND(order.totalAmount) : '0đ'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Table Detail */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Chi tiết Bàn {selectedTableNum}</h2>
                {selectedOrder && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cập nhật: {formatTimeVN(selectedOrder.updatedAt)} · Mã {selectedOrder.lastOrderId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenTablePreview(selectedTableNum)}
                className="px-3 py-1.5 text-xs font-semibold text-[#0F766E] border border-[#0F766E]/30 rounded-lg hover:bg-teal-50 cursor-pointer"
              >
                Mở màn hình khách Bàn {selectedTableNum}
              </button>
            </div>

            {!selectedOrder || selectedOrder.items.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Bàn {selectedTableNum} hiện đang trống.
              </div>
            ) : (
              <>
                <div className="space-y-3 divide-y divide-slate-100 max-h-[42vh] overflow-y-auto">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} className="pt-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.qty} × {item.name}
                        </p>
                        {item.note && (
                          <p className="text-xs text-amber-800 mt-0.5">Ghi chú: {item.note}</p>
                        )}
                      </div>
                      <span className="text-sm font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        {formatVND(item.price * item.qty)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-lg font-bold">
                  <span>Tổng cộng</span>
                  <span className="font-mono tabular-nums text-[#0F766E]">
                    {formatVND(selectedOrder.totalAmount)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTableQrPreviewOpen(true)}
                    className="px-4 py-3 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-[#0F766E]" />
                    <span>Hiện VietQR thu tiền</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCollectTable(selectedOrder)}
                    className="px-4 py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Xác nhận đã thu tiền</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Printable Table QR Grid */
        <div className="space-y-4">
          <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Danh sách {config.tableCount} mã QR dán tại bàn
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Khách quét mã sẽ tự động mở đúng thực đơn với tham số ?ban=X.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In tất cả mã QR bàn</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tableQRs.map((entry) => (
              <div
                key={entry.table}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center"
              >
                <p className="text-xs font-medium text-slate-500">{config.shopName}</p>
                <p className="text-lg font-display font-bold text-slate-900 mt-0.5">
                  BÀN SỐ {entry.table}
                </p>
                <img
                  src={entry.qr}
                  alt={`QR gọi món Bàn ${entry.table}`}
                  className="w-40 h-40 my-3 object-contain"
                />
                <p className="text-[11px] text-slate-500 break-all line-clamp-1">
                  ?ban={entry.table}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenTablePreview(entry.table)}
                  className="no-print mt-3 w-full py-2 text-xs font-semibold text-[#0F766E] border border-[#0F766E]/30 rounded-lg hover:bg-teal-50 cursor-pointer"
                >
                  Thử gọi món Bàn {entry.table}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VietQR Modal for Table Payment */}
      {selectedOrder && (
        <VietQRModal
          open={tableQrPreviewOpen}
          title={`Thu tiền Bàn ${selectedOrder.tableNumber}`}
          amount={selectedOrder.totalAmount}
          description={`BAN ${selectedOrder.tableNumber} ${config.shopName.slice(0, 10)}`}
          bank={config.bank}
          allowCashOption
          confirmLabel="Chốt đơn & Giải phóng bàn"
          onConfirmPayment={(method) => handleConfirmTablePayment(selectedOrder, method)}
          onClose={() => setTableQrPreviewOpen(false)}
        />
      )}

      {/* Mandatory Confirmation Dialog before recording revenue & clearing table */}
      <ConfirmDialog
        open={Boolean(confirmCollectTable)}
        title={`Xác nhận đã thu tiền Bàn ${confirmCollectTable?.tableNumber || ''}`}
        description="Thao tác này sẽ giải phóng trạng thái bàn về trống và lưu vĩnh viễn hóa đơn vào lịch sử doanh thu (IndexedDB & Google Sheets)."
        affectedItems={
          confirmCollectTable
            ? [
                `Số tiền thu: ${formatVND(confirmCollectTable.totalAmount)}`,
                `Số lượng món: ${confirmCollectTable.items.reduce((s, i) => s + i.qty, 0)} món`,
                'Đồng bộ lên tab DoanhThu và ChiTietDonHang trên Google Sheets (nếu đã kết nối)',
              ]
            : []
        }
        confirmLabel="Xác nhận thu tiền"
        onConfirm={() => {
          if (confirmCollectTable) {
            handleConfirmTablePayment(confirmCollectTable, PaymentMethod.CASH);
          }
        }}
        onCancel={() => setConfirmCollectTable(null)}
      />
    </div>
  );
};

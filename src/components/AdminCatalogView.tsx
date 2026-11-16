import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BusinessModel,
  InvoiceRecord,
  ProcessedImageResult,
  ProductItem,
  ProductStatus,
  ShopConfig,
} from '../types';
import { formatTimeVN, formatVND } from '../utils/vietnamese';
import { processProductImageToWebP } from '../utils/imageProcessor';
import {
  appendInvoiceToSheet,
  getGoogleAccessToken,
  syncCatalogToSheet,
} from '../services/googleWorkspace';
import { GitHubUser, publishProductToGitHub } from '../services/githubSync';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductImage } from './ProductImage';

interface AdminCatalogViewProps {
  config: ShopConfig;
  products: ProductItem[];
  invoices: InvoiceRecord[];
  githubToken: string;
  githubUser: GitHubUser | null;
  onSaveProduct: (product: ProductItem) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onMarkInvoiceSynced: (invoice: InvoiceRecord) => Promise<void>;
}

export const AdminCatalogView: React.FC<AdminCatalogViewProps> = ({
  config,
  products,
  invoices,
  githubToken,
  githubUser,
  onSaveProduct,
  onDeleteProduct,
  onMarkInvoiceSynced,
}) => {
  const [subTab, setSubTab] = useState<'catalog' | 'revenue'>('catalog');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [category, setCategory] = useState('Đồ uống');
  const [unit, setUnit] = useState('Phần');
  const [stock, setStock] = useState('50');
  const [status, setStatus] = useState<ProductStatus>(ProductStatus.IN_STOCK);
  const [description, setDescription] = useState('');
  const [model, setModel] = useState<BusinessModel>(config.model);

  const [processedImg, setProcessedImg] = useState<ProcessedImageResult | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [processingImg, setProcessingImg] = useState(false);

  const [scanningSku, setScanningSku] = useState(false);
  const skuVideoRef = useRef<HTMLVideoElement | null>(null);
  const skuStreamRef = useRef<MediaStream | null>(null);

  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ProductItem | null>(null);
  const [confirmSyncSheetsOpen, setConfirmSyncSheetsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSku('');
    setPrice('');
    setCostPrice('');
    setCategory(config.model === BusinessModel.RETAIL ? 'Đồ uống đóng chai' : 'Món chính');
    setUnit(config.model === BusinessModel.RETAIL ? 'Chai' : 'Phần');
    setStock('50');
    setStatus(ProductStatus.IN_STOCK);
    setDescription('');
    setModel(config.model);
    setProcessedImg(null);
    setExistingImageUrl('');
  };

  const handleEditProduct = (item: ProductItem) => {
    setEditingId(item.id);
    setName(item.name);
    setSku(item.sku);
    setPrice(String(item.price));
    setCostPrice(String(item.costPrice));
    setCategory(item.category);
    setUnit(item.unit);
    setStock(String(item.stock));
    setStatus(item.status);
    setDescription(item.description);
    setModel(item.model);
    setExistingImageUrl(item.imageUrl);
    setProcessedImg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingImg(true);
    try {
      const res = await processProductImageToWebP(file, 800, 48);
      setProcessedImg(res);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Lỗi nén ảnh WebP.');
    } finally {
      setProcessingImg(false);
    }
  };

  const toggleSkuCamera = async () => {
    if (scanningSku) {
      skuStreamRef.current?.getTracks().forEach((t) => t.stop());
      skuStreamRef.current = null;
      setScanningSku(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      skuStreamRef.current = stream;
      setScanningSku(true);
      setTimeout(() => {
        if (skuVideoRef.current) {
          skuVideoRef.current.srcObject = stream;
          skuVideoRef.current.play().catch(() => {});
          const DetectorCtor = (
            window as unknown as {
              BarcodeDetector?: new (opts: { formats: string[] }) => {
                detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
              };
            }
          ).BarcodeDetector;

          if (DetectorCtor) {
            const detector = new DetectorCtor({
              formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
            });
            const loop = async () => {
              if (!skuStreamRef.current || !skuVideoRef.current) return;
              try {
                const res = await detector.detect(skuVideoRef.current);
                if (res.length > 0 && res[0].rawValue) {
                  setSku(res[0].rawValue.trim());
                  skuStreamRef.current?.getTracks().forEach((t) => t.stop());
                  skuStreamRef.current = null;
                  setScanningSku(false);
                  return;
                }
              } catch {
                // Continue scanning
              }
              requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
          }
        }
      }, 60);
    } catch {
      setStatusNotice('Không thể truy cập camera để quét mã vạch.');
    }
  };

  const buildProductObject = (): ProductItem => {
    const cleanSku = sku.trim() || `SP-${Date.now().toString().slice(-6)}`;
    return {
      id: editingId || `sp-${Date.now()}`,
      sku: cleanSku,
      name: name.trim(),
      price: Number(price) || 0,
      costPrice: Number(costPrice) || 0,
      category: category.trim() || 'Chung',
      unit: unit.trim() || 'Phần',
      stock: Number(stock) || 0,
      status,
      imageUrl: processedImg?.dataUrl || existingImageUrl || '/src/assets/images/retail_ca_phe_sua_1794842004343.jpg',
      imageWebpBase64: processedImg?.base64,
      description: description.trim(),
      model,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleSaveAndPublish = async () => {
    setConfirmPublishOpen(false);
    setPublishing(true);
    setStatusNotice(null);
    try {
      const nextProduct = buildProductObject();
      await onSaveProduct(nextProduct);

      const nextList = editingId
        ? products.map((p) => (p.id === nextProduct.id ? nextProduct : p))
        : [...products, nextProduct];

      const messages: string[] = ['Đã lưu sản phẩm vào IndexedDB'];

      if (
        githubToken &&
        githubUser &&
        config.infra.githubOwner &&
        config.infra.githubRepo
      ) {
        await publishProductToGitHub(
          githubToken,
          config.infra.githubOwner,
          config.infra.githubRepo,
          nextProduct,
          nextList.filter((p) => p.model === nextProduct.model)
        );
        messages.push('đã đẩy ảnh WebP & products.json lên GitHub');
      }

      const gToken = getGoogleAccessToken();
      if (gToken && config.infra.spreadsheetId) {
        await syncCatalogToSheet(gToken, config.infra.spreadsheetId, nextList);
        messages.push('đã cập nhật Google Sheets DanhMucHangHoa');
      }

      setStatusNotice(messages.join(' · ') + '.');
      resetForm();
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Lỗi khi xuất bản sản phẩm.');
    } finally {
      setPublishing(false);
    }
  };

  const handleSyncPendingInvoices = async () => {
    setConfirmSyncSheetsOpen(false);
    const gToken = getGoogleAccessToken();
    if (!gToken || !config.infra.spreadsheetId) {
      setStatusNotice('Vui lòng đăng nhập Google và khởi tạo Google Sheet trước khi đồng bộ.');
      return;
    }

    const pending = invoices.filter((inv) => !inv.syncedToSheets);
    let syncedCount = 0;
    for (const inv of pending) {
      try {
        await appendInvoiceToSheet(gToken, config.infra.spreadsheetId, inv);
        await onMarkInvoiceSynced({ ...inv, syncedToSheets: true });
        syncedCount++;
      } catch {
        // Keep unsynced
      }
    }
    setStatusNotice(`Đã đồng bộ ${syncedCount}/${pending.length} hóa đơn lên Google Sheets.`);
  };

  const handleExportCSV = () => {
    const headers = ['MaHD', 'ThoiGian', 'MoHinh', 'BanHoacKhach', 'TongTien', 'GiaVon', 'LoiNhuan', 'ThanhToan'];
    const rows = invoices.map((inv) => [
      inv.id,
      inv.createdAt,
      inv.model,
      inv.customerOrTable,
      inv.totalAmount,
      inv.totalCost,
      inv.profit,
      inv.paymentMethod,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HKDVN_DoanhThu_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalRevenue = useMemo(
    () => invoices.reduce((s, inv) => s + inv.totalAmount, 0),
    [invoices]
  );
  const totalProfit = useMemo(
    () => invoices.reduce((s, inv) => s + inv.profit, 0),
    [invoices]
  );
  const unsyncedCount = useMemo(
    () => invoices.filter((inv) => !inv.syncedToSheets).length,
    [invoices]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">
            Quản trị Sản phẩm &amp; Báo cáo Doanh thu
          </h1>
          <p className="text-sm text-slate-600">
            Chụp ảnh nén WebP 800×800 (~30–50KB), quét mã vạch SKU và đẩy thẳng lên GitHub / Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSubTab('catalog')}
            className={`px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              subTab === 'catalog'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600'
            }`}
          >
            Danh mục sản phẩm ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('revenue')}
            className={`px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              subTab === 'revenue'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600'
            }`}
          >
            Doanh thu &amp; Hóa đơn ({invoices.length})
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm font-medium text-[#0F766E] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {subTab === 'catalog' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form: Mobile Camera Input + Product Editor */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirmPublishOpen(true);
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Chỉnh sửa sản phẩm / món' : 'Thêm sản phẩm / món mới'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Hủy sửa
                </button>
              )}
            </div>

            {/* Camera Image Capture + WebP Compression Preview */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Ảnh sản phẩm (tự cắt vuông 800px · WebP)
                </span>
                <label className="px-3 py-2 min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{processingImg ? 'Đang nén...' : 'Chụp / Chọn ảnh'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageInput}
                    className="hidden"
                  />
                </label>
              </div>

              {(processedImg || existingImageUrl) && (
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0">
                    <ProductImage
                      src={processedImg?.dataUrl || existingImageUrl}
                      alt="Xem trước ảnh WebP"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {processedImg ? (
                    <div className="text-xs text-slate-600 space-y-0.5 font-mono tabular-nums">
                      <p className="font-sans font-semibold text-emerald-700">Đã nén WebP tối ưu</p>
                      <p>Kích thước: {processedImg.width}×{processedImg.height}px</p>
                      <p>
                        Dung lượng: {processedImg.originalKB}KB →{' '}
                        <strong className="text-slate-900">{processedImg.compressedKB}KB</strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Đang dùng ảnh hiện có</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tên sản phẩm / món ăn
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Trà sữa Oolong nướng"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mã vạch / SKU
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Quét mã hoặc nhập SKU"
                    className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                  />
                  <button
                    type="button"
                    onClick={toggleSkuCamera}
                    className="px-3 py-2 min-h-[38px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>{scanningSku ? 'Dừng quét' : 'Quét mã'}</span>
                  </button>
                </div>
                {scanningSku && (
                  <video
                    ref={skuVideoRef}
                    muted
                    playsInline
                    className="mt-2 w-full h-36 object-cover rounded-lg bg-slate-950"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Giá bán (VNĐ)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={500}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Giá vốn (tùy chọn)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Danh mục</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Đơn vị tính</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Ly, Tô, Chai..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tồn kho</label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Trạng thái</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProductStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value={ProductStatus.IN_STOCK}>Còn hàng</option>
                  <option value={ProductStatus.OUT_OF_STOCK}>Hết hàng</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Mô hình áp dụng</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as BusinessModel)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value={BusinessModel.RETAIL}>Mô hình 1: Bán lẻ / Mang đi</option>
                  <option value={BusinessModel.FNB}>Mô hình 2: F&amp;B / Ăn uống tại chỗ</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Mô tả ngắn</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={publishing}
              className="w-full py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{publishing ? 'Đang xuất bản...' : 'Lưu & Xuất bản'}</span>
            </button>
          </form>

          {/* Product List */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Danh sách hàng hóa &amp; thực đơn</h2>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {products.length} mặt hàng
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {products.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      <ProductImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.model === BusinessModel.RETAIL ? 'Bán lẻ' : 'F&B'} · {item.category} · SKU {item.sku}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className="font-mono tabular-nums font-bold text-[#0F766E]">
                          {formatVND(item.price)}/{item.unit}
                        </span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          Kho: {item.stock}
                        </span>
                        <span
                          className={
                            item.status === ProductStatus.IN_STOCK
                              ? 'text-emerald-700 font-medium'
                              : 'text-red-700 font-medium'
                          }
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditProduct(item)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                      aria-label={`Sửa ${item.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteItem(item)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 text-red-700 hover:bg-red-50 cursor-pointer"
                      aria-label={`Xóa ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Revenue & Invoices Tab */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs text-slate-500">Tổng doanh thu ghi nhận</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatVND(totalRevenue)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs text-slate-500">Lợi nhuận gộp</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0F766E]">
                {formatVND(totalProfit)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Chờ đồng bộ Google Sheets</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {unsyncedCount} hóa đơn
                </p>
              </div>
              <button
                type="button"
                disabled={unsyncedCount === 0}
                onClick={() => setConfirmSyncSheetsOpen(true)}
                className="px-3.5 py-2 min-h-[40px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Đồng bộ Sheets</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                Sổ Hóa đơn &amp; Doanh thu (IndexedDB + Google Sheets)
              </h2>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 min-h-[38px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất CSV (Excel)</span>
              </button>
            </div>

            {invoices.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Chưa có hóa đơn nào được ghi nhận.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                      <th className="py-3 px-4 font-semibold">Mã HĐ</th>
                      <th className="py-3 px-4 font-semibold">Thời gian</th>
                      <th className="py-3 px-4 font-semibold">Bàn / Khách</th>
                      <th className="py-3 px-4 font-semibold">Hình thức</th>
                      <th className="py-3 px-4 font-semibold text-right">Tổng tiền</th>
                      <th className="py-3 px-4 font-semibold text-right">Lợi nhuận</th>
                      <th className="py-3 px-4 font-semibold">Google Sheets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                          {inv.id}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                          {formatTimeVN(inv.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-800">{inv.customerOrTable}</td>
                        <td className="py-3 px-4 text-slate-600">{inv.paymentMethod}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatVND(inv.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatVND(inv.profit)}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          {inv.syncedToSheets ? (
                            <span className="text-emerald-700">Đã đồng bộ</span>
                          ) : (
                            <span className="text-amber-700">Chờ đồng bộ</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmPublishOpen}
        title="Lưu và xuất bản sản phẩm?"
        description="Sản phẩm sẽ được lưu vào cơ sở dữ liệu cục bộ, đồng thời đẩy ảnh WebP và tệp products.json lên GitHub / Google Sheets nếu bạn đã kết nối."
        affectedItems={[
          `Sản phẩm: ${name || '(Chưa đặt tên)'} — ${formatVND(Number(price) || 0)}`,
          ...(processedImg ? [`Tải ảnh WebP (${processedImg.compressedKB}KB) lên /assets/img/`] : []),
          ...(githubUser && config.infra.githubRepo
            ? [`Cập nhật products.json trên ${githubUser.login}/${config.infra.githubRepo}`]
            : []),
        ]}
        confirmLabel="Lưu & Xuất bản"
        onConfirm={handleSaveAndPublish}
        onCancel={() => setConfirmPublishOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteItem)}
        title={`Xóa sản phẩm "${confirmDeleteItem?.name}"?`}
        description="Sản phẩm sẽ bị xóa khỏi danh mục cửa hàng hiện tại. Hành động này không thể hoàn tác."
        isDanger
        confirmLabel="Xóa sản phẩm"
        onConfirm={async () => {
          if (confirmDeleteItem) {
            await onDeleteProduct(confirmDeleteItem.id);
            setConfirmDeleteItem(null);
          }
        }}
        onCancel={() => setConfirmDeleteItem(null)}
      />

      <ConfirmDialog
        open={confirmSyncSheetsOpen}
        title="Đồng bộ hóa đơn lên Google Sheets?"
        description={`Hệ thống sẽ ghi ${unsyncedCount} hóa đơn đang chờ từ IndexedDB vào tab DoanhThu và ChiTietDonHang trên Google Sheet của bạn.`}
        confirmLabel="Bắt đầu đồng bộ"
        onConfirm={handleSyncPendingInvoices}
        onCancel={() => setConfirmSyncSheetsOpen(false)}
      />
    </div>
  );
};

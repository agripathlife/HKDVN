import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import {
  BusinessModel,
  CartItem,
  InvoiceRecord,
  ProductItem,
  ProductStatus,
  RetailPickupOrder,
  ShopConfig,
  TableOrder,
  TableStatus,
} from '../types';
import {
  formatVND,
  generateOrderId,
  matchesVietnameseSearch,
} from '../utils/vietnamese';
import {
  postOrderToGas,
} from '../services/googleWorkspace';
import { ProductImage } from './ProductImage';
import { VietQRModal } from './VietQRModal';

interface StorefrontViewProps {
  config: ShopConfig;
  products: ProductItem[];
  tableOrders: TableOrder[];
  initialTableNumber: number | null;
  onSaveTableOrder: (order: TableOrder) => Promise<void>;
  onSaveRetailOrder: (order: RetailPickupOrder) => Promise<void>;
  onSaveInvoice: (invoice: InvoiceRecord) => Promise<void>;
  onUpdateProductStock: (items: CartItem[]) => Promise<void>;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  config,
  products,
  tableOrders,
  initialTableNumber,
  onSaveTableOrder,
  onSaveRetailOrder,
}) => {
  const modelProducts = useMemo(
    () => products.filter((p) => p.model === config.model),
    [products, config.model]
  );

  const categories = useMemo(() => {
    const set = new Set<string>(modelProducts.map((p) => p.category));
    return ['Tất cả', ...Array.from(set)];
  }, [modelProducts]);

  // Shared search/filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');

  // Model 1 (Retail) states — Pickup order, pay at store
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [retailBag, setRetailBag] = useState<CartItem[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupTime, setPickupTime] = useState('Sau 30 phút');
  const [pickupNote, setPickupNote] = useState('');
  const [submittingRetail, setSubmittingRetail] = useState(false);
  const [retailOrderSuccess, setRetailOrderSuccess] = useState<string | null>(null);

  // Model 2 (F&B) states
  const [activeTable, setActiveTable] = useState<number>(initialTableNumber || 1);
  const [fnbViewMode, setFnbViewMode] = useState<'card' | 'grid'>('card');
  const [cardIndex, setCardIndex] = useState(0);
  const [pendingCart, setPendingCart] = useState<Record<string, { qty: number; note: string }>>({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedFnbDish, setSelectedFnbDish] = useState<ProductItem | null>(null);
  const [fnbPendingOpen, setFnbPendingOpen] = useState(false);

  useEffect(() => {
    if (initialTableNumber && initialTableNumber >= 1) {
      setActiveTable(initialTableNumber);
    }
  }, [initialTableNumber]);

  const filteredProducts = useMemo(() => {
    return modelProducts.filter((p) => {
      const catMatch = activeCategory === 'Tất cả' || p.category === activeCategory;
      const textMatch =
        matchesVietnameseSearch(p.name, searchQuery) ||
        matchesVietnameseSearch(p.category, searchQuery) ||
        matchesVietnameseSearch(p.sku, searchQuery);
      return catMatch && textMatch;
    });
  }, [modelProducts, activeCategory, searchQuery]);

  useEffect(() => {
    if (cardIndex >= filteredProducts.length) {
      setCardIndex(0);
    }
  }, [filteredProducts.length, cardIndex]);

  const currentTableOrder = useMemo(
    () => tableOrders.find((t) => t.tableNumber === activeTable),
    [tableOrders, activeTable]
  );

  // Model 1 handlers
  const addToRetailBag = (product: ProductItem, qty = 1) => {
    if (product.status === ProductStatus.OUT_OF_STOCK) return;
    setRetailBag((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + qty } : i
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
          qty,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const updateRetailQty = (productId: string, delta: number) => {
    setRetailBag((prev) =>
      prev
        .map((item) =>
          item.productId === productId ? { ...item, qty: item.qty + delta } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const removeFromRetailBag = (productId: string) => {
    setRetailBag((prev) => prev.filter((item) => item.productId !== productId));
  };

  const retailTotal = retailBag.reduce((sum, i) => sum + i.price * i.qty, 0);

  const handleSubmitRetailPickupOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retailBag.length === 0) return;
    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    const cleanTime = pickupTime.trim() || 'Đến lấy sớm nhất';
    if (!cleanName || !cleanPhone) return;

    setSubmittingRetail(true);
    try {
      const orderId = generateOrderId('DH');
      const now = new Date().toISOString();
      const order: RetailPickupOrder = {
        orderId,
        customerName: cleanName,
        customerPhone: cleanPhone,
        pickupTime: cleanTime,
        note: pickupNote.trim() || undefined,
        items: retailBag,
        totalAmount: retailTotal,
        status: 'retail_pending',
        createdAt: now,
        updatedAt: now,
        unreadAlert: true,
      };

      await onSaveRetailOrder(order);

      if (config.infra.gasEndpointUrl) {
        try {
          await postOrderToGas(config.infra.gasEndpointUrl, 'placeRetailOrder', {
            orderId: order.orderId,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            pickupTime: order.pickupTime,
            note: order.note || '',
            items: order.items,
            totalAmount: order.totalAmount,
          });
        } catch {
          // Local IndexedDB saved
        }
      }

      setBagOpen(false);
      setRetailBag([]);
      setPickupNote('');
      setRetailOrderSuccess(
        `Đã gửi đơn ${orderId} (${formatVND(order.totalAmount)}) — Nhận lúc ${cleanTime}. Thanh toán trực tiếp tại cửa hàng.`
      );
      setTimeout(() => setRetailOrderSuccess(null), 6000);
    } finally {
      setSubmittingRetail(false);
    }
  };

  // Model 2 (F&B) handlers
  const setDishQty = (productId: string, delta: number) => {
    setPendingCart((prev) => {
      const current = prev[productId] || { qty: 0, note: '' };
      const nextQty = Math.max(0, current.qty + delta);
      if (nextQty === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: { ...current, qty: nextQty } };
    });
  };

  const setDishNote = (productId: string, note: string) => {
    setPendingCart((prev) => {
      const current = prev[productId] || { qty: 1, note: '' };
      return { ...prev, [productId]: { ...current, note } };
    });
  };

  const removePendingDish = (productId: string) => {
    setPendingCart((prev) => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  const pendingItems: CartItem[] = useMemo(() => {
    return Object.entries(pendingCart)
      .map(([productId, entry]) => {
        const prod = modelProducts.find((p) => p.id === productId);
        if (!prod || entry.qty <= 0) return null;
        return {
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          price: prod.price,
          costPrice: prod.costPrice,
          unit: prod.unit,
          qty: entry.qty,
          note: entry.note.trim() || undefined,
          imageUrl: prod.imageUrl,
        } as CartItem;
      })
      .filter((x): x is CartItem => x !== null);
  }, [pendingCart, modelProducts]);

  const pendingCount = pendingItems.reduce((s, i) => s + i.qty, 0);
  const pendingSubtotal = pendingItems.reduce((s, i) => s + i.price * i.qty, 0);

  const handleSubmitTableOrder = async () => {
    if (pendingItems.length === 0) return;
    setSubmittingOrder(true);
    try {
      const mergedItems: CartItem[] = [...(currentTableOrder?.items || [])];
      for (const incoming of pendingItems) {
        const idx = mergedItems.findIndex(
          (i) => i.productId === incoming.productId && (i.note || '') === (incoming.note || '')
        );
        if (idx >= 0) {
          mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + incoming.qty };
        } else {
          mergedItems.push(incoming);
        }
      }

      const totalAmount = mergedItems.reduce((s, i) => s + i.price * i.qty, 0);
      const nextOrder: TableOrder = {
        tableNumber: activeTable,
        status:
          currentTableOrder?.status === TableStatus.PAYMENT_REQUESTED
            ? TableStatus.PAYMENT_REQUESTED
            : TableStatus.OCCUPIED,
        items: mergedItems,
        totalAmount,
        updatedAt: new Date().toISOString(),
        lastOrderId: generateOrderId(`B${activeTable}`),
        unreadAlert: true,
      };

      await onSaveTableOrder(nextOrder);

      if (config.infra.gasEndpointUrl) {
        try {
          await postOrderToGas(config.infra.gasEndpointUrl, 'placeOrder', {
            tableNumber: nextOrder.tableNumber,
            status: nextOrder.status,
            totalAmount: nextOrder.totalAmount,
            lastOrderId: nextOrder.lastOrderId,
            items: nextOrder.items,
          });
        } catch {
          // Local BroadcastChannel & IndexedDB already persisted
        }
      }

      setPendingCart({});
      setOrderFeedback(`Đã gửi ${pendingCount} món lên Bếp cho Bàn ${activeTable}`);
      setTimeout(() => setOrderFeedback(null), 3500);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleRequestPayment = async () => {
    if (!currentTableOrder || currentTableOrder.items.length === 0) return;
    const updated: TableOrder = {
      ...currentTableOrder,
      status: TableStatus.PAYMENT_REQUESTED,
      paymentRequestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadAlert: true,
    };
    await onSaveTableOrder(updated);

    if (config.infra.gasEndpointUrl) {
      try {
        await postOrderToGas(config.infra.gasEndpointUrl, 'requestPayment', {
          tableNumber: updated.tableNumber,
          status: updated.status,
          totalAmount: updated.totalAmount,
          lastOrderId: updated.lastOrderId,
          items: updated.items,
        });
      } catch {
        // Handled locally
      }
    }
    setBillModalOpen(true);
  };

  // ============================================================
  // RENDER MODEL 1: RETAIL & TAKE-AWAY CATALOG
  // ============================================================
  if (config.model === BusinessModel.RETAIL) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Storefront Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#0F766E]">
              Cửa hàng Bán lẻ &amp; Mang đi
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mt-1">
              {config.shopName}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {config.address} · SĐT / Zalo: {config.phone}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`tel:${config.phone}`}
              className="px-4 py-2.5 min-h-[42px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-lg inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Phone className="w-4 h-4 text-[#0F766E]" />
              <span>Gọi đặt hàng</span>
            </a>
            <button
              type="button"
              onClick={() => setBagOpen(true)}
              className="px-4 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="tabular-nums">Giỏ hàng ({retailBag.reduce((s, i) => s + i.qty, 0)})</span>
            </button>
          </div>
        </div>

        {retailOrderSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-800">
            {retailOrderSuccess}
          </div>
        )}

        {/* Search & Category Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm sản phẩm không dấu (VD: ca phe, tra o long)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <p className="text-base font-semibold text-slate-900">Không tìm thấy sản phẩm phù hợp</p>
            <p className="text-sm text-slate-500 mt-1">
              Thử nhập từ khóa khác hoặc chọn danh mục Tất cả.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => {
              const outOfStock = product.status === ProductStatus.OUT_OF_STOCK || product.stock <= 0;
              return (
                <div
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className="aspect-square w-full bg-slate-100 overflow-hidden cursor-pointer text-left"
                  >
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{product.category}</span>
                        <span className={outOfStock ? 'text-red-700 font-medium' : 'text-emerald-700 font-medium'}>
                          {outOfStock ? 'Hết hàng' : `Còn ${product.stock} ${product.unit}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="mt-1.5 text-left text-base font-semibold text-slate-900 hover:text-[#0F766E] cursor-pointer"
                      >
                        {product.name}
                      </button>
                      {product.description && (
                        <p className="mt-1.5 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                          {formatVND(product.price)}
                        </span>
                        <span className="text-xs text-slate-500"> / {product.unit}</span>
                      </div>
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addToRetailBag(product, 1)}
                        className="px-3.5 py-2 min-h-[40px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {outOfStock ? 'Tạm hết' : 'Thêm vào giỏ'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl grid grid-cols-1 md:grid-cols-2">
              <div className="aspect-square bg-slate-100">
                <ProductImage
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      {selectedProduct.category} · SKU {selectedProduct.sku}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-label="Đóng chi tiết"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">
                    {selectedProduct.name}
                  </h2>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F766E]">
                    {formatVND(selectedProduct.price)}
                    <span className="text-xs font-sans font-normal text-slate-500">
                      {' '}
                      / {selectedProduct.unit}
                    </span>
                  </p>
                  <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                    {selectedProduct.description || 'Sản phẩm chính hãng tại cửa hàng.'}
                  </p>
                </div>

                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    disabled={selectedProduct.status === ProductStatus.OUT_OF_STOCK}
                    onClick={() => {
                      addToRetailBag(selectedProduct, 1);
                      setSelectedProduct(null);
                      setBagOpen(true);
                    }}
                    className="w-full px-4 py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Thêm vào giỏ đặt hàng
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`https://zalo.me/${config.zaloPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2.5 min-h-[40px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#0F766E]" />
                      <span>Nhắn Zalo</span>
                    </a>
                    <a
                      href={`tel:${config.phone}`}
                      className="px-3 py-2.5 min-h-[40px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                      <span>Gọi ngay</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Take-away Pickup Order Drawer (Pay at Store) */}
        {bagOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Đơn đặt hàng nhận tại quán</h3>
                  <p className="text-xs text-slate-500">Thanh toán trực tiếp tại cửa hàng khi đến lấy</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBagOpen(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {retailBag.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-12">
                    Giỏ hàng đang trống. Chọn sản phẩm để thêm vào đơn đặt hàng.
                  </p>
                ) : (
                  retailBag.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {formatVND(item.price)} × {item.qty} = <strong className="text-slate-800">{formatVND(item.price * item.qty)}</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateRetailQty(item.productId, -1)}
                          aria-label="Giảm số lượng"
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-mono tabular-nums font-semibold">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateRetailQty(item.productId, 1)}
                          aria-label="Tăng số lượng"
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromRetailBag(item.productId)}
                          aria-label="Bỏ sản phẩm"
                          className="ml-1 px-2 h-8 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50"
                        >
                          Bỏ
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSubmitRetailPickupOrder} className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between text-base font-bold text-slate-900">
                  <span>Tạm tính (trả tại quán)</span>
                  <span className="font-mono tabular-nums text-[#0F766E]">
                    {formatVND(retailTotal)}
                  </span>
                </div>

                {retailBag.length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Tên khách hàng *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="VD: Nguyễn Văn An"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Số điện thoại *
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="VD: 0912345678"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Thời gian đến nhận hàng *
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {['Sau 15 phút', 'Sau 30 phút', 'Sau 1 giờ'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPickupTime(preset)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer ${
                              pickupTime === preset
                                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        required
                        value={pickupTime}
                        onChange={(e) => setPickupTime(e.target.value)}
                        placeholder="VD: 17:30 hôm nay hoặc Sau 30 phút"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl"
                      />
                    </div>
                    <input
                      type="text"
                      value={pickupNote}
                      onChange={(e) => setPickupNote(e.target.value)}
                      placeholder="Ghi chú thêm cho cửa hàng (tùy chọn)..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={retailBag.length === 0 || submittingRetail}
                  className="w-full py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {submittingRetail ? 'Đang gửi đơn đặt hàng...' : 'Xác nhận đặt hàng (Thanh toán tại quán)'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER MODEL 2: F&B ON-SITE QR TABLE ORDERING (?ban=X)
  // ============================================================
  const activeCardProduct = filteredProducts[cardIndex];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      {/* Table Context & View Mode Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#0F766E]">
            Gọi món tại bàn · {config.shopName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">
              Bàn số {activeTable}
            </h1>
            <select
              value={activeTable}
              onChange={(e) => setActiveTable(Number(e.target.value))}
              aria-label="Chọn số bàn"
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50"
            >
              {Array.from({ length: config.tableCount }, (_, idx) => idx + 1).map((num) => (
                <option key={num} value={num}>
                  Chuyển sang Bàn {num}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFnbViewMode('card')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                fnbViewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600'
              }`}
            >
              Thẻ lớn toàn màn
            </button>
            <button
              type="button"
              onClick={() => setFnbViewMode('grid')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                fnbViewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600'
              }`}
            >
              Danh sách lưới
            </button>
          </div>

          {currentTableOrder && currentTableOrder.items.length > 0 && (
            <button
              type="button"
              onClick={handleRequestPayment}
              className="px-4 py-2 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Yêu cầu thanh toán ({formatVND(currentTableOrder.totalAmount)})</span>
            </button>
          )}
        </div>
      </div>

      {orderFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold text-emerald-800">
          {orderFeedback}
        </div>
      )}

      {/* Search & Categories */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm món ăn, đồ uống..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activeCategory === cat ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Menu Display (Full-screen Swipe Card OR Grid) */}
        <div className="lg:col-span-8">
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
              Không có món nào khớp từ khóa tìm kiếm.
            </div>
          ) : fnbViewMode === 'card' && activeCardProduct ? (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
              <div className="relative aspect-4/3 sm:aspect-16/10 bg-slate-100">
                <ProductImage
                  src={activeCardProduct.imageUrl}
                  alt={activeCardProduct.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-6 text-white">
                  <p className="text-xs text-white/80">
                    {activeCardProduct.category} · Món {cardIndex + 1} / {filteredProducts.length}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-display font-bold mt-1">
                    {activeCardProduct.name}
                  </h2>
                  <p className="text-xl font-mono tabular-nums font-bold text-emerald-300 mt-1">
                    {formatVND(activeCardProduct.price)}
                    <span className="text-xs font-sans font-normal text-white/80">
                      {' '}
                      / {activeCardProduct.unit}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCardIndex((prev) =>
                      prev === 0 ? filteredProducts.length - 1 : prev - 1
                    )
                  }
                  aria-label="Món trước"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md hover:bg-white cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCardIndex((prev) => (prev + 1) % filteredProducts.length)
                  }
                  aria-label="Món tiếp theo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md hover:bg-white cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed flex-1">
                    {activeCardProduct.description || 'Món ngon đặc biệt phục vụ tại quán.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedFnbDish(activeCardProduct)}
                    className="text-xs font-semibold text-[#0F766E] hover:underline shrink-0 cursor-pointer"
                  >
                    Xem chi tiết
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setDishQty(activeCardProduct.id, -1)}
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                      aria-label="Giảm số lượng"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center text-lg font-mono tabular-nums font-bold text-slate-900">
                      {pendingCart[activeCardProduct.id]?.qty || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDishQty(activeCardProduct.id, 1)}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0F766E] text-white flex items-center justify-center hover:bg-[#0D655E] cursor-pointer"
                      aria-label="Tăng số lượng"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={pendingCart[activeCardProduct.id]?.note || ''}
                    onChange={(e) => setDishNote(activeCardProduct.id, e.target.value)}
                    placeholder="Ghi chú món (VD: ít đá, không hành)..."
                    className="flex-1 px-3.5 py-2.5 min-h-[44px] text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                  />
                </div>

                {/* Quick horizontal dish thumbnails */}
                <div className="pt-2 flex items-center gap-2 overflow-x-auto">
                  {filteredProducts.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCardIndex(idx)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer ${
                        idx === cardIndex
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProducts.map((dish) => {
                const qty = pendingCart[dish.id]?.qty || 0;
                return (
                  <div
                    key={dish.id}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFnbDish(dish)}
                      className="aspect-4/3 w-full bg-slate-100 text-left overflow-hidden cursor-pointer"
                    >
                      <ProductImage
                        src={dish.imageUrl}
                        alt={dish.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <button
                        type="button"
                        onClick={() => setSelectedFnbDish(dish)}
                        className="text-left w-full cursor-pointer"
                      >
                        <p className="text-xs text-slate-500">{dish.category}</p>
                        <h3 className="text-base font-semibold text-slate-900 hover:text-[#0F766E] mt-0.5">
                          {dish.name}
                        </h3>
                        {dish.description && (
                          <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed mt-1">
                            {dish.description}
                          </p>
                        )}
                        <p className="text-base font-bold font-mono tabular-nums text-[#0F766E] mt-1.5">
                          {formatVND(dish.price)}
                          <span className="text-xs font-sans font-normal text-slate-500">
                            {' '}/ {dish.unit}
                          </span>
                        </p>
                      </button>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDishQty(dish.id, -1)}
                              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-mono tabular-nums font-bold">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDishQty(dish.id, 1)}
                              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0F766E] text-white flex items-center justify-center hover:bg-[#0D655E]"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {qty > 0 && (
                          <input
                            type="text"
                            value={pendingCart[dish.id]?.note || ''}
                            onChange={(e) => setDishNote(dish.id, e.target.value)}
                            placeholder="Ghi chú (ít đá, không hành)..."
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Current Table Order Summary */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Món đang chọn cho Bàn {activeTable}
            </h3>
            {pendingItems.length === 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                Chạm nút + để chọn món mới gửi xuống Bếp.
              </p>
            ) : (
              <div className="mt-3 space-y-3 divide-y divide-slate-100">
                {pendingItems.map((item) => (
                  <div key={item.productId} className="pt-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        {item.note && <p className="text-xs text-slate-500">Ghi chú: {item.note}</p>}
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        {formatVND(item.price * item.qty)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDishQty(item.productId, -1)}
                          aria-label="Giảm số lượng"
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-mono tabular-nums font-bold">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDishQty(item.productId, 1)}
                          aria-label="Tăng số lượng"
                          className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center hover:bg-[#0D655E] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingDish(item.productId)}
                        className="px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Bỏ</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={pendingItems.length === 0 || submittingOrder}
              onClick={handleSubmitTableOrder}
              className="mt-4 w-full py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {submittingOrder
                ? 'Đang gửi đơn...'
                : `Xác nhận đặt món (${pendingCount} món · ${formatVND(pendingSubtotal)})`}
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                Đã gọi tại Bàn {activeTable}
              </h4>
              {currentTableOrder && (
                <span className="text-xs font-semibold text-[#0F766E]">
                  {currentTableOrder.status === TableStatus.PAYMENT_REQUESTED
                    ? 'Đang chờ thanh toán'
                    : 'Đang phục vụ'}
                </span>
              )}
            </div>

            {!currentTableOrder || currentTableOrder.items.length === 0 ? (
              <p className="text-xs text-slate-500 mt-2">Bàn chưa có món nào được gửi.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {currentTableOrder.items.map((item, i) => (
                  <div key={`${item.productId}-${i}`} className="flex justify-between text-xs text-slate-700">
                    <span>
                      {item.qty} × {item.name}
                      {item.note ? ` (${item.note})` : ''}
                    </span>
                    <span className="font-mono tabular-nums font-medium">
                      {formatVND(item.price * item.qty)}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-bold text-slate-900">
                  <span>Tạm tính</span>
                  <span className="font-mono tabular-nums text-[#0F766E]">
                    {formatVND(currentTableOrder.totalAmount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestPayment}
                  className="mt-2 w-full py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Yêu cầu thanh toán &amp; Hiện VietQR
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Bar (<= 15% viewport height) */}
      {pendingCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFnbPendingOpen(true)}
            className="text-left min-w-0 cursor-pointer"
          >
            <p className="text-xs text-[#0F766E] font-semibold underline underline-offset-2">
              Bàn {activeTable} · {pendingCount} món (Xem / Sửa)
            </p>
            <p className="text-base font-bold font-mono tabular-nums text-slate-900">
              {formatVND(pendingSubtotal)}
            </p>
          </button>
          <button
            type="button"
            disabled={submittingOrder}
            onClick={handleSubmitTableOrder}
            className="px-5 py-2.5 min-h-[44px] bg-[#0F766E] text-white text-sm font-semibold rounded-xl whitespace-nowrap"
          >
            Xác nhận đặt món
          </button>
        </div>
      )}

      {/* Mobile Pending Order Review & Adjust Modal */}
      {fnbPendingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFnbPendingOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Món đang chọn · Bàn {activeTable}
              </h3>
              <button
                type="button"
                onClick={() => setFnbPendingOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 divide-y divide-slate-100">
              {pendingItems.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">Chưa có món nào được chọn.</p>
              ) : (
                pendingItems.map((item) => (
                  <div key={item.productId} className="pt-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        {item.note && <p className="text-xs text-slate-500">Ghi chú: {item.note}</p>}
                      </div>
                      <span className="font-mono tabular-nums font-bold text-[#0F766E]">
                        {formatVND(item.price * item.qty)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDishQty(item.productId, -1)}
                          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-mono font-bold">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => setDishQty(item.productId, 1)}
                          className="w-9 h-9 rounded-lg bg-[#0F766E] text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingDish(item.productId)}
                        className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg"
                      >
                        Bỏ món
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {pendingItems.length > 0 && (
              <button
                type="button"
                disabled={submittingOrder}
                onClick={async () => {
                  await handleSubmitTableOrder();
                  setFnbPendingOpen(false);
                }}
                className="w-full py-3 min-h-[44px] bg-[#0F766E] text-white text-sm font-bold rounded-xl"
              >
                Gửi đơn ({pendingCount} món · {formatVND(pendingSubtotal)})
              </button>
            )}
          </div>
        </div>
      )}

      {/* F&B Dish Detail Modal */}
      {selectedFnbDish && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedFnbDish(null);
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="relative aspect-4/3 bg-slate-100 shrink-0">
              <ProductImage
                src={selectedFnbDish.imageUrl}
                alt={selectedFnbDish.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedFnbDish(null)}
                aria-label="Đóng chi tiết món"
                className="absolute top-3 right-3 min-h-[36px] min-w-[36px] rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow-sm hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedFnbDish.category} · SKU {selectedFnbDish.sku}
                </p>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedFnbDish.name}
                </h2>
                <p className="text-xl font-mono tabular-nums font-bold text-[#0F766E] mt-1">
                  {formatVND(selectedFnbDish.price)}
                  <span className="text-xs font-sans font-normal text-slate-500">
                    {' '}/ {selectedFnbDish.unit}
                  </span>
                </p>
              </div>

              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {selectedFnbDish.description || 'Món ăn được chế biến tươi mới mỗi ngày tại cửa hàng.'}
              </p>

              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-700">Số lượng chọn</span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDishQty(selectedFnbDish.id, -1)}
                      className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-mono tabular-nums font-bold text-base">
                      {pendingCart[selectedFnbDish.id]?.qty || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDishQty(selectedFnbDish.id, 1)}
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-[#0F766E] text-white flex items-center justify-center hover:bg-[#0D655E] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={pendingCart[selectedFnbDish.id]?.note || ''}
                  onChange={(e) => setDishNote(selectedFnbDish.id, e.target.value)}
                  placeholder="Ghi chú riêng cho món này (ít đá, không hành)..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />

                <button
                  type="button"
                  onClick={() => {
                    if ((pendingCart[selectedFnbDish.id]?.qty || 0) === 0) {
                      setDishQty(selectedFnbDish.id, 1);
                    }
                    setSelectedFnbDish(null);
                  }}
                  className="w-full py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  {(pendingCart[selectedFnbDish.id]?.qty || 0) > 0
                    ? 'Xong · Quay lại thực đơn'
                    : 'Chọn 1 món & Quay lại'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <VietQRModal
        open={billModalOpen}
        title={`Tạm tính Bàn ${activeTable}`}
        amount={currentTableOrder?.totalAmount || 0}
        description={`BAN ${activeTable} ${config.shopName.slice(0, 10)}`}
        bank={config.bank}
        onClose={() => setBillModalOpen(false)}
      />
    </div>
  );
};

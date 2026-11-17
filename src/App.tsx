/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AppTab,
  BusinessModel,
  CartItem,
  InvoiceRecord,
  ProductItem,
  ProductStatus,
  ShopConfig,
  TableOrder,
} from './types';
import {
  clearTableOrder,
  DEFAULT_CONFIG,
  loadInvoices,
  loadProducts,
  loadShopConfig,
  loadTableOrders,
  removeProduct,
  saveInvoice,
  saveProduct,
  saveShopConfig,
  saveTableOrder,
  subscribeSyncChannel,
} from './utils/db';
import { initGoogleAuth } from './services/googleWorkspace';
import { GitHubUser } from './services/githubSync';
import { TopBar } from './components/TopBar';
import { PortalView } from './components/PortalView';
import { StorefrontView } from './components/StorefrontView';
import { OperationsView } from './components/OperationsView';
import { AdminCatalogView } from './components/AdminCatalogView';

function parseTableFromUrl(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ban = Number(params.get('ban'));
    if (Number.isInteger(ban) && ban >= 1 && ban <= 200) {
      return ban;
    }
  } catch {
    // Ignore URL parse errors
  }
  return null;
}

export default function App() {
  const initialBan = parseTableFromUrl();

  const [activeTab, setActiveTab] = useState<AppTab>(
    initialBan ? AppTab.STOREFRONT : AppTab.PORTAL
  );
  const [tableNumberPreview, setTableNumberPreview] = useState<number | null>(initialBan);

  const [config, setConfig] = useState<ShopConfig>(DEFAULT_CONFIG);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [githubToken, setGithubToken] = useState<string>('');
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);

  const refreshAll = useCallback(async () => {
    const [cfg, prods, invs, tables] = await Promise.all([
      loadShopConfig(),
      loadProducts(),
      loadInvoices(),
      loadTableOrders(),
    ]);
    if (initialBan && cfg.model !== BusinessModel.FNB) {
      const fnbCfg = { ...cfg, model: BusinessModel.FNB };
      await saveShopConfig(fnbCfg);
      setConfig(fnbCfg);
    } else {
      setConfig(cfg);
    }
    setProducts(prods);
    setInvoices(invs);
    setTableOrders(tables);
    setLoaded(true);
  }, [initialBan]);

  useEffect(() => {
    refreshAll();
    const unsubSync = subscribeSyncChannel(() => {
      refreshAll();
    });
    const unsubAuth = initGoogleAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => {
      unsubSync();
      unsubAuth();
    };
  }, [refreshAll]);

  const handleUpdateConfig = async (next: ShopConfig) => {
    await saveShopConfig(next);
    setConfig(next);
  };

  const handleSaveProduct = async (product: ProductItem) => {
    await saveProduct(product);
    setProducts(await loadProducts());
  };

  const handleDeleteProduct = async (id: string) => {
    await removeProduct(id);
    setProducts(await loadProducts());
  };

  const handleSaveInvoice = async (invoice: InvoiceRecord) => {
    await saveInvoice(invoice);
    setInvoices(await loadInvoices());
  };

  const handleUpdateProductStock = async (soldItems: CartItem[]) => {
    const all = await loadProducts();
    for (const sold of soldItems) {
      const found = all.find((p) => p.id === sold.productId);
      if (found) {
        const nextStock = Math.max(0, found.stock - sold.qty);
        await saveProduct({
          ...found,
          stock: nextStock,
          status: nextStock === 0 ? ProductStatus.OUT_OF_STOCK : found.status,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    setProducts(await loadProducts());
  };

  const handleSaveTableOrder = async (order: TableOrder) => {
    await saveTableOrder(order);
    setTableOrders(await loadTableOrders());
  };

  const handleClearTableOrder = async (tableNumber: number) => {
    await clearTableOrder(tableNumber);
    setTableOrders(await loadTableOrders());
  };

  const handleOpenTablePreview = (tableNum: number) => {
    setTableNumberPreview(tableNum);
    setActiveTab(AppTab.STOREFRONT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-sm text-slate-500">
        Đang tải dữ liệu cửa hàng...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#111827]">
      <TopBar
        activeTab={activeTab}
        model={config.model}
        onNavigate={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <main className="flex-1">
        {activeTab === AppTab.PORTAL && (
          <PortalView
            config={config}
            products={products}
            googleUser={googleUser}
            githubToken={githubToken}
            githubUser={githubUser}
            onUpdateConfig={handleUpdateConfig}
            onGoogleAuthChange={setGoogleUser}
            onGitHubAuthChange={(token, user) => {
              setGithubToken(token);
              setGithubUser(user);
            }}
            onOpenStorefront={() => setActiveTab(AppTab.STOREFRONT)}
            onOpenOperations={() => setActiveTab(AppTab.OPERATIONS)}
          />
        )}

        {activeTab === AppTab.STOREFRONT && (
          <StorefrontView
            config={config}
            products={products}
            tableOrders={tableOrders}
            initialTableNumber={tableNumberPreview}
            onSaveTableOrder={handleSaveTableOrder}
            onSaveInvoice={handleSaveInvoice}
            onUpdateProductStock={handleUpdateProductStock}
          />
        )}

        {activeTab === AppTab.OPERATIONS && (
          <OperationsView
            config={config}
            products={products}
            tableOrders={tableOrders}
            onSaveInvoice={handleSaveInvoice}
            onUpdateProductStock={handleUpdateProductStock}
            onSaveTableOrder={handleSaveTableOrder}
            onClearTableOrder={handleClearTableOrder}
            onOpenTablePreview={handleOpenTablePreview}
          />
        )}

        {activeTab === AppTab.ADMIN && (
          <AdminCatalogView
            config={config}
            products={products}
            invoices={invoices}
            githubToken={githubToken}
            githubUser={githubUser}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onMarkInvoiceSynced={handleSaveInvoice}
          />
        )}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            HKDVN · Vận hành trực tiếp trên trình duyệt, dữ liệu lưu tại Google Drive, Sheets, Apps Script &amp; GitHub Pages của chủ quán
          </p>
          <p className="font-medium text-slate-600">
            {config.shopName} · {config.model === BusinessModel.RETAIL ? 'Bán lẻ & Mang đi' : 'F&B Tại chỗ'}
          </p>
        </div>
      </footer>
    </div>
  );
}

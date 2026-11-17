import {
  BusinessModel,
  InvoiceRecord,
  PaymentMethod,
  ProductItem,
  ProductStatus,
  ShopConfig,
  TableOrder,
  TableStatus,
} from '../types';

import heroImg from '../assets/images/hero_hkdvn_store_1794842003940.jpg';
import coffeeImg from '../assets/images/retail_ca_phe_sua_1794842004343.jpg';
import oolongImg from '../assets/images/retail_tra_o_long_1794842004254.jpg';
import phoImg from '../assets/images/fnb_pho_bo_1794842004947.jpg';
import banhMiImg from '../assets/images/fnb_banh_mi_1794842005808.jpg';
import peachTeaImg from '../assets/images/fnb_tra_dao_cam_sa_1794842005902.jpg';

const DB_NAME = 'hkdvn_byob_db';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_PRODUCTS = 'products';
const STORE_INVOICES = 'invoices';
const STORE_TABLES = 'tableOrders';

export const HERO_IMAGE_PATH = heroImg;
export const DEFAULT_PRODUCT_IMAGE = coffeeImg;

export const DEFAULT_CONFIG: ShopConfig = {
  shopName: 'Quán & Tạp Hóa Minh Tâm',
  phone: '0901234567',
  zaloPhone: '0901234567',
  address: '128 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
  model: BusinessModel.FNB,
  tableCount: 12,
  bank: {
    bankBin: '970436',
    bankShortName: 'Vietcombank',
    accountNumber: '1019876543',
    accountName: 'NGUYEN MINH TAM',
  },
  infra: {},
};

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'sp-r1',
    sku: '8934588012015',
    name: 'Cà Phê Sữa Đá Đóng Chai 330ml',
    price: 35000,
    costPrice: 18000,
    category: 'Đồ uống đóng chai',
    unit: 'Chai',
    stock: 48,
    status: ProductStatus.IN_STOCK,
    imageUrl: coffeeImg,
    description: 'Cà phê Robusta rang mộc pha phin truyền thống kết hợp sữa đặc, đóng chai thủy tinh tiện mang đi.',
    model: BusinessModel.RETAIL,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-r2',
    sku: '8936012440091',
    name: 'Trà Ô Long Mộc Châu Ủ Lạnh 250ml',
    price: 38000,
    costPrice: 19000,
    category: 'Đồ uống đóng chai',
    unit: 'Chai',
    stock: 36,
    status: ProductStatus.IN_STOCK,
    imageUrl: oolongImg,
    description: 'Lá trà Ô Long thu hái tại cao nguyên Mộc Châu, ủ lạnh 12 giờ giữ trọn hương thơm thanh mát.',
    model: BusinessModel.RETAIL,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-r3',
    sku: '8934567890128',
    name: 'Hạt Cà Phê Rang Mộc 250g',
    price: 135000,
    costPrice: 78000,
    category: 'Cà phê hạt & Bột',
    unit: 'Túi',
    stock: 22,
    status: ProductStatus.IN_STOCK,
    imageUrl: coffeeImg,
    description: 'Hạt Arabica Cầu Đất & Robusta Đắk Lắk phối trộn tỷ lệ 30/70, phù hợp pha phin và Espresso.',
    model: BusinessModel.RETAIL,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-r4',
    sku: '8935001920044',
    name: 'Bánh Mì Giòn Nhân Thịt Nướng (Mang Đi)',
    price: 32000,
    costPrice: 16000,
    category: 'Đồ ăn nhanh',
    unit: 'Ổ',
    stock: 25,
    status: ProductStatus.IN_STOCK,
    imageUrl: banhMiImg,
    description: 'Bánh mì nóng giòn kẹp thịt nướng mật ong, đồ chua và rau mùi, gói giấy kraft mang đi.',
    model: BusinessModel.RETAIL,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-f1',
    sku: 'MON-01',
    name: 'Phở Bò Tái Nạm Truyền Thống',
    price: 65000,
    costPrice: 31000,
    category: 'Món chính',
    unit: 'Tô',
    stock: 50,
    status: ProductStatus.IN_STOCK,
    imageUrl: phoImg,
    description: 'Nước dùng ninh xương bò 12 giờ cùng thảo quả, quế hồi. Kèm thịt tái mềm và rau thơm tươi.',
    model: BusinessModel.FNB,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-f2',
    sku: 'MON-02',
    name: 'Bánh Mì Thịt Nướng Đặc Biệt',
    price: 35000,
    costPrice: 16000,
    category: 'Món chính',
    unit: 'Phần',
    stock: 40,
    status: ProductStatus.IN_STOCK,
    imageUrl: banhMiImg,
    description: 'Thịt heo ướp sả nướng than hoa, pate nhà làm, đồ chua giòn và ớt tươi.',
    model: BusinessModel.FNB,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-f3',
    sku: 'NUOC-01',
    name: 'Trà Đào Cam Sả Đá Lạnh',
    price: 42000,
    costPrice: 14000,
    category: 'Trà & Giải khát',
    unit: 'Ly',
    stock: 80,
    status: ProductStatus.IN_STOCK,
    imageUrl: peachTeaImg,
    description: 'Trà đen ủ đậm kết hợp sả đập dập, cam vàng tươi và miếng đào giòn thanh mát.',
    model: BusinessModel.FNB,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-f4',
    sku: 'NUOC-02',
    name: 'Cà Phê Sữa Đá Phin',
    price: 32000,
    costPrice: 10000,
    category: 'Cà phê',
    unit: 'Ly',
    stock: 100,
    status: ProductStatus.IN_STOCK,
    imageUrl: coffeeImg,
    description: 'Cà phê phin đậm đà đánh cùng sữa đặc có đường và đá viên tinh khiết.',
    model: BusinessModel.FNB,
    updatedAt: new Date().toISOString(),
  },
];

const INITIAL_INVOICES: InvoiceRecord[] = [
  {
    id: 'HD-261116-A12',
    createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    model: BusinessModel.FNB,
    customerOrTable: 'Bàn 3',
    items: [
      {
        productId: 'sp-f1',
        sku: 'MON-01',
        name: 'Phở Bò Tái Nạm Truyền Thống',
        price: 65000,
        costPrice: 31000,
        unit: 'Tô',
        qty: 2,
        imageUrl: '/src/assets/images/fnb_pho_bo_1794842004947.jpg',
      },
      {
        productId: 'sp-f3',
        sku: 'NUOC-01',
        name: 'Trà Đào Cam Sả Đá Lạnh',
        price: 42000,
        costPrice: 14000,
        unit: 'Ly',
        qty: 2,
        imageUrl: '/src/assets/images/fnb_tra_dao_cam_sa_1794842005902.jpg',
      },
    ],
    totalAmount: 214000,
    totalCost: 90000,
    profit: 124000,
    paymentMethod: PaymentMethod.VIETQR,
    syncedToSheets: false,
  },
];

let dbPromise: Promise<IDBDatabase> | null = null;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hkdvn_sync') : null;

export function subscribeSyncChannel(onUpdate: () => void): () => void {
  if (!channel) return () => {};
  const handler = () => onUpdate();
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}

function broadcastUpdate(topic: string) {
  try {
    channel?.postMessage({ topic, ts: Date.now() });
  } catch {
    // Ignore broadcast errors
  }
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_INVOICES)) db.createObjectStore(STORE_INVOICES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_TABLES)) db.createObjectStore(STORE_TABLES, { keyPath: 'tableNumber' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function ensureSeededDB(): Promise<void> {
  const db = await openDB();
  const existingConfig = await getShopConfigRaw(db);
  if (!existingConfig) {
    await putKV(db, 'shopConfig', DEFAULT_CONFIG);
  }
  const existingProducts = await getAllFromStore<ProductItem>(db, STORE_PRODUCTS);
  if (existingProducts.length === 0) {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTS);
    for (const item of INITIAL_PRODUCTS) {
      store.put(item);
    }
  }
  const existingInvoices = await getAllFromStore<InvoiceRecord>(db, STORE_INVOICES);
  if (existingInvoices.length === 0) {
    const tx = db.transaction(STORE_INVOICES, 'readwrite');
    const store = tx.objectStore(STORE_INVOICES);
    for (const inv of INITIAL_INVOICES) {
      store.put(inv);
    }
  }
  const existingTables = await getAllFromStore<TableOrder>(db, STORE_TABLES);
  if (existingTables.length === 0) {
    const sampleTable: TableOrder = {
      tableNumber: 2,
      status: TableStatus.OCCUPIED,
      items: [
        {
          productId: 'sp-f1',
          sku: 'MON-01',
          name: 'Phở Bò Tái Nạm Truyền Thống',
          price: 65000,
          costPrice: 31000,
          unit: 'Tô',
          qty: 1,
          note: 'Ít hành, thêm chanh',
          imageUrl: '/src/assets/images/fnb_pho_bo_1794842004947.jpg',
        },
        {
          productId: 'sp-f3',
          sku: 'NUOC-01',
          name: 'Trà Đào Cam Sả Đá Lạnh',
          price: 42000,
          costPrice: 14000,
          unit: 'Ly',
          qty: 1,
          note: 'Ít đá',
          imageUrl: '/src/assets/images/fnb_tra_dao_cam_sa_1794842005902.jpg',
        },
      ],
      totalAmount: 107000,
      updatedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      lastOrderId: 'OD-BAN2-01',
      unreadAlert: false,
    };
    await putInStore(db, STORE_TABLES, sampleTable);
  }
}

async function getShopConfigRaw(db: IDBDatabase): Promise<ShopConfig | null> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_KV, 'readonly');
    const req = tx.objectStore(STORE_KV).get('shopConfig');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function putKV(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

function putInStore<T>(db: IDBDatabase, storeName: string, item: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteFromStore(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadShopConfig(): Promise<ShopConfig> {
  await ensureSeededDB();
  const db = await openDB();
  return (await getShopConfigRaw(db)) || DEFAULT_CONFIG;
}

export async function saveShopConfig(config: ShopConfig): Promise<void> {
  const db = await openDB();
  await putKV(db, 'shopConfig', config);
  broadcastUpdate('config');
}

export async function loadProducts(): Promise<ProductItem[]> {
  await ensureSeededDB();
  const db = await openDB();
  const items = await getAllFromStore<ProductItem>(db, STORE_PRODUCTS);
  return items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export async function saveProduct(product: ProductItem): Promise<void> {
  const db = await openDB();
  await putInStore(db, STORE_PRODUCTS, product);
  broadcastUpdate('products');
}

export async function removeProduct(id: string): Promise<void> {
  const db = await openDB();
  await deleteFromStore(db, STORE_PRODUCTS, id);
  broadcastUpdate('products');
}

export async function loadInvoices(): Promise<InvoiceRecord[]> {
  await ensureSeededDB();
  const db = await openDB();
  const items = await getAllFromStore<InvoiceRecord>(db, STORE_INVOICES);
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveInvoice(invoice: InvoiceRecord): Promise<void> {
  const db = await openDB();
  await putInStore(db, STORE_INVOICES, invoice);
  broadcastUpdate('invoices');
}

export async function loadTableOrders(): Promise<TableOrder[]> {
  await ensureSeededDB();
  const db = await openDB();
  const list = await getAllFromStore<TableOrder>(db, STORE_TABLES);
  return list.sort((a, b) => a.tableNumber - b.tableNumber);
}

export async function saveTableOrder(order: TableOrder): Promise<void> {
  const db = await openDB();
  await putInStore(db, STORE_TABLES, order);
  broadcastUpdate('tables');
}

export async function clearTableOrder(tableNumber: number): Promise<void> {
  const db = await openDB();
  await deleteFromStore(db, STORE_TABLES, tableNumber);
  broadcastUpdate('tables');
}

export async function loadGitHubToken(): Promise<string> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_KV, 'readonly');
    const req = tx.objectStore(STORE_KV).get('githubToken');
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
    req.onerror = () => resolve('');
  });
}

export async function saveGitHubToken(token: string): Promise<void> {
  const db = await openDB();
  await putKV(db, 'githubToken', token);
}

export async function clearGitHubToken(): Promise<void> {
  const db = await openDB();
  await deleteFromStore(db, STORE_KV, 'githubToken');
}


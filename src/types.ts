export enum BusinessModel {
  RETAIL = 'retail',
  FNB = 'fnb',
}

export enum AppTab {
  PORTAL = 'portal',
  STOREFRONT = 'storefront',
  OPERATIONS = 'operations',
  ADMIN = 'admin',
}

export enum ProductStatus {
  IN_STOCK = 'Còn hàng',
  OUT_OF_STOCK = 'Hết hàng',
}

export enum TableStatus {
  EMPTY = 'empty',
  OCCUPIED = 'occupied',
  PAYMENT_REQUESTED = 'payment_requested',
  SUPPORT_REQUESTED = 'support_requested',
}

export enum PaymentMethod {
  VIETQR = 'VietQR',
  CASH = 'Tiền mặt',
}

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  category: string;
  unit: string;
  stock: number;
  status: ProductStatus;
  imageUrl: string;
  imageWebpBase64?: string;
  description: string;
  model: BusinessModel;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  unit: string;
  qty: number;
  note?: string;
  imageUrl: string;
}

export interface TableOrder {
  tableNumber: number;
  orderKey?: string;
  orderType?: 'fnb_table' | 'retail_pickup';
  customerName?: string;
  customerPhone?: string;
  pickupTime?: string;
  note?: string;
  status: TableStatus;
  items: CartItem[];
  totalAmount: number;
  updatedAt: string;
  lastOrderId: string;
  paymentRequestedAt?: string;
  supportNote?: string;
  unreadAlert?: boolean;
}

export interface RetailPickupOrder {
  orderId: string;
  customerName: string;
  customerPhone: string;
  pickupTime: string;
  note?: string;
  items: CartItem[];
  totalAmount: number;
  status: 'retail_pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  unreadAlert?: boolean;
}

export interface InvoiceRecord {
  id: string;
  createdAt: string;
  model: BusinessModel;
  customerOrTable: string;
  items: CartItem[];
  totalAmount: number;
  totalCost: number;
  profit: number;
  paymentMethod: PaymentMethod;
  syncedToSheets: boolean;
}

export interface BankInfo {
  bankBin: string;
  bankShortName: string;
  accountNumber: string;
  accountName: string;
}

export interface ProvisionedInfra {
  driveFolderId?: string;
  driveFolderName?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  scriptId?: string;
  gasEndpointUrl?: string;
  gasManualRequired?: boolean;
  githubOwner?: string;
  githubRepo?: string;
  githubPagesUrl?: string;
  provisionedAt?: string;
}

export interface ShopConfig {
  shopName: string;
  phone: string;
  zaloPhone: string;
  address: string;
  model: BusinessModel;
  tableCount: number;
  bank: BankInfo;
  infra: ProvisionedInfra;
  adminPasscodeSalt?: string;
  adminPasscodeHash?: string;
}

export interface ProcessedImageResult {
  dataUrl: string;
  base64: string;
  width: number;
  height: number;
  originalKB: number;
  compressedKB: number;
}

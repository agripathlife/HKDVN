import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BusinessModel,
  InvoiceRecord,
  ProductItem,
  ShopConfig,
  TableOrder,
} from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
];

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// In-memory access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, hasMemoryToken: boolean) => void,
  onSignedOut?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      onAuthSuccess?.(user, Boolean(cachedAccessToken));
    } else {
      cachedAccessToken = null;
      onSignedOut?.();
    }
  });
};

export const googleSignIn = async (
  emailHint?: string | null
): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    if (emailHint) {
      provider.setCustomParameters({ login_hint: emailHint });
    } else {
      provider.setCustomParameters({});
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được mã truy cập Google Workspace từ phiên đăng nhập.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => cachedAccessToken;

export const googleLogout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export function translateGoogleError(rawMsg: string, status?: number): string {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('user has not enabled the apps script api')) {
    return 'Tài khoản Google này chưa bật Google Apps Script API (hoặc vừa mới bật nên Google cần 2–3 phút để đồng bộ). Hãy kiểm tra đúng Gmail tại trang Cài đặt Apps Script, đợi 2 phút rồi bấm "Thử lại Bước 03", hoặc dùng Cách 2 (dán mã Code.gs thủ công) bên dưới.';
  }
  if (
    lower.includes('apps script api has not been used in project') ||
    lower.includes('has not been used in project') ||
    lower.includes('accessnotconfigured')
  ) {
    return 'Dự án Google Cloud chưa bật dịch vụ Google Apps Script API (script.googleapis.com). Bạn có thể bật API này trên Google Cloud Console hoặc dùng Cách 2 (dán mã Code.gs trực tiếp trong Google Sheet) ở bên dưới.';
  }
  if (lower.includes('insufficient authentication scopes') || lower.includes('insufficient')) {
    return 'Tài khoản chưa được cấp đủ quyền Google Drive, Sheets hoặc Apps Script. Vui lòng Đăng xuất rồi Đăng nhập lại và tích chọn đầy đủ tất cả các quyền.';
  }
  if (lower.includes('invalid credentials') || status === 401) {
    return 'Phiên đăng nhập Google đã hết hạn. Vui lòng Đăng xuất và Đăng nhập lại để lấy mã truy cập mới.';
  }
  if (lower.includes('permission') || status === 403) {
    return `Tài khoản chưa có quyền thực hiện thao tác này (${rawMsg}).`;
  }
  return rawMsg || `Lỗi kết nối Google API (mã ${status || 'không xác định'}).`;
}

async function googleFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const raw = data?.error?.message || '';
    throw new Error(translateGoogleError(raw, res.status));
  }
  return data as T;
}

export async function createDriveFolder(
  token: string,
  folderName = 'QuanLyCuaHang_Data'
): Promise<{ id: string; name: string }> {
  const q = encodeURIComponent(
    `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const search = await googleFetch<{ files?: Array<{ id: string; name: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    token
  );
  if (search.files && search.files.length > 0) {
    return search.files[0];
  }

  return googleFetch<{ id: string; name: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );
}

export async function createShopSpreadsheet(
  token: string,
  folderId: string,
  config: ShopConfig
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const title = `HKDVN_${config.shopName.slice(0, 32)}_Data`;
  const created = await googleFetch<{ spreadsheetId: string; spreadsheetUrl: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title, locale: 'vi_VN' },
        sheets: [
          { properties: { title: 'DoanhThu' } },
          { properties: { title: 'ChiTietDonHang' } },
          { properties: { title: 'DanhMucHangHoa' } },
          { properties: { title: 'CauHinh' } },
          { properties: { title: 'DonHienTai' } },
        ],
      }),
    }
  );

  // Move spreadsheet into QuanLyCuaHang_Data folder
  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}?addParents=${folderId}&fields=id`,
    token,
    { method: 'PATCH', body: JSON.stringify({}) }
  );

  // Initialize headers & CauHinh row
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'DoanhThu!A1:I1',
            values: [['Mã HĐ', 'Thời gian', 'Mô hình', 'Bàn / Khách', 'Tổng tiền', 'Giá vốn', 'Lợi nhuận', 'Thanh toán', 'Chi tiết JSON']],
          },
          {
            range: 'ChiTietDonHang!A1:G1',
            values: [['Mã HĐ', 'Thời gian', 'Mã SKU', 'Tên sản phẩm / món', 'Số lượng', 'Đơn giá', 'Ghi chú']],
          },
          {
            range: 'DanhMucHangHoa!A1:I1',
            values: [['SKU / Barcode', 'Tên sản phẩm', 'Danh mục', 'Giá bán', 'Giá vốn', 'Tồn kho', 'Đơn vị', 'Trạng thái', 'Cập nhật']],
          },
          {
            range: 'CauHinh!A1:G2',
            values: [
              ['Tên quán', 'Mô hình', 'SĐT', 'Ngân hàng', 'STK', 'Chủ TK', 'Số bàn'],
              [
                config.shopName,
                config.model === BusinessModel.RETAIL ? 'Bán lẻ / Mang đi' : 'Ăn uống / Tại chỗ',
                config.phone,
                config.bank.bankShortName,
                config.bank.accountNumber,
                config.bank.accountName,
                String(config.tableCount),
              ],
            ],
          },
          {
            range: 'DonHienTai!A1:F1',
            values: [['Số bàn', 'Trạng thái', 'Tổng tiền', 'Mã đơn', 'Cập nhật lúc', 'Danh sách món JSON']],
          },
        ],
      }),
    }
  );

  return created;
}

export function generateAppsScriptCode(spreadsheetId: string): string {
  return `// HKDVN BYOB Backend - Tự động triển khai cho Google Sheets ID: ${spreadsheetId}
const SHEET_ID = '${spreadsheetId}';
const CACHE_KEY = 'hkdvn_live_orders_v1_' + SHEET_ID;

function safeParseItems(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function parseRawPayload(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

function buildOrdersFromSheet(sheet) {
  const rows = sheet ? sheet.getDataRange().getValues() : [];
  const orders = [];
  let latestUpdate = '';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const updatedAt = String(r[4] || '');
    if (updatedAt > latestUpdate) latestUpdate = updatedAt;
    const parsed = parseRawPayload(r[5]);
    const isRetail = String(r[1]) === 'retail_pending' || (parsed && !Array.isArray(parsed) && parsed._retailOrder);
    if (isRetail) {
      orders.push({
        orderKey: String(r[0]),
        orderType: 'retail_pickup',
        tableNumber: 0,
        status: String(r[1] || 'retail_pending'),
        totalAmount: Number(r[2] || 0),
        lastOrderId: String(r[3] || r[0]),
        updatedAt: updatedAt,
        customerName: (parsed && parsed.customerName) || '',
        customerPhone: (parsed && parsed.customerPhone) || '',
        pickupTime: (parsed && parsed.pickupTime) || '',
        note: (parsed && parsed.note) || '',
        items: (parsed && Array.isArray(parsed.items)) ? parsed.items : []
      });
    } else {
      orders.push({
        orderKey: String(r[0]),
        orderType: 'fnb_table',
        tableNumber: Number(r[0]),
        status: String(r[1] || 'occupied'),
        totalAmount: Number(r[2] || 0),
        lastOrderId: String(r[3] || ''),
        updatedAt: updatedAt,
        items: Array.isArray(parsed) ? parsed : []
      });
    }
  }
  return { updatedAt: latestUpdate, orders: orders };
}

function syncLiveCache(ss) {
  const sheet = ss.getSheetByName('DonHienTai');
  const payload = buildOrdersFromSheet(sheet);
  try {
    const json = JSON.stringify(payload);
    if (json.length < 95000) {
      CacheService.getScriptCache().put(CACHE_KEY, json, 21600);
    }
  } catch (err) {}
  return payload;
}

function doGet(e) {
  const since = (e && e.parameter && e.parameter.since) || '';
  const cb = (e && e.parameter && e.parameter.callback) || '';
  const cache = CacheService.getScriptCache();
  let payload = null;
  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) payload = JSON.parse(cached);
  } catch (err) {
    payload = null;
  }

  if (!payload) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    payload = syncLiveCache(ss);
  }

  if (since && payload.updatedAt && since === payload.updatedAt) {
    return jsonOut({ unchanged: true, updatedAt: payload.updatedAt }, cb);
  }
  if (since && !payload.updatedAt && since === '__EMPTY__') {
    return jsonOut({ unchanged: true, updatedAt: '' }, cb);
  }
  return jsonOut({ unchanged: false, updatedAt: payload.updatedAt || '', orders: payload.orders || [] }, cb);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const now = new Date().toISOString();

    if (
      body.action === 'placeOrder' ||
      body.action === 'requestPayment' ||
      body.action === 'callSupport' ||
      body.action === 'ackSupport'
    ) {
      const sheet = ss.getSheetByName('DonHienTai');
      const rows = sheet.getDataRange().getValues();
      let rowIndex = -1;
      let existingRow = null;
      for (let i = 1; i < rows.length; i++) {
        if (Number(rows[i][0]) === Number(body.tableNumber)) {
          rowIndex = i + 1;
          existingRow = rows[i];
          break;
        }
      }

      let nextItems = body.items;
      let nextTotal = body.totalAmount;
      if (existingRow && (body.action === 'callSupport' || body.action === 'ackSupport')) {
        if (!Array.isArray(nextItems) || nextItems.length === 0) {
          nextItems = safeParseItems(existingRow[5]);
          nextTotal = Number(existingRow[2] || 0);
        }
      }

      if (body.action === 'ackSupport' && (!nextItems || nextItems.length === 0)) {
        if (rowIndex > 0) sheet.deleteRow(rowIndex);
        syncLiveCache(ss);
        return jsonOut({ ok: true, updatedAt: now });
      }

      const nextStatus =
        body.action === 'ackSupport'
          ? 'occupied'
          : body.status ||
            (body.action === 'requestPayment'
              ? 'payment_requested'
              : body.action === 'callSupport'
                ? 'support_requested'
                : 'occupied');

      const rowData = [
        body.tableNumber,
        nextStatus,
        nextTotal || 0,
        body.lastOrderId || (existingRow ? existingRow[3] : ''),
        now,
        JSON.stringify(nextItems || [])
      ];
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, 6).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      syncLiveCache(ss);
      return jsonOut({ ok: true, updatedAt: now });
    }

    if (body.action === 'placeRetailOrder') {
      const sheet = ss.getSheetByName('DonHienTai');
      const orderId = String(body.orderId || ('DH-' + Date.now().toString().slice(-6)));
      const payloadJson = JSON.stringify({
        _retailOrder: true,
        orderId: orderId,
        customerName: String(body.customerName || ''),
        customerPhone: String(body.customerPhone || ''),
        pickupTime: String(body.pickupTime || ''),
        note: String(body.note || ''),
        items: Array.isArray(body.items) ? body.items : []
      });
      sheet.appendRow([
        orderId,
        'retail_pending',
        Number(body.totalAmount || 0),
        orderId,
        now,
        payloadJson
      ]);
      syncLiveCache(ss);
      return jsonOut({ ok: true, orderId: orderId, updatedAt: now });
    }

    if (body.action === 'transferTable') {
      const fromTbl = Number(body.fromTable);
      const toTbl = Number(body.toTable);
      if (!fromTbl || !toTbl || fromTbl === toTbl) {
        return jsonOut({ ok: false, error: 'Số bàn chuyển không hợp lệ' });
      }
      const sheet = ss.getSheetByName('DonHienTai');
      const rows = sheet.getDataRange().getValues();
      let fromRowIndex = -1;
      let toRowIndex = -1;
      let fromRow = null;
      let toRow = null;
      for (let i = 1; i < rows.length; i++) {
        const keyNum = Number(rows[i][0]);
        if (keyNum === fromTbl) {
          fromRowIndex = i + 1;
          fromRow = rows[i];
        } else if (keyNum === toTbl) {
          toRowIndex = i + 1;
          toRow = rows[i];
        }
      }
      if (!fromRow) {
        return jsonOut({ ok: false, error: 'Bàn nguồn đang trống' });
      }
      if (toRow) {
        const fromItems = safeParseItems(fromRow[5]);
        const merged = safeParseItems(toRow[5]).slice();
        fromItems.forEach(function (incoming) {
          const matchIdx = merged.findIndex(function (x) {
            return x.productId === incoming.productId && (x.note || '') === (incoming.note || '');
          });
          if (matchIdx >= 0) {
            merged[matchIdx].qty = (Number(merged[matchIdx].qty) || 0) + (Number(incoming.qty) || 0);
          } else {
            merged.push(incoming);
          }
        });
        const mergedTotal = merged.reduce(function (s, it) {
          return s + (Number(it.price) || 0) * (Number(it.qty) || 1);
        }, 0);
        const mergedStatus =
          String(toRow[1]) === 'payment_requested' || String(fromRow[1]) === 'payment_requested'
            ? 'payment_requested'
            : String(toRow[1]) === 'support_requested' || String(fromRow[1]) === 'support_requested'
              ? 'support_requested'
              : 'occupied';
        sheet.getRange(toRowIndex, 1, 1, 6).setValues([[
          toTbl,
          mergedStatus,
          mergedTotal,
          toRow[3] || fromRow[3] || '',
          now,
          JSON.stringify(merged)
        ]]);
        sheet.deleteRow(fromRowIndex);
      } else {
        sheet.getRange(fromRowIndex, 1).setValue(toTbl);
        sheet.getRange(fromRowIndex, 5).setValue(now);
      }
      syncLiveCache(ss);
      return jsonOut({ ok: true, updatedAt: now });
    }

    if (body.action === 'dismissRetailOrder' && body.clearOrderKey) {
      const liveSheet = ss.getSheetByName('DonHienTai');
      const rows = liveSheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][0]) === String(body.clearOrderKey)) {
          liveSheet.deleteRow(i + 1);
        }
      }
      syncLiveCache(ss);
      return jsonOut({ ok: true, updatedAt: now });
    }

    if (body.action === 'recordInvoice') {
      const revSheet = ss.getSheetByName('DoanhThu');
      const detailSheet = ss.getSheetByName('ChiTietDonHang');
      const inv = body.invoice;
      revSheet.appendRow([
        inv.id, inv.createdAt, inv.model, inv.customerOrTable,
        inv.totalAmount, inv.totalCost, inv.profit, inv.paymentMethod,
        JSON.stringify(inv.items || [])
      ]);
      (inv.items || []).forEach(function(item) {
        detailSheet.appendRow([inv.id, inv.createdAt, item.sku, item.name, item.qty, item.price, item.note || '']);
      });
      if (body.clearTableNumber || body.clearOrderKey) {
        const liveSheet = ss.getSheetByName('DonHienTai');
        const rows = liveSheet.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--) {
          if (
            (body.clearTableNumber && Number(rows[i][0]) === Number(body.clearTableNumber)) ||
            (body.clearOrderKey && String(rows[i][0]) === String(body.clearOrderKey))
          ) {
            liveSheet.deleteRow(i + 1);
          }
        }
        syncLiveCache(ss);
      }
      return jsonOut({ ok: true });
    }

    return jsonOut({ ok: false, error: 'Unknown action' });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj, callbackName) {
  const text = JSON.stringify(obj);
  if (callbackName && /^[a-zA-Z0-9_$.]+$/.test(callbackName)) {
    return ContentService
      .createTextOutput(callbackName + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

export async function deployAppsScriptBackend(
  token: string,
  spreadsheetId: string,
  shopName: string
): Promise<{ scriptId?: string; webAppUrl?: string; manualRequired?: boolean; errorMessage?: string }> {
  try {
    const project = await googleFetch<{ scriptId: string }>(
      'https://script.googleapis.com/v1/projects',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          title: `HKDVN_API_${shopName.slice(0, 20)}`,
          parentId: spreadsheetId,
        }),
      }
    );

    const manifest = JSON.stringify(
      {
        timeZone: 'Asia/Ho_Chi_Minh',
        dependencies: {},
        exceptionLogging: 'STACKDRIVER',
        runtimeVersion: 'V8',
        webapp: {
          executeAs: 'USER_DEPLOYING',
          access: 'ANYONE_ANONYMOUS',
        },
      },
      null,
      2
    );

    await googleFetch(
      `https://script.googleapis.com/v1/projects/${project.scriptId}/content`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify({
          files: [
            { name: 'appsscript', type: 'JSON', source: manifest },
            { name: 'Code', type: 'SERVER_JS', source: generateAppsScriptCode(spreadsheetId) },
          ],
        }),
      }
    );

    const version = await googleFetch<{ versionNumber: number }>(
      `https://script.googleapis.com/v1/projects/${project.scriptId}/versions`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ description: 'HKDVN Auto Provisioning v1' }),
      }
    );

    const deployment = await googleFetch<{
      deploymentId: string;
      entryPoints?: Array<{ entryPointType: string; webApp?: { url: string } }>;
    }>(
      `https://script.googleapis.com/v1/projects/${project.scriptId}/deployments`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          versionNumber: version.versionNumber,
          manifestFileName: 'appsscript',
          description: 'HKDVN Web App API',
        }),
      }
    );

    const webAppUrl =
      deployment.entryPoints?.find((ep) => ep.entryPointType === 'WEB_APP')?.webApp?.url ||
      `https://script.google.com/macros/s/${deployment.deploymentId}/exec`;

    return { scriptId: project.scriptId, webAppUrl };
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    return {
      manualRequired: true,
      errorMessage:
        raw || 'Chưa thể triển khai tự động Google Apps Script. Vui lòng xem hướng dẫn chi tiết bên dưới.',
    };
  }
}

export async function appendInvoiceToSheet(
  token: string,
  spreadsheetId: string,
  invoice: InvoiceRecord
): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/DoanhThu!A:I:append?valueInputOption=USER_ENTERED`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [
          [
            invoice.id,
            invoice.createdAt,
            invoice.model,
            invoice.customerOrTable,
            invoice.totalAmount,
            invoice.totalCost,
            invoice.profit,
            invoice.paymentMethod,
            JSON.stringify(invoice.items),
          ],
        ],
      }),
    }
  );

  if (invoice.items.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ChiTietDonHang!A:G:append?valueInputOption=USER_ENTERED`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          values: invoice.items.map((item) => [
            invoice.id,
            invoice.createdAt,
            item.sku,
            item.name,
            item.qty,
            item.price,
            item.note || '',
          ]),
        }),
      }
    );
  }
}

export async function syncCatalogToSheet(
  token: string,
  spreadsheetId: string,
  products: ProductItem[]
): Promise<void> {
  const rows = [
    ['SKU / Barcode', 'Tên sản phẩm', 'Danh mục', 'Giá bán', 'Giá vốn', 'Tồn kho', 'Đơn vị', 'Trạng thái', 'Cập nhật'],
    ...products.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.price,
      p.costPrice,
      p.stock,
      p.unit,
      p.status,
      p.updatedAt,
    ]),
  ];

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/DanhMucHangHoa!A1:I${rows.length}?valueInputOption=USER_ENTERED`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({ values: rows }),
    }
  );
}

export async function postOrderToGas(
  gasUrl: string,
  action: 'placeOrder' | 'requestPayment' | 'recordInvoice' | 'placeRetailOrder' | 'transferTable' | 'dismissRetailOrder',
  payload: Record<string, unknown>
): Promise<void> {
  await fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
}

export async function pollOrdersFromGas(
  gasUrl: string,
  sinceTimestamp: string
): Promise<{ unchanged: boolean; updatedAt?: string; orders?: TableOrder[] } | null> {
  try {
    const url = `${gasUrl}?action=poll&since=${encodeURIComponent(sinceTimestamp)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as { unchanged: boolean; updatedAt?: string; orders?: TableOrder[] };
  } catch {
    return null;
  }
}

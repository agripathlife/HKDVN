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
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
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

function doGet(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const action = (e && e.parameter && e.parameter.action) || 'poll';
  const since = (e && e.parameter && e.parameter.since) || '';
  const sheet = ss.getSheetByName('DonHienTai');
  const rows = sheet ? sheet.getDataRange().getValues() : [];
  const orders = [];
  let latestUpdate = '';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const updatedAt = String(r[4] || '');
    if (updatedAt > latestUpdate) latestUpdate = updatedAt;
    orders.push({
      tableNumber: Number(r[0]),
      status: String(r[1]),
      totalAmount: Number(r[2] || 0),
      lastOrderId: String(r[3] || ''),
      updatedAt: updatedAt,
      items: JSON.parse(r[5] || '[]')
    });
  }
  if (since && latestUpdate && since === latestUpdate) {
    return jsonOut({ unchanged: true, updatedAt: latestUpdate });
  }
  return jsonOut({ unchanged: false, updatedAt: latestUpdate, orders: orders });
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const now = new Date().toISOString();

  if (body.action === 'placeOrder' || body.action === 'requestPayment') {
    const sheet = ss.getSheetByName('DonHienTai');
    const rows = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (Number(rows[i][0]) === Number(body.tableNumber)) {
        rowIndex = i + 1;
        break;
      }
    }
    const rowData = [
      body.tableNumber,
      body.status || 'occupied',
      body.totalAmount || 0,
      body.lastOrderId || '',
      now,
      JSON.stringify(body.items || [])
    ];
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, 6).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
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
    if (body.clearTableNumber) {
      const liveSheet = ss.getSheetByName('DonHienTai');
      const rows = liveSheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (Number(rows[i][0]) === Number(body.clearTableNumber)) {
          liveSheet.deleteRow(i + 1);
        }
      }
    }
    return jsonOut({ ok: true });
  }

  return jsonOut({ ok: false, error: 'Unknown action' });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
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
  action: 'placeOrder' | 'requestPayment' | 'recordInvoice',
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

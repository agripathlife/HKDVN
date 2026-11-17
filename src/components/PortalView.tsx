import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  FolderGit2,
  HelpCircle,
  Loader2,
  LogOut,
  RefreshCw,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { BusinessModel, ProductItem, ShopConfig } from '../types';
import { HERO_IMAGE_PATH } from '../utils/db';
import { VIETNAM_BANKS } from '../utils/vietqr';
import {
  createDriveFolder,
  createShopSpreadsheet,
  deployAppsScriptBackend,
  generateAppsScriptCode,
  getGoogleAccessToken,
  googleLogout,
  googleSignIn,
} from '../services/googleWorkspace';
import {
  GitHubUser,
  provisionGitHubStorefront,
  verifyGitHubToken,
} from '../services/githubSync';
import { ConfirmDialog } from './ConfirmDialog';

interface PortalViewProps {
  config: ShopConfig;
  products: ProductItem[];
  googleUser: User | null;
  githubToken: string;
  githubUser: GitHubUser | null;
  onUpdateConfig: (next: ShopConfig) => Promise<void>;
  onGoogleAuthChange: (user: User | null) => void;
  onGitHubAuthChange: (token: string, user: GitHubUser | null) => void;
  onOpenStorefront: () => void;
  onOpenOperations: () => void;
}

interface ProvisionStepState {
  id: string;
  label: string;
  status: 'idle' | 'running' | 'done' | 'warning' | 'error';
  detail?: string;
}

export const PortalView: React.FC<PortalViewProps> = ({
  config,
  products,
  googleUser,
  githubToken,
  githubUser,
  onUpdateConfig,
  onGoogleAuthChange,
  onGitHubAuthChange,
  onOpenStorefront,
  onOpenOperations,
}) => {
  const [draft, setDraft] = useState<ShopConfig>(config);
  const [patInput, setPatInput] = useState(githubToken);
  const [repoName, setRepoName] = useState(config.infra.githubRepo || 'hkdvn-shop');
  const [authError, setAuthError] = useState<string | null>(null);
  const [ghError, setGhError] = useState<string | null>(null);
  const [verifyingGh, setVerifyingGh] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [confirmProvisionOpen, setConfirmProvisionOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [retryingGasOnly, setRetryingGasOnly] = useState(false);
  const [showGasGuide, setShowGasGuide] = useState(false);
  const [steps, setSteps] = useState<ProvisionStepState[]>([
    { id: 'drive', label: '01. Tạo thư mục QuanLyCuaHang_Data trên Google Drive', status: 'idle' },
    { id: 'sheets', label: '02. Khởi tạo Google Sheet 5 bảng dữ liệu kinh doanh', status: 'idle' },
    { id: 'gas', label: '03. Triển khai Google Apps Script Web App API (/exec)', status: 'idle' },
    { id: 'github', label: '04. Khởi tạo kho lưu trữ & kích hoạt GitHub Pages cửa hàng', status: 'idle' },
  ]);
  const [manualGasInput, setManualGasInput] = useState(config.infra.gasEndpointUrl || '');
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSelectModel = async (model: BusinessModel) => {
    const next = { ...draft, model };
    setDraft(next);
    await onUpdateConfig(next);
  };

  const handleSaveShopInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await onUpdateConfig(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2200);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      const res = await googleSignIn();
      onGoogleAuthChange(res.user);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Không thể đăng nhập Google. Vui lòng cho phép cửa sổ bật lên trên trình duyệt.'
      );
    }
  };

  const handleGoogleSignOut = async () => {
    await googleLogout();
    onGoogleAuthChange(null);
  };

  const handleVerifyGitHub = async () => {
    if (!patInput.trim()) {
      setGhError('Vui lòng nhập mã Token GitHub (Personal Access Token).');
      return;
    }
    setGhError(null);
    setVerifyingGh(true);
    try {
      const user = await verifyGitHubToken(patInput.trim());
      onGitHubAuthChange(patInput.trim(), user);
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'Mã Token GitHub không hợp lệ.');
      onGitHubAuthChange('', null);
    } finally {
      setVerifyingGh(false);
    }
  };

  const updateStep = (id: string, patch: Partial<ProvisionStepState>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const runProvisioning = async () => {
    setConfirmProvisionOpen(false);
    setIsProvisioning(true);

    let nextInfra = { ...draft.infra };
    const googleToken = getGoogleAccessToken();

    try {
      // Bước 1: Thư mục Google Drive
      if (googleToken) {
        updateStep('drive', { status: 'running', detail: 'Đang tạo thư mục trên Google Drive...' });
        const folder = await createDriveFolder(googleToken, 'QuanLyCuaHang_Data');
        nextInfra.driveFolderId = folder.id;
        nextInfra.driveFolderName = folder.name;
        updateStep('drive', {
          status: 'done',
          detail: `Đã tạo thư mục "${folder.name}" (${folder.id})`,
        });

        // Bước 2: Google Sheets
        updateStep('sheets', { status: 'running', detail: 'Đang tạo 5 trang tính chuẩn...' });
        const sheet = await createShopSpreadsheet(googleToken, folder.id, draft);
        nextInfra.spreadsheetId = sheet.spreadsheetId;
        nextInfra.spreadsheetUrl = sheet.spreadsheetUrl;
        updateStep('sheets', {
          status: 'done',
          detail: `Đã tạo bảng tính với 5 trang: DoanhThu, ChiTietDonHang, DanhMucHangHoa, CauHinh, DonHienTai.`,
        });

        // Bước 3: Apps Script
        updateStep('gas', { status: 'running', detail: 'Đang tạo và xuất bản dịch vụ Web App API...' });
        const gasRes = await deployAppsScriptBackend(
          googleToken,
          sheet.spreadsheetId,
          draft.shopName
        );
        if (gasRes.webAppUrl) {
          nextInfra.scriptId = gasRes.scriptId;
          nextInfra.gasEndpointUrl = gasRes.webAppUrl;
          nextInfra.gasManualRequired = false;
          setManualGasInput(gasRes.webAppUrl);
          updateStep('gas', {
            status: 'done',
            detail: `Đã triển khai thành công đường dẫn API: ${gasRes.webAppUrl}`,
          });
        } else {
          nextInfra.gasManualRequired = true;
          setShowGasGuide(true);
          updateStep('gas', {
            status: 'warning',
            detail:
              gasRes.errorMessage ||
              'Chưa thể tự động triển khai Apps Script. Vui lòng xem hướng dẫn chi tiết ngay bên dưới.',
          });
        }
      } else {
        updateStep('drive', { status: 'warning', detail: 'Chưa đăng nhập Google — bỏ qua bước Drive.' });
        updateStep('sheets', { status: 'warning', detail: 'Chưa đăng nhập Google — bỏ qua bước Sheets.' });
        updateStep('gas', { status: 'warning', detail: 'Chưa đăng nhập Google — bỏ qua bước Apps Script.' });
      }

      // Bước 4: GitHub Repo & Pages
      if (githubToken && githubUser) {
        updateStep('github', { status: 'running', detail: 'Đang đẩy mã nguồn lên GitHub Pages...' });
        const modelProducts = products.filter((p) => p.model === draft.model);
        const ghRes = await provisionGitHubStorefront(
          githubToken,
          repoName,
          { ...draft, infra: nextInfra },
          modelProducts
        );
        nextInfra.githubOwner = ghRes.owner;
        nextInfra.githubRepo = ghRes.repo;
        nextInfra.githubPagesUrl = ghRes.pagesUrl;
        updateStep('github', {
          status: 'done',
          detail: `Đã xuất bản lên ${ghRes.pagesUrl}`,
        });
      } else {
        updateStep('github', {
          status: 'warning',
          detail: 'Chưa kết nối Token GitHub — cửa hàng vẫn hoạt động đầy đủ ngay trên cổng HKDVN.',
        });
      }

      nextInfra.provisionedAt = new Date().toISOString();
      const updatedConfig = { ...draft, infra: nextInfra };
      setDraft(updatedConfig);
      await onUpdateConfig(updatedConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi trong quá trình khởi tạo hạ tầng.';
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: message } : s))
      );
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleRetryStep3GasOnly = async () => {
    const googleToken = getGoogleAccessToken();
    if (!googleToken) {
      updateStep('gas', {
        status: 'warning',
        detail: 'Phiên đăng nhập Google đã hết hạn hoặc chưa đăng nhập. Vui lòng bấm Đăng xuất rồi Đăng nhập lại bằng Google ở Bước 02.',
      });
      setShowGasGuide(true);
      return;
    }
    if (!draft.infra.spreadsheetId) {
      updateStep('gas', {
        status: 'warning',
        detail: 'Chưa có bảng tính Google Sheet từ Bước 02. Vui lòng chạy "Khởi tạo hạ tầng tự động" trước.',
      });
      return;
    }

    setRetryingGasOnly(true);
    updateStep('gas', { status: 'running', detail: 'Đang thử triển khai lại Google Apps Script Web App...' });
    try {
      const gasRes = await deployAppsScriptBackend(
        googleToken,
        draft.infra.spreadsheetId,
        draft.shopName
      );
      if (gasRes.webAppUrl) {
        const nextInfra = {
          ...draft.infra,
          scriptId: gasRes.scriptId,
          gasEndpointUrl: gasRes.webAppUrl,
          gasManualRequired: false,
        };
        const updatedConfig = { ...draft, infra: nextInfra };
        setDraft(updatedConfig);
        setManualGasInput(gasRes.webAppUrl);
        await onUpdateConfig(updatedConfig);
        updateStep('gas', {
          status: 'done',
          detail: `Đã triển khai thành công đường dẫn API: ${gasRes.webAppUrl}`,
        });
      } else {
        setShowGasGuide(true);
        updateStep('gas', {
          status: 'warning',
          detail:
            gasRes.errorMessage ||
            'Chưa thể tự động triển khai Apps Script. Vui lòng xem hướng dẫn chi tiết bên dưới.',
        });
      }
    } finally {
      setRetryingGasOnly(false);
    }
  };

  const handleSaveManualGasUrl = async () => {
    const cleanUrl = manualGasInput.trim();
    const updated = {
      ...draft,
      infra: {
        ...draft.infra,
        gasEndpointUrl: cleanUrl,
        gasManualRequired: false,
      },
    };
    setDraft(updated);
    await onUpdateConfig(updated);
    if (cleanUrl) {
      updateStep('gas', {
        status: 'done',
        detail: `Đã lưu đường dẫn API thủ công: ${cleanUrl}`,
      });
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCopyGasCode = async () => {
    const sheetId = draft.infra.spreadsheetId || 'NHAP_SPREADSHEET_ID_CUA_BAN';
    await navigator.clipboard.writeText(generateAppsScriptCode(sheetId));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const affectedSummary: string[] = [];
  if (googleUser && getGoogleAccessToken()) {
    affectedSummary.push('Tạo thư mục "QuanLyCuaHang_Data" trên Google Drive của bạn');
    affectedSummary.push('Tạo Google Sheet gồm 5 bảng dữ liệu doanh thu và đơn hàng');
    affectedSummary.push('Triển khai Google Apps Script Web App gắn với bảng tính vừa tạo');
  }
  if (githubUser && githubToken) {
    affectedSummary.push(
      `Tạo hoặc cập nhật kho lưu trữ GitHub "${githubUser.login}/${repoName}" với config.json, products.json, index.html và bật GitHub Pages`
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-6 sm:p-10">
          <div>
            <p className="text-xs font-medium text-[#0F766E] tracking-wide">
              Vận hành trực tiếp trên trình duyệt · Hạ tầng dữ liệu riêng của chủ quán
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-[42px] font-display font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
              Khởi tạo cửa hàng bán lẻ &amp; F&amp;B trên hạ tầng riêng của bạn
            </h1>
            <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
              Toàn bộ doanh thu, hóa đơn và tồn kho lưu trực tiếp trên Google Drive &amp; Google Sheets cá nhân; giao diện và ảnh sản phẩm WebP phát hành miễn phí qua GitHub Pages — không qua máy chủ trung gian.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenStorefront}
              className="px-5 py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Mở Giao diện Khách hàng
            </button>
            <button
              type="button"
              onClick={onOpenOperations}
              className="px-5 py-3 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {draft.model === BusinessModel.RETAIL
                ? 'Vào màn hình POS Bán hàng'
                : 'Vào Bếp & Thu ngân'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[260px]">
          <img
            src={HERO_IMAGE_PATH}
            alt="Không gian cửa hàng bán lẻ và quầy pha chế hiện đại"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* Ma trận lưu trữ dữ liệu 4 cột */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderGit2 className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>Mã nguồn giao diện</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Kho lưu trữ GitHub của chủ quán · Tải trang tốc độ cao miễn phí qua GitHub Pages.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShoppingBag className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>Danh mục &amp; Ảnh WebP</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Tệp products.json &amp; /assets/img/*.webp (~30–50KB/ảnh) tải siêu nhanh.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Cloud className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>Đơn hàng tại bàn</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Google Sheets (DonHienTai) &amp; Apps Script đồng bộ tức thời giữa bàn và bếp.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Database className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>Hóa đơn &amp; Doanh thu</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Lưu ngoại tuyến trên trình duyệt + đồng bộ lên Google Sheets (DoanhThu) riêng tư.
          </p>
        </div>
      </section>

      {/* Bước 1: Chọn mô hình */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">
            01. Chọn mô hình vận hành cửa hàng
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Chuyển đổi mô hình bất kỳ lúc nào; toàn bộ giao diện khách hàng và màn hình thu ngân tự động thích ứng theo mô hình đã chọn.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            type="button"
            onClick={() => handleSelectModel(BusinessModel.RETAIL)}
            className={`text-left p-6 rounded-2xl border transition-all cursor-pointer ${
              draft.model === BusinessModel.RETAIL
                ? 'bg-white border-[#0F766E] ring-2 ring-[#0F766E]/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="w-11 h-11 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center">
                <Store className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-[#0F766E]">
                {draft.model === BusinessModel.RETAIL ? 'Đang kích hoạt' : 'Chọn mô hình này'}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              Mô hình 1: Cửa hàng Bán lẻ / Tạp hóa / Mang đi
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Tập trung tra cứu giá không dấu, quét mã vạch bằng camera điện thoại, giỏ hàng POS tính tiền nhanh, trừ tồn kho và tạo VietQR thu tiền.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectModel(BusinessModel.FNB)}
            className={`text-left p-6 rounded-2xl border transition-all cursor-pointer ${
              draft.model === BusinessModel.FNB
                ? 'bg-white border-[#0F766E] ring-2 ring-[#0F766E]/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="w-11 h-11 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-[#0F766E]">
                {draft.model === BusinessModel.FNB ? 'Đang kích hoạt' : 'Chọn mô hình này'}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              Mô hình 2: Dịch vụ Ăn uống / Tại chỗ (F&amp;B)
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Sinh mã QR cho từng bàn (?ban=X), khách gọi món toàn màn hình kèm ghi chú, báo đơn âm thanh tức thời cho Bếp &amp; Thu ngân, yêu cầu thanh toán VietQR.
            </p>
          </button>
        </div>
      </section>

      {/* Bước 2: Xác thực & Thông tin quán */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cột trái: Kết nối tài khoản */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900">
              02. Kết nối tài khoản sở hữu dữ liệu
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Dữ liệu nằm hoàn toàn trên Google Drive và GitHub cá nhân của chủ quán.
            </p>
          </div>

          {/* Đăng nhập Google Workspace */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Tài khoản Google Workspace</span>
              <span className="text-xs text-slate-500">Drive · Sheets · Apps Script</span>
            </div>

            {googleUser && getGoogleAccessToken() ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {googleUser.displayName || 'Tài khoản Google'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{googleUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="gsi-material-button w-full"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">Đăng nhập bằng Google</span>
                  </div>
                </button>
                {authError && <p className="mt-2 text-xs text-red-700">{authError}</p>}
              </div>
            )}
          </div>

          {/* GitHub Personal Access Token */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">GitHub (GitHub Pages)</span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=HKDVN%20Storefront"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[#0F766E] hover:underline inline-flex items-center gap-1"
              >
                <span>Tạo mã Token (quyền repo)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="flex-1 min-w-0 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
              <button
                type="button"
                onClick={handleVerifyGitHub}
                disabled={verifyingGh}
                className="px-4 py-2 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {verifyingGh ? 'Đang kiểm tra...' : 'Kết nối'}
              </button>
            </div>

            {githubUser && (
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={githubUser.avatar_url}
                    alt={githubUser.login}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-slate-200"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      @{githubUser.login}
                    </p>
                    <p className="text-[11px] text-emerald-700">Đã xác thực quyền GitHub</p>
                  </div>
                </div>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  aria-label="Tên kho lưu trữ GitHub"
                  className="w-32 px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-md bg-white"
                />
              </div>
            )}
            {ghError && <p className="text-xs text-red-700">{ghError}</p>}
          </div>
        </div>

        {/* Cột phải: Thông tin quán & VietQR */}
        <form
          onSubmit={handleSaveShopInfo}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900">
                Thông tin cửa hàng &amp; VietQR
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Tự động ghi vào tệp config.json và bảng tính CauHinh.
              </p>
            </div>
            {savedNotice && (
              <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Đã lưu cấu hình
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên cửa hàng / Quán
              </label>
              <input
                type="text"
                required
                value={draft.shopName}
                onChange={(e) => setDraft({ ...draft, shopName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số điện thoại / Zalo đặt hàng
              </label>
              <input
                type="tel"
                required
                value={draft.phone}
                onChange={(e) =>
                  setDraft({ ...draft, phone: e.target.value, zaloPhone: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Địa chỉ</label>
              <input
                type="text"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Ngân hàng nhận VietQR
              </label>
              <select
                value={draft.bank.bankBin}
                onChange={(e) => {
                  const found = VIETNAM_BANKS.find((b) => b.bin === e.target.value);
                  if (found) {
                    setDraft({
                      ...draft,
                      bank: {
                        ...draft.bank,
                        bankBin: found.bin,
                        bankShortName: found.shortName,
                      },
                    });
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              >
                {VIETNAM_BANKS.map((bank) => (
                  <option key={bank.bin} value={bank.bin}>
                    {bank.shortName} ({bank.bin})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số tài khoản ngân hàng
              </label>
              <input
                type="text"
                required
                value={draft.bank.accountNumber}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    bank: { ...draft.bank, accountNumber: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên chủ tài khoản (không dấu)
              </label>
              <input
                type="text"
                required
                value={draft.bank.accountName}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    bank: { ...draft.bank, accountName: e.target.value.toUpperCase() },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số lượng bàn phục vụ (F&amp;B)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.tableCount}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tableCount: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={savingConfig}
              className="px-4 py-2.5 min-h-[42px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {savingConfig ? 'Đang lưu...' : 'Lưu thông tin quán'}
            </button>

            <button
              type="button"
              disabled={isProvisioning || (!googleUser && !githubUser)}
              onClick={() => setConfirmProvisionOpen(true)}
              className="px-5 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {isProvisioning ? 'Đang khởi tạo hạ tầng...' : 'Khởi tạo hạ tầng tự động'}
            </button>
          </div>
          {!googleUser && !githubUser && (
            <p className="text-xs text-slate-500">
              Đăng nhập Google hoặc kết nối mã Token GitHub ở cột bên trái để chạy quy trình tự động hóa hạ tầng (hoặc trải nghiệm ngay chế độ Ngoại tuyến ở các mục trên).
            </p>
          )}
        </form>
      </section>

      {/* Bước 3: Tiến trình tự động hóa hạ tầng */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900">
              03. Tiến trình Tự động hóa Hạ tầng
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Theo dõi quá trình tạo thư mục Google Drive, bảng tính Google Sheets, Google Apps Script và xuất bản GitHub Pages.
            </p>
          </div>
          {draft.infra.provisionedAt && (
            <span className="text-xs text-slate-500 font-mono">
              Lần chạy cuối: {new Date(draft.infra.provisionedAt).toLocaleString('vi-VN')}
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
          {steps.map((step) => (
            <div key={step.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                {step.detail && (
                  <p className="text-xs text-slate-600 mt-1 break-words leading-relaxed">
                    {step.detail}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2 text-xs font-medium">
                {step.id === 'gas' && draft.infra.spreadsheetId && (
                  <button
                    type="button"
                    disabled={retryingGasOnly || isProvisioning}
                    onClick={handleRetryStep3GasOnly}
                    className="px-2.5 py-1.5 min-h-[32px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${retryingGasOnly ? 'animate-spin' : ''}`} />
                    <span>Thử lại Bước 03</span>
                  </button>
                )}
                {step.status === 'idle' && <span className="text-slate-400">Chờ chạy</span>}
                {step.status === 'running' && (
                  <span className="text-[#0F766E] inline-flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang xử lý
                  </span>
                )}
                {step.status === 'done' && (
                  <span className="text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Hoàn tất
                  </span>
                )}
                {step.status === 'warning' && (
                  <span className="text-amber-700">Cần thao tác</span>
                )}
                {step.status === 'error' && <span className="text-red-700">Thất bại</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Hướng dẫn chi tiết Bước 03: Google Apps Script Web App (/exec) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <HelpCircle className="w-4 h-4 text-[#0F766E] shrink-0" />
              <span>Hướng dẫn chi tiết triển khai Bước 03 (Google Apps Script /exec)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowGasGuide((v) => !v)}
              className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{showGasGuide ? 'Thu gọn hướng dẫn' : 'Xem hướng dẫn từng bước'}</span>
              {showGasGuide ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {showGasGuide && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-200 text-xs text-slate-700 leading-relaxed">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="font-bold text-slate-900">
                  Cách 1: Khắc phục lỗi khi chạy tự động
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Mở trang cài đặt người dùng:{' '}
                    <a
                      href="https://script.google.com/home/usersettings"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0F766E] font-medium hover:underline inline-flex items-center gap-0.5"
                    >
                      script.google.com/home/usersettings
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    , kiểm tra góc phải xem có <strong>đúng tài khoản Gmail</strong> vừa đăng nhập HKDVN hay không rồi bật <strong>Google Apps Script API</strong> sang <strong>Bật (On)</strong>.
                  </li>
                  <li>
                    Nếu bạn là quản trị dự án Google Cloud, kiểm tra API đã được bật tại{' '}
                    <a
                      href="https://console.cloud.google.com/apis/library/script.googleapis.com?project=gen-lang-client-0544945813"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0F766E] font-medium hover:underline inline-flex items-center gap-0.5"
                    >
                      Thư viện API Apps Script
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    .
                  </li>
                  <li>
                    Chờ <strong>2–3 phút</strong> để Google cập nhật trên hệ thống, sau đó bấm <strong>Đăng xuất</strong> rồi <strong>Đăng nhập bằng Google</strong> lại ở Bước 02 và bấm nút <strong>Thử lại Bước 03</strong> ở trên (không tạo trùng Google Sheet).
                  </li>
                </ol>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="font-bold text-slate-900">
                  Cách 2: Dán mã thủ công từ Google Sheet (luôn thành công)
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Mở Google Sheet cửa hàng vừa tạo ở liên kết bên dưới (hoặc tìm tệp trong thư mục <span className="font-mono">QuanLyCuaHang_Data</span> trên Drive).
                  </li>
                  <li>
                    Trên thanh công cụ Google Sheet, chọn <strong>Tiện ích mở rộng → Apps Script</strong>.
                  </li>
                  <li>
                    Bấm nút <strong>Sao chép mã Code.gs</strong> ngay bên dưới, xóa hết mã mẫu trong trình soạn thảo, dán vào và bấm lưu (<strong>Ctrl + S</strong>).
                  </li>
                  <li>
                    Chọn <strong>Triển khai → Tùy chọn triển khai mới → Ứng dụng web</strong>; mục <em>Thực thi với tư cách</em> chọn <strong>Tôi</strong>, mục <em>Ai có quyền truy cập</em> chọn <strong>Bất kỳ ai</strong> → bấm <strong>Triển khai</strong>.
                  </li>
                  <li>
                    Sao chép đường dẫn ứng dụng web có đuôi <span className="font-mono">/exec</span>, dán vào ô nhập bên dưới và bấm <strong>Lưu đường dẫn</strong>.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Liên kết đã tạo & ô nhập đường dẫn Apps Script */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-slate-900">Liên kết hạ tầng đã tạo</p>
            <div className="space-y-1.5 text-xs">
              {draft.infra.spreadsheetUrl ? (
                <a
                  href={draft.infra.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#0F766E] hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở Google Sheet dữ liệu cửa hàng
                </a>
              ) : (
                <p className="text-slate-500">Google Sheet: chưa khởi tạo</p>
              )}

              {draft.infra.githubPagesUrl ? (
                <a
                  href={draft.infra.githubPagesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#0F766E] hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở trang cửa hàng GitHub Pages: {draft.infra.githubPagesUrl}
                </a>
              ) : (
                <p className="text-slate-500">GitHub Pages: chưa xuất bản</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-900">
                Đường dẫn API Google Apps Script (/exec)
              </label>
              <button
                type="button"
                onClick={handleCopyGasCode}
                className="text-xs font-medium text-[#0F766E] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedCode ? 'Đã sao chép mã Code.gs' : 'Sao chép mã Code.gs'}</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={manualGasInput}
                onChange={(e) => setManualGasInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-w-0 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
              <button
                type="button"
                onClick={handleSaveManualGasUrl}
                className="px-3 py-2 min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
              >
                Lưu đường dẫn
              </button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmProvisionOpen}
        title="Xác nhận khởi tạo hạ tầng trên tài khoản của bạn"
        description="Hệ thống sẽ tự động tạo các tài nguyên sau trên tài khoản Google Workspace và GitHub bạn đã kết nối:"
        affectedItems={
          affectedSummary.length > 0
            ? affectedSummary
            : ['Lưu cấu hình hạ tầng vào bộ nhớ trình duyệt (IndexedDB)']
        }
        confirmLabel="Bắt đầu khởi tạo"
        onConfirm={runProvisioning}
        onCancel={() => setConfirmProvisionOpen(false)}
      />
    </div>
  );
};

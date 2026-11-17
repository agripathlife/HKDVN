import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderGit2,
  Loader2,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { BusinessModel, ProductItem, ShopConfig } from '../types';
import { HERO_IMAGE_PATH } from '../utils/db';
import { VIETNAM_BANKS } from '../utils/vietqr';
import {
  GitHubUser,
  provisionGitHubStorefront,
  verifyGitHubToken,
} from '../services/githubSync';
import { ConfirmDialog } from './ConfirmDialog';

interface PortalViewProps {
  config: ShopConfig;
  products: ProductItem[];
  githubToken: string;
  githubUser: GitHubUser | null;
  onUpdateConfig: (next: ShopConfig) => Promise<void>;
  onGitHubAuthChange: (token: string, user: GitHubUser | null) => void;
  onOpenStorefront: () => void;
  onOpenOperations: () => void;
}

export const PortalView: React.FC<PortalViewProps> = ({
  config,
  products,
  githubToken,
  githubUser,
  onUpdateConfig,
  onGitHubAuthChange,
  onOpenStorefront,
  onOpenOperations,
}) => {
  const [draft, setDraft] = useState<ShopConfig>(config);
  const [patInput, setPatInput] = useState(githubToken);
  const [repoName, setRepoName] = useState(config.infra.githubRepo || 'hkdvn-shop');
  const [ghError, setGhError] = useState<string | null>(null);
  const [verifyingGh, setVerifyingGh] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [transferGhToken, setTransferGhToken] = useState(true);

  const [confirmProvisionOpen, setConfirmProvisionOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [provisionDetail, setProvisionDetail] = useState<string>('');

  useEffect(() => {
    setPatInput(githubToken);
  }, [githubToken]);

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

  const runProvisioning = async () => {
    setConfirmProvisionOpen(false);
    setIsProvisioning(true);
    setProvisionStatus('running');
    setProvisionDetail('Đang tạo kho lưu trữ, nén ảnh WebP và xuất bản giao diện cửa hàng lên GitHub Pages...');

    try {
      const modelProducts = products.filter((p) => p.model === draft.model);
      const ghRes = await provisionGitHubStorefront(
        githubToken,
        repoName,
        draft,
        modelProducts
      );
      const updatedConfig: ShopConfig = {
        ...draft,
        infra: {
          ...draft.infra,
          githubOwner: ghRes.owner,
          githubRepo: ghRes.repo,
          githubPagesUrl: ghRes.pagesUrl,
          provisionedAt: new Date().toISOString(),
        },
      };
      setDraft(updatedConfig);
      await onUpdateConfig(updatedConfig);
      setProvisionStatus('done');
      setProvisionDetail(`Đã xuất bản hoàn tất lên ${ghRes.pagesUrl}`);
    } catch (err) {
      setProvisionStatus('error');
      setProvisionDetail(
        err instanceof Error ? err.message : 'Lỗi trong quá trình khởi tạo cửa hàng trên GitHub Pages.'
      );
    } finally {
      setIsProvisioning(false);
    }
  };

  const tenantAdminHref =
    draft.infra.githubPagesUrl
      ? transferGhToken && githubToken
        ? `${draft.infra.githubPagesUrl}admin.html#gh_token=${encodeURIComponent(githubToken)}`
        : `${draft.infra.githubPagesUrl}admin.html`
      : '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-6 sm:p-10">
          <div>
            <p className="text-xs font-medium text-[#0F766E] tracking-wide">
              Cổng khởi tạo gian hàng · Bàn giao độc lập hoàn toàn cho chủ quán
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-[42px] font-display font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
              Khởi tạo cửa hàng bán lẻ &amp; F&amp;B trên hạ tầng riêng của bạn
            </h1>
            <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
              Cổng khởi tạo chỉ giúp bạn xuất bản website cửa hàng &amp; trang quản lý lên GitHub Pages cá nhân. Sau khi mở trang quản lý mới, bạn sẽ tự đăng nhập Google, tạo Google Sheet, Apps Script và vận hành hoàn toàn độc lập.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenStorefront}
              className="px-5 py-3 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Xem thử Giao diện Khách
            </button>
            <button
              type="button"
              onClick={onOpenOperations}
              className="px-5 py-3 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {draft.model === BusinessModel.RETAIL
                ? 'Xem thử POS Bán hàng'
                : 'Xem thử Bếp & Thu ngân'}
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

      {/* Kiến trúc tách bạch */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderGit2 className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>1. Tạo trang trên GitHub</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Xuất bản sẵn trang Khách hàng (`index.html`) và trang Quản lý (`admin.html`) lên GitHub Pages của bạn.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShoppingBag className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>2. Quản trị SP tại trang Quản lý</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Đóng gói sẵn sản phẩm mẫu &amp; ảnh WebP; sau khi xuất bản, thêm/sửa/quét mã SKU sản phẩm ngay trong tab Sản phẩm của `admin.html`.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Cloud className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>3. Cài đặt tại trang Quản lý</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Đăng nhập Google, khởi tạo Drive / Sheets / Apps Script và quản lý Token ngay trong mục Cài đặt của `admin.html`.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Database className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>4. Độc lập hoàn toàn</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Sau khi khởi tạo xong, cửa hàng vận hành 100% trên tên miền riêng, không còn liên hệ với Cổng khởi tạo.
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
            Chọn đúng mô hình trước khi xuất bản mã nguồn lên GitHub Pages của bạn.
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
                {draft.model === BusinessModel.RETAIL ? 'Đang chọn' : 'Chọn mô hình này'}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              Mô hình 1: Cửa hàng Bán lẻ / Tạp hóa / Mang đi
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Tập trung tra cứu giá không dấu, giỏ hàng mang đi, POS tính tiền nhanh và tạo mã VietQR.
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
                {draft.model === BusinessModel.FNB ? 'Đang chọn' : 'Chọn mô hình này'}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              Mô hình 2: Dịch vụ Ăn uống / Tại chỗ (F&amp;B)
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Thực đơn QR tại bàn (?ban=X) tối ưu cho điện thoại, khách gọi món / thanh toán / hỗ trợ, báo chuông tức thời tại trang Quản lý.
            </p>
          </button>
        </div>
      </section>

      {/* Bước 2: Thông tin quán & GitHub */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold text-slate-900">
              02. Kết nối GitHub Pages
            </h2>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=HKDVN%20Storefront"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#0F766E] hover:underline inline-flex items-center gap-1"
            >
              <span>Tạo Token</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Nhập mã GitHub Token (quyền <span className="font-mono">repo</span>) để tạo kho lưu trữ chứa trang cửa hàng độc lập của bạn. Việc kết nối Google Drive, Google Sheets và Apps Script sẽ thực hiện trong mục <strong>Cài đặt</strong> của trang quản lý mới.
          </p>

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

          {(githubUser || githubToken) && (
            <div className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              {githubUser ? (
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
                    <p className="text-[11px] text-emerald-700">Đã lưu cục bộ trên máy này</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 truncate">Đã lưu Token GitHub cục bộ</p>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  aria-label="Tên kho lưu trữ GitHub"
                  className="w-28 px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-md bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPatInput('');
                    onGitHubAuthChange('', null);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-md cursor-pointer"
                >
                  Xóa
                </button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Token GitHub được lưu cục bộ trên trình duyệt máy này (IndexedDB) để không phải nhập lại sau khi tải lại trang.
          </p>
          {ghError && <p className="text-xs text-red-700">{ghError}</p>}
        </div>

        <form
          onSubmit={handleSaveShopInfo}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900">
                Thông tin cửa hàng &amp; VietQR ban đầu
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Có thể chỉnh sửa lại bất kỳ lúc nào trong tab Cài đặt của trang Quản lý.
              </p>
            </div>
            {savedNotice && (
              <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Đã lưu
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
                Số điện thoại / Zalo
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
              {savingConfig ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>

            <button
              type="button"
              disabled={isProvisioning || !githubToken || !githubUser}
              onClick={() => setConfirmProvisionOpen(true)}
              className="px-5 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-2"
            >
              {isProvisioning && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isProvisioning
                  ? 'Đang tạo cửa hàng...'
                  : 'Tạo & Xuất bản cửa hàng lên GitHub Pages'}
              </span>
            </button>
          </div>
          {(!githubToken || !githubUser) && (
            <p className="text-xs text-slate-500">
              Vui lòng nhập và bấm Kết nối GitHub Token ở cột bên trái để xuất bản cửa hàng độc lập.
            </p>
          )}
        </form>
      </section>

      {/* Kết quả xuất bản & Chuyển giao sang trang quản lý mới */}
      {(provisionStatus !== 'idle' || draft.infra.githubPagesUrl) && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          {provisionStatus !== 'idle' && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                provisionStatus === 'running'
                  ? 'bg-teal-50 border-teal-200 text-[#0F766E]'
                  : provisionStatus === 'done'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {provisionStatus === 'running' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              {provisionStatus === 'done' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{provisionDetail}</span>
            </div>
          )}

          {draft.infra.githubPagesUrl && (
            <div className="p-5 bg-teal-50/70 border border-[#0F766E]/30 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-900">
                  Cửa hàng mới đã sẵn sàng · Vận hành độc lập khỏi Cổng khởi tạo
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Hãy chuyển sang <strong>Trang Quản lý Cửa hàng</strong> và mở mục <strong>Cài đặt</strong> để đăng nhập Google, khởi tạo Google Sheets + Google Apps Script đồng bộ đơn hàng (lần đầu GitHub Pages cần 30–60 giây để xuất bản).
                </p>
                {githubToken && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={transferGhToken}
                      onChange={(e) => setTransferGhToken(e.target.checked)}
                      className="w-4 h-4 accent-[#0F766E] rounded"
                    />
                    <span>
                      Tự động chuyển giao GitHub Token sang trang quản lý mới (lưu cục bộ &amp; xóa khỏi thanh địa chỉ)
                    </span>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <a
                  href={tenantAdminHref}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 min-h-[42px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở Trang Quản lý Cửa hàng (admin.html)</span>
                </a>
                <a
                  href={draft.infra.githubPagesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 min-h-[42px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Mở Trang Khách hàng</span>
                </a>
              </div>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmProvisionOpen}
        title="Xác nhận tạo & xuất bản cửa hàng lên GitHub Pages"
        description="Hệ thống sẽ thực hiện các thao tác sau trên tài khoản GitHub của bạn:"
        affectedItems={[
          `Tạo hoặc cập nhật kho lưu trữ "${githubUser?.login || 'user'}/${repoName}"`,
          'Tải ảnh sản phẩm đã nén WebP vào thư mục assets/img/',
          'Xuất bản config.json, products.json, trang khách (index.html) và trang quản lý (admin.html)',
        ]}
        confirmLabel="Xuất bản ngay"
        onConfirm={runProvisioning}
        onCancel={() => setConfirmProvisionOpen(false)}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Check, Copy, QrCode, X } from 'lucide-react';
import { BankInfo, PaymentMethod } from '../types';
import { formatVND } from '../utils/vietnamese';
import { buildVietQRPayload, renderQRCodeDataUrl } from '../utils/vietqr';

interface VietQRModalProps {
  open: boolean;
  title: string;
  amount: number;
  description: string;
  bank: BankInfo;
  allowCashOption?: boolean;
  confirmLabel?: string;
  onConfirmPayment?: (method: PaymentMethod) => void;
  onClose: () => void;
}

export const VietQRModal: React.FC<VietQRModalProps> = ({
  open,
  title,
  amount,
  description,
  bank,
  allowCashOption = false,
  confirmLabel = 'Xác nhận đã thanh toán',
  onConfirmPayment,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [cashReceived, setCashReceived] = useState<string>(String(amount || 0));

  useEffect(() => {
    setCashReceived(String(amount || 0));
  }, [amount, open]);

  useEffect(() => {
    if (!open) return;
    const payload = buildVietQRPayload({
      bankBin: bank.bankBin,
      accountNumber: bank.accountNumber,
      amount,
      description,
    });
    renderQRCodeDataUrl(payload, 280)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [open, bank.bankBin, bank.accountNumber, amount, description]);

  if (!open) return null;

  const copyValue = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const cashNum = Number(cashReceived) || 0;
  const changeAmount = Math.max(0, cashNum - amount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Chuẩn chuyển khoản nhanh VietQR · NAPAS 247</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Đóng cửa sổ thanh toán"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          <div className="p-3 bg-white border border-slate-200 rounded-xl">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Mã VietQR thanh toán ${formatVND(amount)}`}
                className="w-56 h-56 object-contain"
              />
            ) : (
              <div className="w-56 h-56 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg">
                <QrCode className="w-10 h-10 mb-2" />
                <span className="text-xs">Đang tạo mã VietQR...</span>
              </div>
            )}
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-slate-500">Số tiền cần thanh toán</p>
            <p className="text-3xl font-bold text-[#0F766E] font-mono tabular-nums mt-0.5">
              {formatVND(amount)}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-b border-slate-100 py-3.5 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Ngân hàng</span>
            <span className="font-semibold text-slate-900">{bank.bankShortName}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Số tài khoản</span>
            <button
              type="button"
              onClick={() => copyValue('acc', bank.accountNumber)}
              className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-900 hover:text-[#0F766E]"
            >
              <span>{bank.accountNumber}</span>
              {copiedField === 'acc' ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Chủ tài khoản</span>
            <span className="font-medium text-slate-900">{bank.accountName}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Nội dung CK</span>
            <button
              type="button"
              onClick={() => copyValue('desc', description)}
              className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-slate-800 hover:text-[#0F766E]"
            >
              <span>{description}</span>
              {copiedField === 'desc' ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {allowCashOption && (
          <div className="mt-4 space-y-2">
            <label className="block text-xs font-medium text-slate-600">
              Tính tiền thừa nếu khách trả tiền mặt (VNĐ)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                step={1000}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
              />
              <div className="text-right">
                <p className="text-xs text-slate-500">Tiền thừa</p>
                <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
                  {formatVND(changeAmount)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {onConfirmPayment && (
            <>
              <button
                type="button"
                onClick={() => onConfirmPayment(PaymentMethod.VIETQR)}
                className="flex-1 px-4 py-2.5 min-h-[44px] bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                {confirmLabel} (QR)
              </button>
              {allowCashOption && (
                <button
                  type="button"
                  onClick={() => onConfirmPayment(PaymentMethod.CASH)}
                  className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Thu tiền mặt
                </button>
              )}
            </>
          )}
          {!onConfirmPayment && (
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

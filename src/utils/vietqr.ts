import QRCode from 'qrcode';

export interface BankOption {
  bin: string;
  shortName: string;
  fullName: string;
}

export const VIETNAM_BANKS: BankOption[] = [
  { bin: '970436', shortName: 'Vietcombank', fullName: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970407', shortName: 'Techcombank', fullName: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', shortName: 'MBBank', fullName: 'Ngân hàng TMCP Quân đội' },
  { bin: '970418', shortName: 'BIDV', fullName: 'Ngân hàng TMCP Đầu tư và Phát triển VN' },
  { bin: '970415', shortName: 'VietinBank', fullName: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970416', shortName: 'ACB', fullName: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', shortName: 'VPBank', fullName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', shortName: 'TPBank', fullName: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', shortName: 'Sacombank', fullName: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970405', shortName: 'Agribank', fullName: 'Ngân hàng Nông nghiệp & PTNT VN' },
];

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates an EMVCo / NAPAS 247 VietQR compliant payload string.
 */
export function buildVietQRPayload(params: {
  bankBin: string;
  accountNumber: string;
  amount: number;
  description: string;
}): string {
  const cleanAccount = params.accountNumber.replace(/\s+/g, '').trim() || '0000000000';
  const cleanBin = params.bankBin.trim() || '970436';
  const cleanDesc = params.description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .slice(0, 25);

  const bankInfo = tlv('00', cleanBin) + tlv('01', cleanAccount);
  const merchantAccount =
    tlv('00', 'A000000727') +
    tlv('01', bankInfo) +
    tlv('02', 'QRIBFTTA');

  const amountStr = Math.max(0, Math.round(params.amount)).toString();
  const additionalData = cleanDesc ? tlv('08', cleanDesc) : '';

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('01', params.amount > 0 ? '12' : '11') +
    tlv('38', merchantAccount) +
    tlv('53', '704') +
    (params.amount > 0 ? tlv('54', amountStr) : '') +
    tlv('58', 'VN') +
    (additionalData ? tlv('62', additionalData) : '') +
    '6304';

  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

export async function renderQRCodeDataUrl(text: string, size = 280): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

import { ProductItem, ShopConfig } from '../types';
import {
  buildTenantAdminHTML,
  buildTenantStorefrontHTML,
} from './tenantTemplates';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function ghFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const raw = String(data?.message || '');
    const lower = raw.toLowerCase();
    if (lower.includes('bad credentials') || res.status === 401) {
      throw new Error('GitHub Token không hợp lệ hoặc đã hết hạn.');
    }
    if (lower.includes('not found') || res.status === 404) {
      throw new Error('Không tìm thấy kho lưu trữ hoặc Token chưa được cấp quyền repo.');
    }
    throw new Error(raw ? `Lỗi GitHub API: ${raw}` : `Lỗi kết nối GitHub (${res.status})`);
  }
  return data as T;
}

export async function verifyGitHubToken(token: string): Promise<GitHubUser> {
  return ghFetch<GitHubUser>('/user', token);
}

async function getExistingSha(
  token: string,
  owner: string,
  repo: string,
  filePath: string
): Promise<string | undefined> {
  try {
    const res = await ghFetch<{ sha?: string }>(
      `/repos/${owner}/${repo}/contents/${filePath}`,
      token
    );
    return res.sha;
  } catch {
    return undefined;
  }
}

export async function putRepoFileBase64(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  base64Content: string,
  message: string
): Promise<void> {
  const sha = await getExistingSha(token, owner, repo, filePath);
  await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: base64Content,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function imageUrlToWebpBase64(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:image/')) {
    const parts = imageUrl.split(',');
    return parts[1] || null;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không tải được ảnh nguồn'));
      el.src = imageUrl;
    });
    const minSide = Math.min(img.width, img.height);
    const sx = Math.floor((img.width - minSide) / 2);
    const sy = Math.floor((img.height - minSide) / 2);
    const targetSide = Math.min(minSide, 800);

    const canvas = document.createElement('canvas');
    canvas.width = targetSide;
    canvas.height = targetSide;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSide, targetSide);

    let dataUrl = canvas.toDataURL('image/webp', 0.8);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    }
    return dataUrl.split(',')[1] || null;
  } catch {
    return null;
  }
}

export async function provisionGitHubStorefront(
  token: string,
  repoName: string,
  config: ShopConfig,
  products: ProductItem[]
): Promise<{ owner: string; repo: string; pagesUrl: string; adminUrl: string }> {
  const user = await verifyGitHubToken(token);
  const owner = user.login;
  const cleanRepo = repoName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') || 'hkdvn-shop';

  let repoExists = false;
  try {
    await ghFetch(`/repos/${owner}/${cleanRepo}`, token);
    repoExists = true;
  } catch {
    repoExists = false;
  }

  if (!repoExists) {
    await ghFetch('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({
        name: cleanRepo,
        description: `HKDVN Storefront - ${config.shopName}`,
        private: false,
        auto_init: true,
      }),
    });
    await new Promise((r) => setTimeout(r, 1400));
  }

  // Convert and upload every product image into assets/img/<sku>.webp inside the new repo
  const convertedCache = new Map<string, string>();
  const sanitizedProducts = [];

  for (const p of products) {
    const safeSku = (p.sku || p.id).replace(/[^a-zA-Z0-9_-]/g, '') || p.id;
    let finalRelativeUrl = p.imageUrl;

    let base64Img = p.imageWebpBase64 || convertedCache.get(p.imageUrl) || null;
    if (!base64Img) {
      base64Img = await imageUrlToWebpBase64(p.imageUrl);
      if (base64Img) {
        convertedCache.set(p.imageUrl, base64Img);
      }
    }

    if (base64Img) {
      const repoImgPath = `assets/img/${safeSku}.webp`;
      await putRepoFileBase64(
        token,
        owner,
        cleanRepo,
        repoImgPath,
        base64Img,
        `Thêm ảnh WebP cho ${p.name}`
      );
      finalRelativeUrl = `./${repoImgPath}`;
    }

    sanitizedProducts.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
      costPrice: p.costPrice,
      category: p.category,
      unit: p.unit,
      stock: p.stock,
      status: p.status,
      imageUrl: finalRelativeUrl,
      description: p.description,
      model: p.model,
    });
  }

  const pagesUrl = `https://${owner}.github.io/${cleanRepo}/`;
  const configForTenant: ShopConfig = {
    ...config,
    infra: {
      ...config.infra,
      githubOwner: owner,
      githubRepo: cleanRepo,
      githubPagesUrl: pagesUrl,
    },
  };

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    'config.json',
    toBase64Utf8(JSON.stringify(configForTenant, null, 2)),
    'Cập nhật cấu hình cửa hàng HKDVN'
  );

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    'products.json',
    toBase64Utf8(JSON.stringify(sanitizedProducts, null, 2)),
    'Cập nhật danh mục sản phẩm HKDVN'
  );

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    'index.html',
    toBase64Utf8(buildTenantStorefrontHTML(configForTenant)),
    'Khởi tạo giao diện khách hàng độc lập'
  );

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    'admin.html',
    toBase64Utf8(buildTenantAdminHTML(configForTenant)),
    'Khởi tạo trang quản trị độc lập của chủ quán'
  );

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    '.nojekyll',
    toBase64Utf8(''),
    'Bỏ qua Jekyll trên GitHub Pages'
  );

  try {
    await ghFetch(`/repos/${owner}/${cleanRepo}/pages`, token, {
      method: 'POST',
      body: JSON.stringify({
        source: { branch: 'main', path: '/' },
      }),
    });
  } catch {
    // Pages may already be enabled on this repo
  }

  return {
    owner,
    repo: cleanRepo,
    pagesUrl,
    adminUrl: `${pagesUrl}admin.html`,
  };
}

export async function publishProductToGitHub(
  token: string,
  owner: string,
  repo: string,
  product: ProductItem,
  allProducts: ProductItem[]
): Promise<{ imagePath?: string }> {
  let imagePath: string | undefined;
  let base64Img = product.imageWebpBase64 || null;
  if (!base64Img && product.imageUrl && !product.imageUrl.startsWith('./assets/img/')) {
    base64Img = await imageUrlToWebpBase64(product.imageUrl);
  }

  if (base64Img) {
    const safeSku = (product.sku || product.id).replace(/[^a-zA-Z0-9_-]/g, '');
    imagePath = `assets/img/${safeSku}.webp`;
    await putRepoFileBase64(
      token,
      owner,
      repo,
      imagePath,
      base64Img,
      `Tải ảnh WebP sản phẩm ${product.name}`
    );
  }

  const cleanList = allProducts.map((p) => {
    const safeSku = (p.sku || p.id).replace(/[^a-zA-Z0-9_-]/g, '');
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
      costPrice: p.costPrice,
      category: p.category,
      unit: p.unit,
      stock: p.stock,
      status: p.status,
      imageUrl:
        p.id === product.id && imagePath
          ? `./${imagePath}`
          : p.imageUrl.startsWith('./')
            ? p.imageUrl
            : `./assets/img/${safeSku}.webp`,
      description: p.description,
      model: p.model,
      updatedAt: p.updatedAt,
    };
  });

  await putRepoFileBase64(
    token,
    owner,
    repo,
    'products.json',
    toBase64Utf8(JSON.stringify(cleanList, null, 2)),
    `Cập nhật sản phẩm ${product.name}`
  );

  return { imagePath };
}

export async function updateTenantConfigOnGitHub(
  token: string,
  owner: string,
  repo: string,
  config: ShopConfig
): Promise<void> {
  await putRepoFileBase64(
    token,
    owner,
    repo,
    'config.json',
    toBase64Utf8(JSON.stringify(config, null, 2)),
    'Cập nhật đường dẫn API và cấu hình cửa hàng'
  );
}


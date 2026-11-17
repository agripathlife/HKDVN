import { ProductItem, ShopConfig } from '../types';

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
    throw new Error(data?.message || `GitHub API lỗi (${res.status})`);
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

function buildStandaloneStorefrontHTML(config: ShopConfig): string {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.shopName} — Đặt hàng trực tuyến</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
  <div id="app" class="max-w-5xl mx-auto p-4 md:p-8">
    <header class="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold">${config.shopName}</h1>
        <p class="text-sm text-slate-500">${config.address} · ${config.phone}</p>
      </div>
      <span id="table-badge" class="text-sm font-semibold text-teal-700"></span>
    </header>
    <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></div>
  </div>
  <script>
    (async function() {
      const params = new URLSearchParams(location.search);
      const ban = params.get('ban');
      if (ban) document.getElementById('table-badge').textContent = 'Bàn số ' + ban;
      const [cfg, prods] = await Promise.all([
        fetch('./config.json').then(r => r.json()),
        fetch('./products.json').then(r => r.json())
      ]);
      const grid = document.getElementById('grid');
      grid.innerHTML = prods.map(p => \`
        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
            <img src="\${p.imageUrl}" alt="\${p.name}" class="w-full h-full object-cover" />
          </div>
          <div class="p-4">
            <p class="text-xs text-slate-500">\${p.category}</p>
            <h2 class="font-semibold text-base mt-1">\${p.name}</h2>
            <p class="text-teal-700 font-bold mt-2">\${new Intl.NumberFormat('vi-VN').format(p.price)}đ / \${p.unit}</p>
          </div>
        </div>
      \`).join('');
    })();
  </script>
</body>
</html>`;
}

export async function provisionGitHubStorefront(
  token: string,
  repoName: string,
  config: ShopConfig,
  products: ProductItem[]
): Promise<{ owner: string; repo: string; pagesUrl: string }> {
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
    // Allow GitHub to initialize default branch
    await new Promise((r) => setTimeout(r, 1400));
  }

  const sanitizedProducts = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    category: p.category,
    unit: p.unit,
    stock: p.stock,
    status: p.status,
    imageUrl: p.imageUrl,
    description: p.description,
    model: p.model,
  }));

  await putRepoFileBase64(
    token,
    owner,
    cleanRepo,
    'config.json',
    toBase64Utf8(JSON.stringify(config, null, 2)),
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
    toBase64Utf8(buildStandaloneStorefrontHTML(config)),
    'Khởi tạo giao diện cửa hàng GitHub Pages'
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
    pagesUrl: `https://${owner}.github.io/${cleanRepo}/`,
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
  if (product.imageWebpBase64) {
    const safeSku = (product.sku || product.id).replace(/[^a-zA-Z0-9_-]/g, '');
    imagePath = `assets/img/${safeSku}.webp`;
    await putRepoFileBase64(
      token,
      owner,
      repo,
      imagePath,
      product.imageWebpBase64,
      `Tải ảnh WebP sản phẩm ${product.name}`
    );
  }

  const cleanList = allProducts.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    category: p.category,
    unit: p.unit,
    stock: p.stock,
    status: p.status,
    imageUrl: p.id === product.id && imagePath ? `./${imagePath}` : p.imageUrl,
    description: p.description,
    model: p.model,
    updatedAt: p.updatedAt,
  }));

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

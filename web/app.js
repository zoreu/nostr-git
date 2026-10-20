const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const meChip = document.getElementById('me-chip');
const topSearch = document.getElementById('top-search');
const topSearchInput = document.getElementById('top-search-input');

let renderToken = 0;
let meCache = null;
let mePromise = null;

const ICONS = {
  repo: 'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
  code: 'M4.72 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L8.44 8 4.72 4.28a.75.75 0 0 1 0-1.06Zm5.5 0a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L13.44 8l-3.72-3.72a.75.75 0 0 1 0-1.06Z',
  commit: 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
  folder: 'M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z',
  file: 'M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z',
  branch: 'M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  copy: 'M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Zm5-5C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
  download: 'M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Zm4.5-5.81V1.75a.75.75 0 0 1 1.5 0v6.44l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 1.06-1.06Z',
  arrowLeft: 'M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z',
  terminal: 'M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM7.25 8a.75.75 0 0 1-.22.53l-2.25 2.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L5.69 8 3.72 6.03a.75.75 0 0 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53Zm1.5 1.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Z',
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[name] || ICONS.file}"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });
}

function encodePath(value) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function repoHash(npub, project, suffix = '') {
  return `#/${encodeURIComponent(npub)}/${encodeURIComponent(project)}${suffix}`;
}

function fileHash(npub, project, branch, filePath) {
  return repoHash(
    npub,
    project,
    `/blob/${encodeURIComponent(branch)}/${encodePath(filePath)}`
  );
}

function treeHash(npub, project, branch, dirPath = '') {
  const encoded = encodePath(dirPath);
  return repoHash(
    npub,
    project,
    `/tree/${encodeURIComponent(branch)}${encoded ? `/${encoded}` : ''}`
  );
}

function shortNpub(npub) {
  if (!npub) return '';
  return npub.length > 20 ? `${npub.slice(0, 10)}…${npub.slice(-4)}` : npub;
}

function shortHash(hash) {
  return String(hash || '').slice(0, 7);
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value;
  let index = -1;
  do {
    size /= 1024;
    index += 1;
  } while (size >= 1024 && index < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function relativeTime(input) {
  let date;
  if (input instanceof Date) date = input;
  else if (typeof input === 'number') date = new Date(input < 1e12 ? input * 1000 : input);
  else date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const ranges = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, value] of ranges) {
    if (Math.abs(seconds) >= value) return formatter.format(Math.round(seconds / value), unit);
  }
  return 'agora';
}

function absoluteDate(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      area.remove();
    }
  });
}

let toastTimer;
function toast(message, kind = 'ok') {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show${kind === 'err' ? ' err' : ''}`;
  toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 2800);
}

function setMe(me) {
  meCache = me;
  if (me?.npub) {
    meChip.textContent = shortNpub(me.npub);
    meChip.classList.add('is-logged');
    meChip.title = me.npub;
  } else {
    meChip.textContent = 'sem login';
    meChip.classList.remove('is-logged');
    meChip.title = 'Rode "ngit login" no terminal';
  }
}

async function getMe(force = false) {
  if (meCache && !force) return meCache;
  if (!mePromise) {
    mePromise = fetchJson('/api/me')
      .then((data) => {
        setMe(data);
        return data;
      })
      .finally(() => {
        mePromise = null;
      });
  }
  return mePromise;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error || `Erro HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function setDocumentTitle(title) {
  document.title = title ? `${title} · ngit` : 'ngit — Git no Nostr';
}

function loadingView() {
  return `
    <div class="loading">
      <div class="skeleton w40"></div>
      <div class="skeleton w70"></div>
      <div class="skeleton h80"></div>
    </div>
  `;
}

function errorView(title, message, hint = '') {
  return `
    <div class="error-page">
      <div class="error-icon">!</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${hint ? `<p>${hint}</p>` : ''}
      <a class="btn" href="#/">Voltar ao início</a>
    </div>
  `;
}

function repoAvatar() {
  return `<span class="repo-avatar">${icon('repo')}</span>`;
}

function repoCard(repo) {
  return `
    <a class="repo-card" href="${repoHash(repo.npub, repo.project)}">
      <div class="repo-card-top">
        ${repoAvatar()}
        <div class="repo-card-name">
          <strong>${escapeHtml(repo.name || repo.project)}</strong>
          <span>${escapeHtml(shortNpub(repo.npub))}</span>
        </div>
      </div>
      <p class="repo-card-desc">${escapeHtml(repo.description || 'Sem descrição.')}</p>
      <div class="repo-card-meta">
        <span>${escapeHtml(relativeTime(repo.updatedAt))}</span>
        <span>Nostr + Blossom</span>
      </div>
    </a>
  `;
}

function repoGrid(repos) {
  return `<div class="repo-grid">${repos.map((repo) => repoCard(repo)).join('')}</div>`;
}

function emptyRepos(title, command) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${command}</span>
    </div>
  `;
}

function steps() {
  return `
    <div class="steps">
      <div class="step">
        <span class="step-num">1</span>
        <strong>Crie sua identidade</strong>
        <span>Gere um par de chaves com <code>ngit login --generate</code>.</span>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <strong>Versione normalmente</strong>
        <span><code>ngit init</code>, <code>ngit add .</code> e <code>ngit commit</code> usam Git de verdade.</span>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <strong>Publique no Nostr</strong>
        <span><code>ngit push</code> envia os arquivos ao Blossom e as referências aos relays.</span>
      </div>
    </div>
  `;
}

async function renderHome(token) {
  setDocumentTitle('');
  app.innerHTML = loadingView();
  const [me, explore] = await Promise.all([getMe(), fetchJson('/api/explore')]);
  if (token !== renderToken) return;

  let own = { repos: [] };
  if (me.npub) {
    own = await fetchJson(`/api/repos?author=${encodeURIComponent(me.npub)}&limit=24`);
    if (token !== renderToken) return;
  }

  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow"><span class="eyebrow-dot"></span> protocolo aberto · sem servidor central</span>
        <h1>Seu código no <span>Nostr</span>, com a força do Git.</h1>
        <p>
          Publique repositórios usando relays Nostr para as referências e Blossom para os
          arquivos. Qualquer pessoa com o seu npub pode clonar, auditar e navegar.
        </p>
        <form class="hero-search" data-search>
          <input name="target" type="search" placeholder="npub1.../meu-projeto" aria-label="Repositório" spellcheck="false" />
          <button class="btn btn-primary btn-lg" type="submit">Abrir repositório</button>
        </form>
        <div class="search-hint">Instale com npm install -g nostr-git · clone com ngit clone npub.../projeto</div>
      </div>
      <aside class="hero-panel" aria-label="Exemplo de uso">
        <div class="hero-panel-head"><i></i><i></i><i></i><span>ngit</span></div>
        <pre><span class="code-dim">$</span> npm install -g nostr-git
<span class="code-dim">$</span> ngit login --generate
<span class="code-green">✓</span> login realizado
<span class="code-dim">$</span> ngit init
<span class="code-dim">$</span> ngit add .
<span class="code-dim">$</span> ngit commit -m <span class="code-blue">"primeiro commit"</span>
<span class="code-dim">$</span> ngit push
<span class="code-purple">To</span> nostr://npub1.../projeto
<span class="code-green">✓</span> publicado nos relays</pre>
      </aside>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Seus repositórios</h2>
        <p>${me.npub ? escapeHtml(shortNpub(me.npub)) : 'entre com ngit login para ver sua identidade'}</p>
      </div>
      ${
        me.npub
          ? own.repos.length
            ? repoGrid(own.repos)
            : emptyRepos(
                'Nenhum repositório publicado com esta identidade.',
                'Rode <code>ngit push</code> dentro de um projeto para publicar.'
              )
          : emptyRepos(
              'Nenhuma identidade conectada.',
              'No terminal, rode <code>ngit login</code> ou <code>ngit login --generate</code>.'
            )
      }
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Repositórios recentes</h2>
        <p>anúncios Nostr descobertos nos relays configurados</p>
      </div>
      ${
        explore.repos.length
          ? repoGrid(explore.repos)
          : emptyRepos(
              'Nenhum repositório encontrado nos relays.',
              'Os relays configurados podem estar vazios ou indisponíveis.'
            )
      }
    </section>

    ${steps()}
  `;
}

async function renderExplore(token) {
  setDocumentTitle('Explorar');
  app.innerHTML = loadingView();
  await getMe();
  const data = await fetchJson('/api/explore?limit=48');
  if (token !== renderToken) return;

  app.innerHTML = `
    <div class="page-title">
      <h1>Explorar repositórios</h1>
      <p>Repositórios Git anunciados publicamente nos relays Nostr configurados.</p>
    </div>
    ${
      data.repos.length
        ? repoGrid(data.repos)
        : emptyRepos(
            'Nenhum repositório encontrado.',
            'Publique o primeiro com <code>ngit push</code> ou ajuste os relays com <code>NGIT_RELAYS</code>.'
          )
    }
  `;
}

function repoHeader(data, active) {
  const { repo, manifest } = data;
  return `
    <div class="repo-head">
      <div>
        <div class="repo-title-row">
          <span class="repo-title-icon">${icon('repo')}</span>
          <h1 class="repo-title">
            <span class="repo-owner">${escapeHtml(shortNpub(repo.npub))}</span>
            <span>/</span>
            <strong>${escapeHtml(repo.name || repo.project)}</strong>
            <span class="badge">Público</span>
          </h1>
        </div>
        ${repo.description ? `<p class="repo-desc">${escapeHtml(repo.description)}</p>` : ''}
      </div>
      <div class="repo-actions">
        <button class="btn" data-copy="${escapeHtml(`ngit clone ${repo.npub}/${repo.project}`)}">
          ${icon('copy')} Copiar clone
        </button>
        <a class="btn" href="${repoHash(repo.npub, repo.project)}">
          ${icon('code')} Código
        </a>
      </div>
    </div>
    <nav class="repo-tabs" aria-label="Seções do repositório">
      <a class="repo-tab ${active === 'code' ? 'active' : ''}" href="${repoHash(repo.npub, repo.project)}">
        ${icon('code')} Código
      </a>
      <a class="repo-tab ${active === 'commits' ? 'active' : ''}" href="${repoHash(repo.npub, repo.project, '/commits')}">
        ${icon('commit')} Commits <span class="tab-count">${manifest.commits.length}</span>
      </a>
    </nav>
  `;
}

function latestCommitBar(data) {
  const commit = data.manifest.commits[0];
  if (!commit) return '';
  return `
    <div class="commit-bar">
      <span class="avatar" title="${escapeHtml(commit.authorName || '')}">${escapeHtml(initials(commit.authorName))}</span>
      <div class="commit-main">
        <span class="author">${escapeHtml(commit.authorName || 'anônimo')}</span>
        <span class="subject">${escapeHtml(commit.subject || 'sem mensagem')}</span>
      </div>
      <div class="commit-meta">
        <a href="${repoHash(data.repo.npub, data.repo.project, '/commits')}" title="${escapeHtml(commit.hash)}">
          ${escapeHtml(shortHash(commit.hash))}
        </a>
        <button type="button" class="hash-copy hash-copy-icon" data-copy="${escapeHtml(commit.hash)}"
          title="Copiar hash completo: ${escapeHtml(commit.hash)}">
          ${icon('copy')}
        </button>
        <span title="${escapeHtml(absoluteDate(commit.date))}">${escapeHtml(relativeTime(commit.date))}</span>
        <span>${data.manifest.stats.files} arquivo(s)</span>
      </div>
    </div>
  `;
}

function branchToolbar(data, extra = '') {
  return `
    <div class="toolbar">
      <span class="branch-chip">${icon('branch')} ${escapeHtml(data.repo.defaultBranch || 'main')}</span>
      <div class="toolbar-right">${extra}</div>
    </div>
  `;
}

function collectDirectory(files, currentPath) {
  const prefix = currentPath ? `${currentPath}/` : '';
  const dirs = new Set();
  const fileMap = new Map();

  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      fileMap.set(rest, file);
    } else {
      dirs.add(rest.slice(0, slash));
    }
  }

  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)),
    files: [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function breadcrumbs(data, currentPath = '', { lastAsText = false } = {}) {
  const branch = data.repo.defaultBranch || 'main';
  const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
  let accumulated = '';
  const links = parts.map((part, index) => {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    if (lastAsText && index === parts.length - 1) {
      return `<span>${escapeHtml(part)}</span>`;
    }
    return `<a href="${treeHash(data.repo.npub, data.repo.project, branch, accumulated)}">${escapeHtml(part)}</a>`;
  });
  return `<a href="${repoHash(data.repo.npub, data.repo.project)}">${escapeHtml(data.repo.project)}</a>${
    links.length ? `<span class="sep">/</span>${links.join('<span class="sep">/</span>')}` : ''
  }`;
}

function treeView(data, currentPath) {
  const branch = data.repo.defaultBranch || 'main';
  const { dirs, files } = collectDirectory(data.manifest.tree, currentPath);

  const rows = [];
  if (currentPath) {
    const parent = currentPath.split('/').slice(0, -1).join('/');
    rows.push(`
      <a class="file-row is-dir" href="${treeHash(data.repo.npub, data.repo.project, branch, parent)}">
        <span class="file-row-name">${icon('arrowLeft', 'file-icon')}<span>..</span></span>
      </a>
    `);
  }
  for (const dir of dirs) {
    const dirPath = currentPath ? `${currentPath}/${dir}` : dir;
    rows.push(`
      <a class="file-row is-dir" href="${treeHash(data.repo.npub, data.repo.project, branch, dirPath)}">
        <span class="file-row-name">${icon('folder', 'file-icon')}<span>${escapeHtml(dir)}</span></span>
        <span class="file-row-size"></span>
      </a>
    `);
  }
  for (const file of files) {
    rows.push(`
      <a class="file-row" href="${fileHash(data.repo.npub, data.repo.project, branch, file.path)}">
        <span class="file-row-name">${icon('file', 'file-icon')}<span>${escapeHtml(file.path.split('/').pop())}</span></span>
        <span class="file-row-size">${formatBytes(file.size)}</span>
      </a>
    `);
  }

  if (rows.length === 0) {
    rows.push('<div class="empty-state"><strong>Diretório vazio</strong><span>Nenhum arquivo aqui.</span></div>');
  }

  return `
    <div class="explorer">
      <div class="explorer-head">
        <div class="breadcrumbs">${breadcrumbs(data, currentPath)}</div>
        <span>${dirs.length + files.length} item(ns)</span>
      </div>
      ${rows.join('')}
    </div>
  `;
}

function readmeView(data) {
  if (!data.repo.readme) return '';
  return `
    <section class="readme">
      <div class="readme-head">${icon('file')} ${escapeHtml(data.repo.readme.path)}</div>
      <div class="readme-body markdown">${renderMarkdown(data.repo.readme.content)}</div>
    </section>
  `;
}

function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;

  const inline = (text) => {
    const codes = [];
    let value = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
      codes.push(`<code>${code}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    value = value
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
        const safe = /^(https?:\/\/|\/)/i.test(url) ? url : '';
        return safe ? `<img src="${safe}" alt="${alt}" loading="lazy" />` : alt;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        const safe = /^(https?:\/\/|#|\/|\.\/|\.\.\/)/i.test(url) ? url : '#';
        const external = /^https?:\/\//i.test(safe);
        return `<a href="${safe}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    value = value.replace(/\u0000(\d+)\u0000/g, (_, number) => codes[Number(number)] || '');
    return value;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (/^```/.test(line)) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      output.push('<hr />');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
        index += 1;
      }
      output.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      output.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    output.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br />')}</p>`);
  }

  return output.join('\n');
}

function fileView(data, file) {
  const isImage = /^image\//.test(file.mime || '') && file.mime !== 'image/svg+xml';
  const downloadUrl = `${file.rawUrl}${file.rawUrl.includes('?') ? '&' : '?'}download=1`;
  let body;

  if (file.text) {
    const lines = String(file.content || '').split('\n');
    const gutter = lines.map((_, number) => number + 1).join('\n');
    body = `
      <div class="code-view">
        <pre class="code-gutter">${gutter}</pre>
        <pre class="code-content"><code>${escapeHtml(file.content || '')}</code></pre>
      </div>
    `;
  } else if (isImage) {
    body = `<div class="image-view"><img src="${file.rawUrl}" alt="${escapeHtml(file.path)}" /></div>`;
  } else {
    body = `
      <div class="binary-view">
        <strong>Pré-visualização não disponível</strong>
        <span>${escapeHtml(file.mime || 'arquivo binário')} · ${formatBytes(file.size)}</span>
        <a class="btn" href="${downloadUrl}">${icon('download')} Baixar arquivo</a>
      </div>
    `;
  }

  return `
    <div class="file-view-head">
      <div class="breadcrumbs">${breadcrumbs(data, file.path, { lastAsText: true })}</div>
      <div class="file-view-actions">
        <a class="btn" href="${file.rawUrl}" target="_blank" rel="noopener">${icon('file')} Raw</a>
        <a class="btn" href="${downloadUrl}">${icon('download')} Baixar</a>
      </div>
    </div>
    ${body}
  `;
}

function commitsView(data) {
  const rows = data.manifest.commits.map((commit) => `
    <article class="commit-row">
      <div>
        <div class="commit-subject">${escapeHtml(commit.subject || 'sem mensagem')}</div>
        <div class="commit-byline">
          <span class="avatar sm">${escapeHtml(initials(commit.authorName))}</span>
          <span>${escapeHtml(commit.authorName || 'anônimo')}</span>
          <span>·</span>
          <span title="${escapeHtml(absoluteDate(commit.date))}">${escapeHtml(relativeTime(commit.date))}</span>
          <span>·</span>
          <span>${commit.parents.length > 0 ? `${commit.parents.length} pai(s)` : 'commit raiz'}</span>
        </div>
      </div>
      <div class="commit-side">
        <button type="button" class="hash-copy" data-copy="${escapeHtml(commit.hash)}"
          title="Copiar hash completo: ${escapeHtml(commit.hash)}">
          ${icon('copy')} ${escapeHtml(shortHash(commit.hash))}
        </button>
      </div>
    </article>
  `).join('');

  return `
    <div class="toolbar">
      <span class="branch-chip">${icon('branch')} ${escapeHtml(data.repo.defaultBranch || 'main')}</span>
      <div class="toolbar-right">${data.manifest.commits.length} commit(s) no manifesto</div>
    </div>
    ${versionsBar(data)}
    <div class="commits-list">
      ${rows || '<div class="empty-state"><strong>Nenhum commit</strong><span>Este repositório ainda não tem histórico.</span></div>'}
    </div>
  `;
}

function versionsBar(data) {
  const versions = data.manifest.versions || [];
  if (!versions.length) return '';
  const chips = versions.map((version) => `
    <button type="button" class="branch-chip version-chip"
      data-copy="${escapeHtml(`ngit version switch ${version.name}`)}"
      title="Copiar: ngit version switch ${escapeHtml(version.name)} (${escapeHtml(version.commit || '')})">
      ${icon('copy')} ${escapeHtml(version.name)}
      <span class="version-hash">${escapeHtml(shortHash(version.commit))}</span>
    </button>
  `).join('');
  return `
    <div class="toolbar versions-toolbar">
      ${chips}
      <div class="toolbar-right">clique para copiar o comando de troca</div>
    </div>
  `;
}

async function renderRepo(route, token) {
  const { npub, project } = route;
  const base = `/api/repo/${encodeURIComponent(npub)}/${encodeURIComponent(project)}`;
  const fileEndpoint =
    route.view === 'blob' && route.path
      ? `/api/file/${encodeURIComponent(npub)}/${encodeURIComponent(project)}?path=${encodeURIComponent(route.path)}`
      : null;

  app.innerHTML = loadingView();
  const [data, file] = await Promise.all([
    fetchJson(base),
    fileEndpoint ? fetchJson(fileEndpoint) : Promise.resolve(null),
  ]);
  if (token !== renderToken) return;

  setDocumentTitle(`${data.repo.name || project}`);
  const active = route.view === 'commits' ? 'commits' : 'code';
  let content;

  if (route.view === 'commits') {
    content = commitsView(data);
  } else if (route.view === 'blob') {
    content = `
      ${branchToolbar(data)}
      ${latestCommitBar(data)}
      ${fileView(data, file)}
    `;
  } else {
    content = `
      ${branchToolbar(data, `<span>${data.manifest.stats.files} arquivo(s) · ${formatBytes(data.manifest.stats.bytes)}</span>`)}
      ${latestCommitBar(data)}
      ${treeView(data, route.path || '')}
      ${route.path ? '' : readmeView(data)}
    `;
  }

  app.innerHTML = `
    ${repoHeader(data, active)}
    ${content}
  `;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  let parts;
  try {
    parts = raw.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { name: 'error', message: 'URL inválida.' };
  }

  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'explore') return { name: 'explore' };

  const npub = parts[0];
  const project = parts[1];
  if (!project) return { name: 'error', message: 'Informe a identidade e o projeto na URL.' };

  if (parts[2] === 'commits') {
    return { name: 'repo', npub, project, view: 'commits' };
  }

  if (parts[2] === 'tree' || parts[2] === 'blob') {
    const branch = parts[3] || 'main';
    const filePath = parts.slice(4).join('/');
    return {
      name: 'repo',
      npub,
      project,
      view: parts[2],
      branch,
      path: filePath,
    };
  }

  return { name: 'repo', npub, project, view: 'code', path: '' };
}

async function renderRoute() {
  const token = ++renderToken;
  const route = parseHash();

  try {
    if (route.name === 'home') {
      await renderHome(token);
      return;
    }

    if (route.name === 'explore') {
      await renderExplore(token);
      return;
    }

    if (route.name === 'repo') {
      if (route.npub) topSearchInput.value = `${route.npub}/${route.project}`;
      await renderRepo(route, token);
      return;
    }

    if (route.name === 'error') {
      app.innerHTML = errorView('URL inválida', route.message);
      return;
    }
  } catch (error) {
    if (token !== renderToken) return;
    const notFound = error.status === 404;
    const isFile = route.name === 'repo' && route.view === 'blob';
    app.innerHTML = errorView(
      notFound
        ? isFile
          ? 'Arquivo não encontrado'
          : 'Repositório não encontrado'
        : 'Não foi possível carregar',
      error.message || String(error),
      notFound
        ? isFile
          ? 'O arquivo pode ter sido removido ou renomeado no último commit.'
          : 'Verifique o npub, o nome do projeto e se o push já foi publicado nos relays.'
        : 'Verifique sua conexão com os relays Nostr e os servidores Blossom.'
    );
    setDocumentTitle(notFound ? 'Não encontrado' : 'Erro');
  }
}

function navigateFromSearch(value) {
  let raw = String(value || '').trim();
  if (!raw) return;
  raw = raw.replace(/^nostr:\/\//i, '').replace(/^ngit:\/\//i, '').replace(/\/+$/, '');

  if (raw.includes('/')) {
    const slash = raw.indexOf('/');
    const identity = raw.slice(0, slash);
    const project = raw.slice(slash + 1);
    if (!identity || !project) {
      toast('Use o formato npub1.../projeto', 'err');
      return;
    }
    location.hash = `#/${encodeURIComponent(identity)}/${encodeURIComponent(project)}`;
    return;
  }

  if (meCache?.npub) {
    location.hash = `#/${encodeURIComponent(meCache.npub)}/${encodeURIComponent(raw)}`;
    return;
  }

  toast('Informe também o npub: npub1.../projeto', 'err');
}

topSearch.addEventListener('submit', (event) => {
  event.preventDefault();
  navigateFromSearch(topSearchInput.value);
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-search]');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input[name="target"]');
  navigateFromSearch(input?.value || '');
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  event.preventDefault();
  copyText(button.dataset.copy)
    .then(() => toast('Comando copiado para a área de transferência.'))
    .catch(() => toast('Não foi possível copiar.', 'err'));
});

window.addEventListener('hashchange', renderRoute);

getMe().catch(() => {});
renderRoute();

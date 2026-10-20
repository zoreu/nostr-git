const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/i;

export function parseVersion(value) {
  const raw = String(value || '').trim();
  const match = VERSION_RE.exec(raw);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
}

export function isVersionLabel(value) {
  return parseVersion(value) !== null;
}

export function versionToString(value, { prefix = 'v' } = {}) {
  const version = typeof value === 'string' ? parseVersion(value) : value;
  if (!version) return null;
  return `${prefix}${version.major}.${version.minor}.${version.patch}`;
}

export function compareVersions(a, b) {
  const versionA = parseVersion(a);
  const versionB = parseVersion(b);
  if (!versionA || !versionB) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (versionA[key] !== versionB[key]) {
      return versionA[key] < versionB[key] ? -1 : 1;
    }
  }
  return 0;
}

export function sortVersions(entries) {
  return [...entries].sort((a, b) => {
    const byVersion = compareVersions(b.name, a.name);
    if (byVersion !== 0) return byVersion;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export function bumpVersion(version, component = 'patch') {
  const current = parseVersion(version) || { major: 0, minor: 0, patch: 0 };
  const next = { ...current };
  if (component === 'major') {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  } else if (component === 'minor') {
    next.minor += 1;
    next.patch = 0;
  } else {
    next.patch += 1;
  }
  return next;
}

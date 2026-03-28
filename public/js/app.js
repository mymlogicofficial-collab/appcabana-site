async function saveToVault(appId, appName) {
  const btn = document.getElementById('vault-btn');
  
  if (!('showDirectoryPicker' in window)) {
    showNotification('Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera for vault functionality.', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Preparing...';

    const response = await fetch(`/api/apps/${appId}/save-to-vault`, { method: 'POST' });
    const data = await response.json();

    if (!data.success) {
      showNotification(data.error || 'Failed to prepare download', 'error');
      return;
    }

    btn.innerHTML = '<span class="spinner"></span> Select folder...';

    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });

    const vaultDir = await getOrCreateDir(dirHandle, 'AppHarbor');
    const appDir = await getOrCreateDir(vaultDir, sanitizeName(appName));

    const metaFile = await appDir.getFileHandle('app-info.json', { create: true });
    const writable = await metaFile.createWritable();
    await writable.write(JSON.stringify({
      name: data.app.name,
      version: data.app.version,
      savedAt: new Date().toISOString(),
      source: window.location.href
    }, null, 2));
    await writable.close();

    const readmeFile = await appDir.getFileHandle('README.txt', { create: true });
    const readmeWritable = await readmeFile.createWritable();
    await readmeWritable.write(
      `${data.app.name}\n${'='.repeat(data.app.name.length)}\n\n` +
      `Version: ${data.app.version || 'N/A'}\n` +
      `Saved from The App Cabana on ${new Date().toLocaleDateString()}\n\n` +
      `This app was saved to your local Sovereign Vault via the File System Access API.\n` +
      `No cloud storage was used — your software stays on your machine.\n`
    );
    await readmeWritable.close();

    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved to Vault!';
    btn.classList.add('btn-success');
    showNotification(`${appName} saved to your vault successfully!`, 'success');

  } catch (err) {
    if (err.name === 'AbortError') {
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save to Vault';
      return;
    }
    console.error('Vault save error:', err);
    showNotification('Failed to save to vault: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save to Vault';
      btn.classList.remove('btn-success');
    }, 5000);
  }
}

async function getOrCreateDir(parent, name) {
  try {
    return await parent.getDirectoryHandle(name, { create: true });
  } catch {
    return await parent.getDirectoryHandle(name);
  }
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '-');
}

function showNotification(message, type) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `notification notification-${type}`;
  el.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">&times;</button>`;
  document.body.appendChild(el);

  setTimeout(() => el.remove(), 6000);
}

document.querySelectorAll('.user-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.parentElement.classList.toggle('open');
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.user-menu.open').forEach(m => m.classList.remove('open'));
});

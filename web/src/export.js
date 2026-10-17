export async function exportJsonFile(name, contents, api = window) {
  if (typeof api.showSaveFilePicker === 'function') {
    try {
      const handle = await api.showSaveFilePicker({ suggestedName: name, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] });
      const writable = await handle.createWritable();
      try { await writable.write(contents); await writable.close(); }
      catch (error) { await writable.abort?.().catch(() => {}); throw error; }
      return 'saved';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  // Download links do not expose completion or cancellation to the page.
  // Start the download without claiming the file has been saved.
  const url = api.URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
  const link = api.document.createElement('a'); link.href = url; link.download = name;
  api.document.body.append(link); link.click(); link.remove();
  api.setTimeout(() => api.URL.revokeObjectURL(url), 1000);
  return 'download';
}

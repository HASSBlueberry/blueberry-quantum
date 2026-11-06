class BlueberryQuantumCard extends HTMLElement {
  setConfig(config) { this.config = config; this.render(); }
  set hass(hass) {
    this._hass = hass;
    if (!this.loaded) { this.loaded = true; this.load().catch(error => { this.loaded = false; this.error(error); }); }
  }
  async call(action, data = {}, provider = this.provider) {
    return this._hass.callWS({type: 'blueberry_quantum/request', entry_id: this.entry, action, provider, data});
  }
  error(error) { this.querySelector('[role=alert]').textContent = error.message; }
  async load() {
    if (!this.entry) {
      const entries = await this._hass.callWS({type: 'blueberry_quantum/request', action: 'entries'});
      this.entry = this.config.entry_id || entries[0]?.entry_id;
    }
    if (!this.entry) throw Error('Set up the BlueberryQuantum integration first');
    this.state = await this.call('state');
    this.render();
  }
  async action(work) {
    if (this.busy) return;
    this.busy = true;
    this.querySelector('[role=alert]').textContent = '';
    try { await work(); } catch (error) { this.error(error); }
    finally { this.busy = false; }
  }
  async review(resource, operation, values) {
    const provider = this.provider;
    const plan = await this.call('plan', {resource, operation, values}, provider);
    if (provider !== this.provider) throw Error('Provider changed. Review the change again');
    this.plan = plan;
    const review = this.querySelector('[data-plan]'); review.replaceChildren();
    const providerName = this.state.providers.find(row => row.id === provider)?.name || provider;
    const title = document.createElement('p'); title.textContent = 'Provider ' + providerName; review.append(title);
    const summary = document.createElement('p');
    if (resource === 'dns') {
      const record = this.state.snapshots?.[provider]?.dns?.find(row => String(row.id) === values.id);
      summary.textContent = operation === 'delete' ? 'Delete DNS record ' + (record?.name || values.id) : 'Save DNS record ' + values.name + ' at ' + values.ip;
    } else if (resource === 'dns_settings') {
      summary.textContent = values.mode === 'automatic' ? 'Use automatic upstream DNS servers' : 'Use upstream DNS servers ' + values.ips.join(', ');
    } else summary.textContent = operation === 'delete' ? 'Delete forwarding rule ' + values.id : 'Forward ' + values.protocol.toUpperCase() + ' gateway port ' + values.external_port + ' to ' + values.private_ip + ' port ' + values.internal_port;
    review.append(summary);
    if (plan.notice) { const notice = document.createElement('p'); notice.textContent = plan.notice; review.append(notice); }
    const details = document.createElement('details'); const label = document.createElement('summary'); label.textContent = 'Request details';
    const raw = document.createElement('pre'); raw.style.whiteSpace = 'pre-wrap'; raw.style.overflowWrap = 'anywhere'; raw.textContent = JSON.stringify(plan, null, 2); details.append(label, raw); review.append(details);
    this.querySelector('[data-action=apply]').disabled = false;
    this.querySelector('[data-review]').hidden = false;
  }
  renderDns(snapshot) {
    const node = this.querySelector('[data-dns]');
    const capabilities = snapshot.capabilities || {};
    if (!capabilities.dns_read) {
      node.textContent = snapshot.dns_note || 'This provider does not expose DNS host records. Select a DNS-capable provider.';
      return;
    }
    const table = document.createElement('table');
    table.style.width = '100%';
    const header = table.createTHead().insertRow();
    for (const label of ['Name', 'Address', 'Actions']) { const th = document.createElement('th'); th.textContent = label; th.style.textAlign = 'left'; header.append(th); }
    for (const record of snapshot.dns || []) {
      const row = table.insertRow();
      row.insertCell().textContent = record.name;
      row.insertCell().textContent = record.ip;
      const actions = row.insertCell();
      for (const kind of ['Edit', 'Delete']) {
        const button = document.createElement('button');
        button.textContent = kind; button.disabled = !capabilities.dns_write;
        button.setAttribute('aria-label', kind + ' ' + record.name);
        button.onclick = () => this.action(async () => {
          if (kind === 'Delete') { await this.review('dns', 'delete', {id: String(record.id)}); return; }
          const form = this.querySelector('[data-dns-form]');
          form.elements.name.value = record.name; form.elements.name.readOnly = true;
          form.elements.ip.value = record.ip; form.elements.ip.focus();
        });
        actions.append(button);
      }
    }
    node.append(table);
    if (!snapshot.dns?.length) { const empty = document.createElement('p'); empty.textContent = 'No DNS host records'; node.append(empty); }
    const form = document.createElement('form');
    form.dataset.dnsForm = '';
    form.innerHTML = '<label>DNS name <input name="name" required placeholder="device.home" autocomplete="off"></label> <label>Address <input name="ip" required placeholder="192.168.1.20" autocomplete="off"></label> <button type="submit">Review DNS change</button> <button type="reset">New record</button>';
    for (const input of form.querySelectorAll('input,button')) input.disabled = !capabilities.dns_write;
    form.onreset = () => { form.elements.name.readOnly = false; };
    form.onsubmit = event => {
      event.preventDefault();
      this.action(() => this.review('dns', 'upsert', {name: form.elements.name.value, ip: form.elements.ip.value}));
    };
    node.append(form);
    if (!capabilities.dns_write) {
      const note = document.createElement('p'); note.textContent = 'Read-only provider. For G3100, enable writes and inspect its SPA before managing records.'; node.append(note);
    }
  }
  renderDnsSettings(snapshot) {
    if (!snapshot.capabilities?.dns_settings_read) return;
    const node = this.querySelector('[data-dns]');
    const title = document.createElement('h4'); title.textContent = 'Upstream DNS servers'; node.append(title);
    const form = document.createElement('form');
    form.dataset.dnsSettings = '';
    form.innerHTML = '<label>DNS mode <select name="mode"><option value="automatic">Automatic</option><option value="custom">Custom</option></select></label> <label>Primary IPv4 DNS <input name="primary" autocomplete="off"></label> <label>Secondary IPv4 DNS <input name="secondary" autocomplete="off"></label> <button>Review upstream DNS change</button><p>Applying this change may reboot the gateway or interrupt clients. IPv6 DNS settings remain as currently configured.</p>';
    form.elements.mode.value = snapshot.dns_settings.mode || 'automatic';
    form.elements.primary.value = snapshot.dns_settings.custom_ips?.[0] || '';
    form.elements.secondary.value = snapshot.dns_settings.custom_ips?.[1] || '';
    for (const input of form.querySelectorAll('input,select,button')) input.disabled = !snapshot.capabilities.dns_settings_write;
    form.onsubmit = event => {
      event.preventDefault();
      const mode = form.elements.mode.value;
      const ips = mode === 'custom' ? [form.elements.primary.value.trim(), form.elements.secondary.value.trim()].filter(Boolean) : [];
      this.action(() => this.review('dns_settings', 'upsert', {mode, ips}));
    };
    node.append(form);
  }
  render() {
    this.innerHTML = `<ha-card><div style="padding:16px"><h2>BlueberryQuantum</h2><p role="alert"></p>
      <label>Gateway or DNS provider <select data-selector aria-label="Provider"></select></label>
      <button data-action="refresh">Refresh</button> <button data-action="inspect">Inspect SPA</button> <button data-action="reconnect">Reconnect</button>
      <p data-status></p><h3>DNS records for selected provider</h3><div data-dns></div>
      <section data-review hidden><h3>Review selected provider change</h3><div data-plan></div><button data-action="apply" disabled>Apply reviewed change</button></section>
      <details><summary>Manage providers</summary><button data-edit-provider>Edit selected provider</button><form data-provider-form>
        <label>Provider type <select name="kind"><option value="quantum_g3100">Quantum G3100</option><option value="blueberry_proxy">BlueberryProxy DNS</option><option value="eero">Eero account API</option><option value="http_json">External JSON provider</option></select></label>
        <label>Name <input name="name" required></label><label>URL <input name="url" required value="https://192.168.1.1"></label>
        <label>Username <input name="username" value="admin" autocomplete="username"></label><label>Password <input name="password" type="password" autocomplete="new-password"></label>
        <label>Session or API token <input name="token" type="password" autocomplete="off"></label><label>LAN CIDRs, comma separated <input name="networks" placeholder="192.168.1.0/24"></label>
        <label><input name="verify_tls" type="checkbox" checked>Verify HTTPS certificates</label><label><input name="write_enabled" type="checkbox">Enable supported writes</label>
        <label><input name="update" type="checkbox">Update selected provider</label><button>Save provider</button>
        <p>Eero can sign in after saving. For updates, blank password and token fields retain credentials at the same provider URL.</p></form></details>
      <details data-eero hidden><summary>Eero sign-in and network selection</summary><form data-eero-login><label>Email or phone <input name="login" required autocomplete="username"></label><button>Send verification code</button></form><form data-eero-code><label>Verification code <input name="code" required autocomplete="one-time-code"></label><button>Verify code</button></form><p data-eero-result></p><label>Eero network <select data-eero-network></select></label><button data-action="eero_select">Use this network</button></details>
      <details><summary>Port forwarding and advanced changes</summary><p>Choose resource forwards or dns, operation upsert or delete, and values. Forward values use name, private_ip, protocol, external_port and internal_port. Deletion uses id.</p><textarea data-change rows="5" style="width:95%"></textarea><button data-action="plan">Review change</button></details>
      <details><summary>BlueberryProxy discovery</summary><select data-proxy></select><button data-action="sync">Import router inventory</button><button data-action="scan">Scan provider networks</button></details>
      <details><summary>Provider details</summary><pre data-details style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></div></ha-card>`;
    const providers = this.state?.providers || [];
    this.provider = providers.some(row => row.id === this.provider) ? this.provider : providers[0]?.id;
    const selected = providers.find(row => row.id === this.provider);
    const snapshot = this.state?.snapshots?.[this.provider] || {};
    const selector = this.querySelector('[data-selector]');
    for (const row of providers) selector.add(new Option(row.name || row.kind, row.id));
    selector.value = this.provider || '';
    selector.onchange = () => { this.provider = selector.value; this.plan = null; this.render(); };
    for (const row of providers.filter(row => row.kind === 'blueberry_proxy')) this.querySelector('[data-proxy]').add(new Option(row.name || row.url, row.id));
    this.querySelector('[data-status]').textContent = snapshot.error || [selected?.name, snapshot.status?.model, snapshot.status?.firmware].filter(Boolean).join(' · ');
    this.querySelector('[data-details]').textContent = JSON.stringify(snapshot, null, 2);
    this.renderDns(snapshot);
    this.renderDnsSettings(snapshot);
    const providerForm = this.querySelector('[data-provider-form]');
    providerForm.style.display = 'grid'; providerForm.style.gap = '8px';
    providerForm.elements.kind.onchange = () => {
      const kind = providerForm.elements.kind.value;
      const defaults = {quantum_g3100: 'https://192.168.1.1', blueberry_proxy: 'http://192.168.1.10:8055', eero: 'https://api-user.e2ro.com'};
      if (defaults[kind]) providerForm.elements.url.value = defaults[kind];
      providerForm.elements.verify_tls.disabled = kind === 'eero';
      if (kind === 'eero') providerForm.elements.verify_tls.checked = true;
    };
    this.querySelector('[data-edit-provider]').onclick = () => {
      if (!selected) return;
      providerForm.reset();
      for (const key of ['kind', 'name', 'url', 'username']) providerForm.elements[key].value = selected[key] || '';
      providerForm.elements.networks.value = (selected.networks || []).join(', ');
      providerForm.elements.verify_tls.checked = selected.verify_tls !== false;
      providerForm.elements.verify_tls.disabled = selected.kind === 'eero';
      providerForm.elements.write_enabled.checked = !!selected.write_enabled;
      providerForm.elements.update.checked = true;
    };
    providerForm.onsubmit = event => {
      event.preventDefault();
      this.action(async () => {
        const data = Object.fromEntries(new FormData(providerForm));
        data.verify_tls = providerForm.elements.verify_tls.checked;
        data.write_enabled = providerForm.elements.write_enabled.checked;
        data.networks = data.networks.split(',').map(value => value.trim()).filter(Boolean);
        if (providerForm.elements.update.checked) { if (!this.provider) throw Error('Select a provider to update'); data.id = this.provider; }
        delete data.update;
        for (const key of ['password', 'token']) if (!data[key]) delete data[key];
        const result = await this.call('configure', data); this.provider = result.id;
        providerForm.elements.password.value = ''; providerForm.elements.token.value = '';
        this.plan = null; await this.load();
      });
    };
    this.querySelector('[data-change]').value = JSON.stringify({resource: 'forwards', operation: 'upsert', values: {name: 'Service', private_ip: '192.168.1.20', protocol: 'tcp', external_port: 8443, internal_port: 443}}, null, 2);
    this.querySelector('[data-eero]').hidden = selected?.kind !== 'eero';
    for (const network of snapshot.available_networks || []) this.querySelector('[data-eero-network]').add(new Option(network.name, network.id));
    for (const button of this.querySelectorAll('[data-action]')) button.onclick = () => this.action(async () => {
      const action = button.dataset.action;
      if (action === 'plan') { const data = JSON.parse(this.querySelector('[data-change]').value); await this.review(data.resource, data.operation, data.values); return; }
      let data = {};
      if (action === 'apply') {
        if (!this.plan || this.plan.provider !== this.provider) throw Error('Review a change for the selected provider first');
        data = {plan_id: this.plan.id}; this.plan = null; button.disabled = true;
      }
      if (['scan', 'sync'].includes(action)) data = {proxy_id: this.querySelector('[data-proxy]').value};
      if (action === 'eero_select') data = {network_id: this.querySelector('[data-eero-network]').value};
      const result = await this.call(action, data);
      if (action === 'inspect') this.querySelector('[data-details]').textContent = JSON.stringify(result, null, 2);
      else await this.load();
    });
    for (const kind of ['login', 'code']) this.querySelector('[data-eero-' + kind + ']').onsubmit = event => {
      event.preventDefault(); const form = event.target;
      this.action(async () => {
        const data = Object.fromEntries(new FormData(form)); form.reset();
        const result = await this.call(kind === 'login' ? 'eero_login' : 'eero_verify', data);
        this.querySelector('[data-eero-result]').textContent = result.message || 'Sign-in step complete';
        if (kind === 'code') await this.load();
      });
    };
  }
  getCardSize() { return 8; }
}
customElements.define('blueberry-quantum-card', BlueberryQuantumCard);
window.customCards = window.customCards || [];
window.customCards.push({type: 'blueberry-quantum-card', name: 'BlueberryQuantum', description: 'Gateway providers and per-provider DNS management'});

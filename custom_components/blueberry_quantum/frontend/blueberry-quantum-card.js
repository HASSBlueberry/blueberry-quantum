import './quantum-panel.js?v=0.3.0';
class BlueberryQuantumCard extends HTMLElement {
  setConfig(config) { this.config = config; if (!this.panel) { this.panel = document.createElement('quantum-provider-panel'); const card = document.createElement('ha-card'); card.append(this.panel); this.replaceChildren(card); } }
  set hass(hass) {
    this._hass = hass;
    if (!this.panel) this.setConfig({});
    this.panel.transport = (action, data = {}, provider) => this.request(action, data, provider);
    if (!this.loaded) { this.loaded = true; this.load().catch(error => { this.loaded = false; this.panel.message = error.message; this.panel.render(); }); }
  }
  async request(action, data = {}, provider) {
    return this._hass.callWS({type: 'blueberry_quantum/request', entry_id: this.entry, action, provider, data});
  }
  async load() {
    const entries = await this._hass.callWS({type: 'blueberry_quantum/request', action: 'entries'});
    this.entry = this.config.entry_id || entries[0]?.entry_id;
    if (!this.entry) throw Error('Set up the BlueberryQuantum integration first');
    this.panel.state = await this.request('state');
  }
  getCardSize() { return 10; }
}
customElements.define('blueberry-quantum-card', BlueberryQuantumCard);
window.customCards = window.customCards || [];
window.customCards.push({type: 'blueberry-quantum-card', name: 'BlueberryQuantum', description: 'Provider-defined gateway management'});

import './quantum-panel.js?v=0.4.0';
class BlueberryQuantumCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); this.generation=0; }
  static getStubConfig() { return {type:'custom:blueberry-quantum-card',title:'BlueberryQuantum'}; }
  static getConfigElement() { return document.createElement('blueberry-quantum-card-editor'); }
  setConfig(config) {
    this.generation++;this.starting=false;clearTimeout(this.retry);this.config={...config};
    if (!this.panel) {
      const style=document.createElement('style');style.textContent=':host{display:block}ha-card{color:var(--primary-text-color);background:var(--card-background-color);overflow:hidden}';
      this.panel=document.createElement('quantum-provider-panel');const card=document.createElement('ha-card');card.append(this.panel);this.shadowRoot.replaceChildren(style,card);
    }
    this.panel.title=this.config.title || 'BlueberryQuantum';
    this.panel.render();this.loaded=false;this.start();
  }
  set hass(hass) {
    if (this._hass?.connection!==hass.connection) this.loaded=false;
    this._hass=hass;
    if (!this.panel) this.setConfig({});
    this.panel.transport=(action,data={},provider)=>this.request(action,data,provider);
    this.start();
  }
  connectedCallback() { this.start(); }
  disconnectedCallback() { this.generation++;this.loaded=false;this.starting=false;clearTimeout(this.retry); }
  async start() {
    if (!this.isConnected || !this._hass || !this.panel || this.loaded || this.starting) return;
    this.starting=true;const generation=this.generation;
    try {
      const entries=await this._hass.callWS({type:'blueberry_quantum/request',action:'entries'});
      if (generation!==this.generation || !this.isConnected) return;
      this.entry=this.config.entry_id || entries[0]?.entry_id;
      if (!entries.some(entry=>entry.entry_id===this.entry)) throw Error('Add the BlueberryQuantum integration in Settings → Devices & services.');
      const state=await this.request('state');
      if (generation!==this.generation || !this.isConnected) return;
      this.panel.state=state;this.loaded=true;

    } catch(error) {
      if (generation===this.generation) { this.panel.message=error.message;this.panel.failed=true;this.panel.render();this.retry=setTimeout(()=>this.start(),10000); }
    } finally { if (generation===this.generation) this.starting=false; }
  }
  async request(action,data={},provider) {
    return this._hass.callWS({type:'blueberry_quantum/request',entry_id:this.entry,action,provider,data});
  }
  getCardSize() { return 10; }
}
class BlueberryQuantumCardEditor extends HTMLElement {
  setConfig(config) {
    this.config={...config};this.replaceChildren();
    for (const [key,label] of [['title','Card title'],['entry_id','Quantum entry ID, optional']]) {
      const line=document.createElement('p');const text=document.createElement('label');text.textContent=label;
      const input=document.createElement('input');input.value=config[key] || '';input.style.cssText='display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:7px';
      input.oninput=()=>{this.config={...this.config,[key]:input.value};this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this.config},bubbles:true,composed:true}));};
      text.append(input);line.append(text);this.append(line);
    }
  }
}
if (!customElements.get('blueberry-quantum-card')) customElements.define('blueberry-quantum-card',BlueberryQuantumCard);
if (!customElements.get('blueberry-quantum-card-editor')) customElements.define('blueberry-quantum-card-editor',BlueberryQuantumCardEditor);
window.customCards=window.customCards || [];
if (!window.customCards.some(card=>card.type==='blueberry-quantum-card')) window.customCards.push({type:'blueberry-quantum-card',name:'BlueberryQuantum',description:'Gateway providers, local DNS and network management',preview:false});

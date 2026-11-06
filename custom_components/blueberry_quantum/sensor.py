from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .client import DOMAIN
async def async_setup_entry(hass,entry,async_add_entities):
    coordinator=hass.data[DOMAIN][entry.entry_id]['coordinator']
    known=set()
    def discover():
        additions=[]
        for row in (coordinator.data or {}).get('providers',[]):
            if row['id'] in known:continue
            known.add(row['id'])
            for key in ('devices','dns','forwards'):additions.append(QuantumCount(coordinator,entry,row,key))
        if additions:async_add_entities(additions)
    discover()
    entry.async_on_unload(coordinator.async_add_listener(discover))
class QuantumCount(CoordinatorEntity,SensorEntity):
    _attr_has_entity_name=True
    def __init__(self,coordinator,entry,provider,key):
        super().__init__(coordinator)
        self.pid,self.key=provider['id'],key
        self._attr_unique_id=entry.entry_id+'_'+self.pid+'_'+key
        self._attr_name=key.replace('_',' ').title()
        self._attr_device_info={'identifiers':{(DOMAIN,entry.entry_id+'_'+self.pid)},'name':provider.get('name',provider['kind']),'manufacturer':'BlueberryQuantum','model':provider['kind']}
    @property
    def available(self):return super().available and 'error' not in self.coordinator.data['snapshots'].get(self.pid,{'error':True})
    @property
    def native_value(self):return len(self.coordinator.data['snapshots'].get(self.pid,{}).get(self.key,[]))

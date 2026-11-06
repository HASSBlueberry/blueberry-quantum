"""Inventory count sensors discovered from provider resource descriptors."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .client import DOMAIN

async def async_setup_entry(hass,entry,async_add_entities):
    coordinator=hass.data[DOMAIN][entry.entry_id]['coordinator']
    known=set()
    def discover():
        additions=[]
        data=coordinator.data or {}
        for provider in data.get('providers',[]):
            snapshot=data.get('snapshots',{}).get(provider['id'],{})
            for resource in snapshot.get('resources',[]):
                key=(provider['id'],resource['id'])
                if key in known or not resource.get('collection') or not resource.get('read'):continue
                known.add(key);additions.append(QuantumCount(coordinator,entry,provider,resource))
        if additions:async_add_entities(additions)
    discover()
    entry.async_on_unload(coordinator.async_add_listener(discover))

class QuantumCount(CoordinatorEntity,SensorEntity):
    _attr_has_entity_name=True
    def __init__(self,coordinator,entry,provider,resource):
        super().__init__(coordinator)
        self.pid,self.key=provider['id'],resource['id']
        self._attr_unique_id=entry.entry_id+'_'+self.pid+'_'+self.key
        self._attr_name=resource['title']+' count'
        self._attr_device_info={'identifiers':{(DOMAIN,entry.entry_id+'_'+self.pid)},'name':provider.get('name',provider['kind']),'manufacturer':'BlueberryQuantum','model':provider['kind']}
    def resource(self):
        snapshot=self.coordinator.data.get('snapshots',{}).get(self.pid,{})
        return next((row for row in snapshot.get('resources',[]) if row['id']==self.key),{})
    @property
    def available(self):return super().available and bool(self.resource().get('read'))
    @property
    def native_value(self):return len(self.resource().get('value',[])) if self.resource().get('read') else None

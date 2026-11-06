"""Home Assistant bridge to the independent Quantum application."""
import logging
from pathlib import Path
from datetime import timedelta
import voluptuous as vol
from aiohttp import ClientError
from homeassistant.components import frontend,websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator,UpdateFailed
from .client import DOMAIN,QuantumClient

async def async_setup(hass,config):
    if DOMAIN in hass.data:return True
    hass.data[DOMAIN]={}
    path=Path(__file__).parent/'frontend'/'blueberry-quantum-card.js'
    await hass.http.async_register_static_paths([StaticPathConfig('/blueberry_quantum/card.js',str(path),False),StaticPathConfig('/blueberry_quantum/quantum-panel.js',str(path.parent/'quantum-panel.js'),False)])
    frontend.add_extra_js_url(hass,'/blueberry_quantum/card.js?v=0.3.0')
    websocket_api.async_register_command(hass,ws_request)
    return True

async def async_setup_entry(hass,entry):
    client=QuantumClient(async_get_clientsession(hass),entry.data['url'],entry.data['token'])
    async def update():
        try:
            catalog=await client.request('providers')
            providers=catalog['providers']
            snapshots={}
            for row in providers:
                try:snapshots[row['id']]=await client.request('providers/'+row['id']+'/snapshot')
                except (ClientError,TimeoutError,ValueError):snapshots[row['id']]={'error':'Provider unavailable. Reconnect in Quantum to retry authentication.'}
            return {'providers':providers,'snapshots':snapshots,'definitions':catalog.get('definitions',{})}
        except (ClientError,TimeoutError,ValueError) as error:raise UpdateFailed('Cannot reach Quantum') from error
    coordinator=DataUpdateCoordinator(hass,logging.getLogger(__name__),name='BlueberryQuantum',update_method=update,update_interval=timedelta(seconds=60))
    await coordinator.async_config_entry_first_refresh()
    hass.data[DOMAIN][entry.entry_id]={'client':client,'coordinator':coordinator}
    await hass.config_entries.async_forward_entry_setups(entry,['sensor'])
    return True

async def async_unload_entry(hass,entry):
    if await hass.config_entries.async_unload_platforms(entry,['sensor']):
        hass.data[DOMAIN].pop(entry.entry_id,None)
        return True
    return False

@websocket_api.websocket_command({vol.Required('type'):'blueberry_quantum/request',vol.Optional('entry_id'):str,vol.Required('action'):str,vol.Optional('provider'):str,vol.Optional('data',default={}):dict})
@websocket_api.async_response
async def ws_request(hass,connection,msg):
    if not connection.user.is_admin:
        connection.send_error(msg['id'],'unauthorized','Administrator required');return
    entries=hass.data.get(DOMAIN,{})
    if msg['action']=='entries':
        connection.send_result(msg['id'],[{'entry_id':key} for key in entries]);return
    runtime=entries.get(msg.get('entry_id'))
    if not runtime:connection.send_error(msg['id'],'not_found','Quantum entry missing');return
    action=msg['action'];pid=msg.get('provider','')
    if action=='state':connection.send_result(msg['id'],runtime['coordinator'].data);return
    if action not in ('configure','refresh','inspect','reconnect','delete','plan','apply','scan','sync','eero_login','eero_verify','eero_select','invoke'):
        connection.send_error(msg['id'],'invalid_action','Unsupported action');return
    try:
        if action=='refresh':
            await runtime['coordinator'].async_request_refresh();result=runtime['coordinator'].data
        else:
            if action!='configure' and not __import__('re').fullmatch('[a-zA-Z0-9_-]{1,80}',pid):raise ValueError('Invalid provider ID')
            path='providers' if action=='configure' else 'providers/'+pid+'/'+action
            result=await runtime['client'].request(path,None if action=='inspect' else msg['data'])
            if action not in ('plan','inspect','eero_login'):await runtime['coordinator'].async_request_refresh()
        connection.send_result(msg['id'],result)
    except (ClientError,TimeoutError,ValueError) as error:
        connection.send_error(msg['id'],'request_failed',str(error))

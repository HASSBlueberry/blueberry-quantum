import voluptuous as vol
from aiohttp import ClientError
from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .client import DOMAIN,QuantumClient
class QuantumFlow(config_entries.ConfigFlow,domain=DOMAIN):
    VERSION=1
    async def async_step_user(self,user_input=None):
        errors={}
        if user_input:
            try:
                client=QuantumClient(async_get_clientsession(self.hass),user_input['url'],user_input['token'])
                await client.request('providers')
                await self.async_set_unique_id(client.url)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title='BlueberryQuantum',data=user_input)
            except (ClientError,TimeoutError,ValueError): errors['base']='cannot_connect'
        return self.async_show_form(step_id='user',data_schema=vol.Schema({vol.Required('url',default='http://127.0.0.1:8060'):str,vol.Required('token'):str}),errors=errors)

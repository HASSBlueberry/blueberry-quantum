"""Authenticated connection to the separate Quantum application."""
from urllib.parse import urlsplit
DOMAIN='blueberry_quantum'
class QuantumClient:
    def __init__(self,session,url,token):
        parts=urlsplit(url)
        if parts.scheme not in ('http','https') or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError('Invalid Quantum URL')
        self.session,self.url,self.token=session,url.rstrip('/'),token
    async def request(self,path,body=None):
        async with self.session.request('POST' if body is not None else 'GET',self.url+'/api/'+path,
            headers={'Authorization':'Bearer '+self.token},json=body,timeout=90 if path.endswith('/inspect') else 30,allow_redirects=False) as response:
            data=await response.json()
            if response.status>=300: raise ValueError(data.get('error','Quantum request failed'))
            return data

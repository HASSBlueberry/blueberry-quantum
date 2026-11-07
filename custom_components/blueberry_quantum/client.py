"""Local connection to the separate Quantum application."""
from urllib.parse import urlsplit
DOMAIN='blueberry_quantum'
class QuantumClient:
    def __init__(self,session,url,token=None):
        parts=urlsplit(url)
        if parts.scheme not in ('http','https') or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError('Invalid Quantum URL')
        self.session,self.url=session,url.rstrip('/')
    async def request(self,path,body=None):
        async with self.session.request('POST' if body is not None else 'GET',self.url+'/api/'+path,
            json=body,timeout=90 if path.endswith('/inspect') else 60,allow_redirects=False) as response:
            data=await response.json()
            if response.status>=300: raise ValueError(data.get('error','Quantum request failed'))
            return data

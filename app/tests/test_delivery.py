"""HTTP compression contracts: reduced payloads with byte-identical decoded data, SSE and ranges intact."""
import unittest
from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
from fastapi.testclient import TestClient
from starlette.middleware.gzip import GZipMiddleware


class DeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app=FastAPI()
        app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)
        @app.get('/payload/{kind}')
        def payload(kind:str):
            types={'js':'text/javascript','css':'text/css','json':'application/json','html':'text/html','svg':'image/svg+xml'}
            if kind=='range':return Response(b'x'*100,status_code=206,headers={'Content-Range':'bytes 0-99/5000'})
            if kind=='small':return Response(b'small',media_type='text/plain')
            if kind=='encoded':return Response(b'encoded',headers={'Content-Encoding':'identity'})
            if kind=='sse':return StreamingResponse(iter([b'data: first\n\n',b'data: done\n\n']),media_type='text/event-stream')
            return Response(b'winmate '*2000,media_type=types.get(kind,'text/plain'))
        cls.client=TestClient(app)

    @classmethod
    def tearDownClass(cls):cls.client.close()

    def test_compression_ten_cases(self):
        for kind in ['js','css','json','html','svg','small','range','encoded','sse','identity']:
            with self.subTest(kind=kind):
                response=self.client.get('/payload/'+kind,headers={'Accept-Encoding':'identity' if kind=='identity' else 'gzip'})
                self.assertEqual(response.status_code,206 if kind=='range' else 200)
                if kind in ['js','css','json','html','svg']:
                    self.assertEqual(response.headers['Content-Encoding'],'gzip')
                    self.assertIn('Accept-Encoding',response.headers['Vary'])
                    self.assertEqual(response.content,b'winmate '*2000)
                    self.assertLess(int(response.headers['Content-Length']),len(response.content)//5)
                elif kind=='encoded':self.assertEqual(response.headers['Content-Encoding'],'identity')
                else:
                    self.assertNotIn('Content-Encoding',response.headers)
                    if kind=='sse':self.assertEqual(response.content,b'data: first\n\ndata: done\n\n')
                    if kind=='range':self.assertEqual(response.headers['Content-Range'],'bytes 0-99/5000')

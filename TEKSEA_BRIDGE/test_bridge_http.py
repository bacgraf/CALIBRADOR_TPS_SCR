import http.client
import importlib
import json
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch

# Importação isolada: nunca autentica nem lê/grava cache Microsoft nos testes.
msal_stub = MagicMock()
msal_stub.SerializableTokenCache.return_value.has_state_changed = False
msal_stub.PublicClientApplication.return_value.get_accounts.return_value = []
with patch.dict(sys.modules, {'msal': msal_stub, 'requests': MagicMock()}), patch('os.path.exists', return_value=False):
    bridge = importlib.import_module('teksea_bridge')


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.config = patch.object(bridge, 'load_config', return_value={'allowed_origins': ['http://192.168.4.1']})
        self.config.start()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.TekseaHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.config.stop()

    def request(self, method, path, body=None, origin='http://192.168.4.1'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            connection.request(method, path, body, {'Origin': origin, 'Content-Type': 'application/json'})
            response = connection.getresponse()
            return response.status, response.getheader('Access-Control-Allow-Origin'), json.loads(response.read())
        finally:
            connection.close()

    def test_any_origin_is_allowed(self):
        status, cors, result = self.request(
            'GET', '/tms/progress', origin='https://example.com')
        self.assertEqual(status, 200)
        self.assertEqual(cors, 'https://example.com')
        self.assertIn('cleanup_confirmed', result)

    def test_get_cannot_flash(self):
        self.assertEqual(self.request('GET', '/tms/flash')[0], 405)

    def test_invalid_json_rejected(self):
        for body in ('{', '[]', '{"operation_id":12}'):
            self.assertEqual(self.request('POST', '/tms/flash', body)[0], 400)

    def test_current_status_and_unknown_operation(self):
        code, origin, result = self.request('GET', '/tms/progress')
        self.assertEqual(code, 200)
        self.assertEqual(origin, 'http://192.168.4.1')
        self.assertIn('cleanup_confirmed', result)
        self.assertEqual(self.request('GET', '/tms/progress?operation_id=missing')[0], 404)

    def test_cancel_wrong_operation(self):
        self.assertEqual(self.request('POST', '/tms/cancel', '{"operation_id":"missing"}')[0], 409)

    def test_duplicate_start_returns_existing_operation(self):
        existing = dict(operation_id='same', state='succeeded', busy=False)
        with patch.object(bridge.flash_controller, 'snapshot', return_value=existing), patch.object(bridge, 'firmware_command') as command:
            code, _, result = self.request('POST', '/tms/flash', '{"operation_id":"same"}')
            self.assertEqual(code, 200)
            self.assertEqual(result, existing)
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()

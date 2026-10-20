"""Sharing tests use isolated databases, accounts, cookies and actual HTTP permission checks."""
import copy
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.testclient import TestClient

from app.api.auth import Auth, AuthConfig, integrate_app
from app.api.storyboards import StoryboardStore, build_router, ACTOR_COOKIE
from types import SimpleNamespace


def document():
    return {'id': 'local', 'title': 'Original', 'customer': 'Customer', 'stage': 'story',
            'createdAt': 1, 'updatedAt': 1, 'reqTab': 'free',
            'req': {'free': [{'t': 'Requirement'}], 'files': [], 'form': {'keymen': [], 'project': '', 'customer': '', 'target': '', 'note': ''}},
            'ctx': {'products': [], 'solutions': [], 'cases': []},
            'parts': [{'id': 'part1', 'name': 'Overview', 'layouts': [{'uid': 'layout1', 'f': 'L_C01', 'ov': {'t': {'0': 'before'}, 'img': {}}}]}]}


def change(path, before, value):
    return {'path': path, 'exists': True, 'before': before, 'value': value}


class SharingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StoryboardStore(root / 'shares')
        self.auth = Auth(AuthConfig(enabled=True, auth_dir=root / 'auth', iterations=2000))
        self.auth.set_credentials('owner', 'a long test password')
        self.app = FastAPI()
        self.app.state.storyboards = self.store
        self.app.include_router(build_router())

        @self.app.get('/img/test.jpg')
        def image():
            return Response(b'image', media_type='image/jpeg')

        @self.app.get('/api/catalog/metrics')
        def metrics():
            return {'counts': {'products': 2}}

        integrate_app(self.app, self.auth)
        self.owner = TestClient(self.app)
        self.guest = TestClient(self.app)
        self.other = TestClient(self.app)
        self.owner.post('/api/auth/login', json={'username': 'owner', 'password': 'a long test password'})
        result = self.owner.post('/api/storyboards', json={'source': 'local', 'document': document()})
        self.assertEqual(result.status_code, 200, result.text)
        self.created = result.json()
        self.token = self.created['token']
        self.url = '/api/storyboards/' + self.token

    def tearDown(self):
        for client in (self.owner, self.guest, self.other):
            client.close()
        self.temp.cleanup()

    def permission(self, value):
        result = self.owner.patch(self.url + '/permission', json={'permission': value})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def patch_guest_store(self, operations):
        # Storage merge/membership semantics remain independently tested; HTTP guest writes are blocked.
        self.guest.get(self.url)
        actor, _ = self.store.guest(self.guest.cookies.get(ACTOR_COOKIE))
        try:
            result = self.app.state.storyboards.patch(self.token, actor, operations)
            return SimpleNamespace(status_code=200, json=lambda: result)
        except HTTPException as error:
            result = {'detail': error.detail}
            return SimpleNamespace(status_code=error.status_code, json=lambda: result)

    def test_even_edit_capability_cannot_bypass_login_for_http_writes(self):
        self.permission('edit')
        self.guest.get(self.url)
        response = self.guest.patch(self.url, json={'operations': [change(['title'], 'Original', 'Blocked')]})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.owner.get(self.url).json()['document']['title'], 'Original')

    def test_default_is_read_only_and_guest_read_is_not_an_edit(self):
        self.assertTrue(self.created['isOwner'])
        self.assertTrue(self.created['canEdit'])
        self.assertEqual(self.created['permission'], 'view')
        self.assertEqual(self.created['sourceId'], 'local')
        guest = self.guest.get(self.url).json()
        self.assertIsNone(guest['sourceId'])
        self.assertFalse(guest['isOwner'])
        self.assertFalse(guest['canEdit'])
        self.assertFalse(guest['hasEdited'])
        self.assertEqual(self.guest.patch(self.url, json={'operations': [change(['title'], 'Original', 'Forbidden')]}).status_code, 401)
        self.assertEqual(self.owner.get(self.url).json()['document']['title'], 'Original')

    def test_metrics_are_public_for_browsing(self):
        self.assertEqual(self.other.get('/api/catalog/metrics').status_code, 200)
        self.assertEqual(self.owner.get('/api/catalog/metrics').status_code, 200)
        self.guest.get(self.url)
        self.assertEqual(self.guest.get('/api/catalog/metrics').status_code, 200)

    def test_only_owner_can_change_permission_and_token_stays_the_same(self):
        self.guest.get(self.url)
        self.assertEqual(self.guest.patch(self.url + '/permission', json={'permission': 'edit'}).status_code, 401)
        self.assertEqual(self.permission('edit')['token'], self.token)
        self.assertTrue(self.guest.get(self.url).json()['canEdit'])
        self.permission('view')
        self.assertFalse(self.guest.get(self.url).json()['canEdit'])

    def test_guest_edit_records_membership_only_after_success(self):
        self.permission('edit')
        self.guest.get(self.url)
        edited = self.patch_guest_store([change(['title'], 'Original', 'Guest edit')]).json()
        self.assertTrue(edited['hasEdited'])
        self.assertFalse(edited['isOwner'])
        self.assertEqual(self.owner.get(self.url).json()['document']['title'], 'Guest edit')
        self.assertFalse(self.other.get(self.url).json()['hasEdited'])
        self.assertTrue(self.guest.get(self.url).json()['hasEdited'])

    def test_empty_patch_and_replay_do_not_create_edits(self):
        self.permission('edit')
        self.assertFalse(self.patch_guest_store([]).json()['hasEdited'])
        operations = [change(['title'], 'Original', 'Saved')]
        first = self.owner.patch(self.url, json={'operations': operations}).json()
        replay = self.patch_guest_store(operations).json()
        self.assertEqual(replay['revision'], first['revision'])
        self.assertFalse(replay['hasEdited'])

    def test_independent_stale_edits_merge_including_nested_layout_values(self):
        self.permission('edit')
        self.owner.patch(self.url, json={'operations': [change(['title'], 'Original', 'Owner title')]})
        nested = change(['parts', '@part1', 'layouts', '@layout1', 'ov', 't', '0'], 'before', 'Guest text')
        result = self.patch_guest_store([nested]).json()
        self.assertEqual(result['document']['title'], 'Owner title')
        self.assertEqual(result['document']['parts'][0]['layouts'][0]['ov']['t']['0'], 'Guest text')

    def test_same_field_conflict_rolls_back_entire_patch(self):
        self.permission('edit')
        self.owner.patch(self.url, json={'operations': [change(['title'], 'Original', 'Winner')]})
        result = self.patch_guest_store([change(['customer'], 'Customer', 'Must rollback'), change(['title'], 'Original', 'Conflict')])
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json()['detail']['latest']['document']['title'], 'Winner')
        current = self.owner.get(self.url).json()
        self.assertEqual(current['document']['customer'], 'Customer')
        self.assertFalse(self.guest.get(self.url).json()['hasEdited'])

    def test_revoking_permission_blocks_already_open_editor(self):
        self.permission('edit')
        self.assertTrue(self.guest.get(self.url).json()['canEdit'])
        self.permission('view')
        result = self.patch_guest_store([change(['title'], 'Original', 'Too late')])
        self.assertEqual(result.status_code, 403)

    def test_create_is_idempotent_and_does_not_overwrite_saved_changes(self):
        self.owner.patch(self.url, json={'operations': [change(['title'], 'Original', 'Saved')]})
        again = self.owner.post('/api/storyboards', json={'source': 'local', 'document': document()}).json()
        self.assertEqual(again['token'], self.token)
        self.assertEqual(again['document']['title'], 'Saved')
        self.assertNotIn('id', again['document'])

    def test_persists_content_permission_and_secret_across_store_restart(self):
        self.permission('edit')
        self.guest.get(self.url)
        self.patch_guest_store([change(['title'], 'Original', 'Persistent')])
        self.app.state.storyboards = StoryboardStore(self.store.directory)
        result = self.guest.get(self.url).json()
        self.assertEqual(result['document']['title'], 'Persistent')
        self.assertEqual(result['permission'], 'edit')
        self.assertTrue(result['hasEdited'])

    def test_unchanged_poll_has_no_document_body_and_permission_changes_invalidate_it(self):
        first = self.guest.get(self.url).json()
        version = f"{first['revision']}-{first['permission']}-0-0"
        unchanged = self.guest.get(self.url, params={'version': version})
        self.assertEqual(unchanged.status_code, 204)
        self.assertEqual(unchanged.content, b'')
        self.permission('edit')
        changed = self.guest.get(self.url, params={'version': version})
        self.assertEqual(changed.status_code, 200)
        self.assertTrue(changed.json()['canEdit'])

    def test_guest_must_login_before_creating_an_independent_copy(self):
        self.assertEqual(self.guest.post('/api/storyboards', json={'source': 'copy', 'document': document()}).status_code, 401)
        self.guest.get(self.url)
        self.assertEqual(self.guest.post('/api/storyboards', json={'source': 'copy', 'document': document()}).status_code, 401)
        self.guest.post('/api/auth/login', json={'username': 'owner', 'password': 'a long test password'})
        copy = self.guest.post('/api/storyboards', json={'source': 'copy', 'document': document()}).json()
        self.assertTrue(copy['isOwner'])
        self.assertNotEqual(copy['token'], self.token)
        self.guest.patch('/api/storyboards/' + copy['token'], json={'operations': [change(['title'], 'Original', 'Independent')]})
        self.assertEqual(self.owner.get(self.url).json()['document']['title'], 'Original')

    def test_link_grants_only_read_assets_and_never_other_unsafe_apis(self):
        self.assertEqual(self.guest.get('/img/test.jpg').status_code, 200)
        self.guest.get(self.url)
        self.assertEqual(self.guest.get('/img/test.jpg').status_code, 200)
        self.assertEqual(self.guest.post('/api/jobs', json={}).status_code, 401)
        self.assertEqual(self.guest.post(self.url, json={}, headers={'Origin': 'https://evil.example'}).status_code, 403)

    def test_invalid_payloads_and_paths_are_rejected(self):
        self.assertEqual(self.owner.post('/api/storyboards', json={'source': 'bad', 'document': {}}).status_code, 422)
        self.assertEqual(self.owner.patch(self.url, json={'operations': [change(['id'], None, 'overwrite')]}).status_code, 422)
        self.assertEqual(self.owner.patch(self.url, json={'operations': [change(['parts', '@missing', 'name'], '', 'bad')]}).status_code, 409)
        self.assertEqual(self.owner.patch(self.url + '/permission', json={'permission': 'owner'}).status_code, 422)
        self.assertEqual(self.owner.patch(self.url + '/permission', json={'permission': []}).status_code, 422)
        self.assertEqual(self.guest.get('/api/storyboards/' + 'x' * 43).status_code, 404)

    def test_concurrent_independent_updates_survive(self):
        self.permission('edit')
        with ThreadPoolExecutor(max_workers=2) as pool:
            tasks = [pool.submit(self.store.patch, self.token, 'user:owner', [change(['title'], 'Original', 'Title')]),
                     pool.submit(self.store.patch, self.token, 'user:owner', [change(['customer'], 'Customer', 'Company')])]
            for task in tasks:
                task.result()
        result = self.owner.get(self.url).json()['document']
        self.assertEqual((result['title'], result['customer']), ('Title', 'Company'))


if __name__ == '__main__':
    unittest.main()

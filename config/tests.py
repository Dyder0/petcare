from django.test import SimpleTestCase


class HomePageTests(SimpleTestCase):
    def test_root_serves_existing_petcare_index(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<title>PetCare", b"".join(response.streaming_content))

    def test_django_admin_can_be_embedded_from_same_origin(self):
        response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Frame-Options"], "SAMEORIGIN")

    def test_rest_framework_login_route_is_available_for_embedded_api(self):
        response = self.client.get("/api-auth/login/?next=%2Fapi%2Fdocs%2F")

        self.assertEqual(response.status_code, 200)

    def test_swagger_documentation_requires_administrator_authentication(self):
        for path in ("/api/docs/", "/api/schema/"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertIn(response.status_code, (401, 403))

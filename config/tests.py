from django.test import SimpleTestCase


class HomePageTests(SimpleTestCase):
    def test_root_serves_existing_petcare_index(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<title>PetCare", b"".join(response.streaming_content))

from datetime import date, timedelta

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment, ClinicSettings, ScheduleDay
from apps.patients.models import Pet, Tutor


class AppointmentApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-appointment-api@example.com",
            name="Admin de prueba",
            password="test-password-123",
            role=User.Role.ADMIN,
        )
        self.veterinarian = User.objects.create_user(
            email="vet-appointment-api@example.com",
            name="Veterinaria de prueba",
            password="test-password-123",
            role=User.Role.VETERINARIAN,
        )
        self.tutor = Tutor.objects.create(
            name="Tutor de prueba",
            rut="12.345.678-5",
            email="tutor-appointment-api@example.com",
        )
        self.pet = Pet.objects.create(
            tutor=self.tutor,
            name="Milo",
            species=Pet.Species.DOG,
        )
        self.appointment_date = date.today() + timedelta(days=1)
        ClinicSettings.objects.get_or_create(pk=1)
        ScheduleDay.objects.update_or_create(
            day_of_week=self.appointment_date.weekday(),
            defaults={
                "active": True,
                "opening_time": "09:00",
                "closing_time": "17:00",
                "break_start": None,
                "break_end": None,
            },
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def appointment_payload(self, **overrides):
        payload = {
            "pet": str(self.pet.id),
            "veterinarian": str(self.veterinarian.id),
            "service": "Consulta general",
            "date": self.appointment_date.isoformat(),
            "time": "10:00",
            "status": Appointment.Status.PENDING,
            "notes": "",
        }
        payload.update(overrides)
        return payload

    def test_create_appointment_persists_and_appears_in_api(self):
        response = self.client.post(
            reverse("appointment-list"), self.appointment_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201)
        appointment = Appointment.objects.get()
        self.assertEqual(str(appointment.id), response.data["id"])
        self.assertEqual(appointment.pet_id, self.pet.id)
        self.assertEqual(appointment.veterinarian_id, self.veterinarian.id)

        list_response = self.client.get(reverse("appointment-list"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["count"], 1)

    def test_create_appointment_rejects_time_outside_clinic_schedule(self):
        response = self.client.post(
            reverse("appointment-list"),
            self.appointment_payload(time="18:00"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("time", response.data)

    def test_veterinarian_lookup_includes_email_for_legacy_data_reconciliation(self):
        response = self.client.get(reverse("appointment-veterinarians"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["email"], self.veterinarian.email)

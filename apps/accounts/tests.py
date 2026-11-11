from datetime import date, time, timedelta
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.appointments.models import ClinicSettings, ScheduleDay
from apps.billing.models import Debt, Payment
from apps.medical.models import Reminder
from apps.patients.models import Pet, Tutor


class PetCareApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com", name="Administradora", password="StrongPass123!"
        )
        self.veterinarian = User.objects.create_user(
            email="vet@example.com",
            name="Veterinario",
            password="StrongPass123!",
            role=User.Role.VETERINARIAN,
        )
        self.reception = User.objects.create_user(
            email="reception@example.com",
            name="Recepción",
            password="StrongPass123!",
            role=User.Role.RECEPTION,
        )
        self.tutor = Tutor.objects.create(
            name="Tutor de prueba",
            rut="12345678-5",
            email="tutor@example.com",
            phone="+56 9 1234 5678",
        )
        self.pet = Pet.objects.create(
            tutor=self.tutor,
            name="Milo",
            species=Pet.Species.DOG,
        )
        ClinicSettings.objects.update_or_create(
            pk=1,
            defaults={"clinic_name": "PetCare", "slot_minutes": 30},
        )
        for day in range(7):
            ScheduleDay.objects.update_or_create(
                day_of_week=day,
                defaults={
                    "active": True,
                    "opening_time": time(9),
                    "closing_time": time(17, 30),
                    "break_start": time(13),
                    "break_end": time(15),
                },
            )

    def test_jwt_login_and_profile(self):
        response = self.client.post(
            "/api/auth/token/",
            {"email": self.admin.email, "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}"
        )
        profile = self.client.get("/api/auth/me/")
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.data["email"], self.admin.email)
        self.assertNotIn("password", profile.data)

    def test_user_management_is_admin_only_and_password_is_write_only(self):
        self.client.force_authenticate(self.reception)
        self.assertEqual(
            self.client.get("/api/users/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/users/",
            {
                "email": "new@example.com",
                "name": "Nuevo usuario",
                "role": User.Role.RECEPTION,
                "password": "StrongPass456!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("password", response.data)
        self.assertTrue(
            User.objects.get(email="new@example.com").check_password("StrongPass456!")
        )

    def test_administrator_cannot_disable_or_delete_own_account(self):
        self.client.force_authenticate(self.admin)
        deletion = self.client.delete(f"/api/users/{self.admin.id}/")
        self.assertEqual(deletion.status_code, status.HTTP_400_BAD_REQUEST)
        blocked = self.client.patch(
            f"/api/users/{self.admin.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

    def test_django_admin_uses_custom_email_account_form(self):
        self.client.force_login(self.admin)
        response = self.client.get("/admin/accounts/user/add/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_tutor_and_pet_crud_and_rut_validation(self):
        self.client.force_authenticate(self.reception)
        invalid_tutor = self.client.post(
            "/api/tutors/",
            {
                "name": "RUT inválido",
                "rut": "abcd",
                "email": "invalid@example.com",
            },
            format="json",
        )
        self.assertEqual(invalid_tutor.status_code, status.HTTP_400_BAD_REQUEST)

        tutor_response = self.client.post(
            "/api/tutors/",
            {
                "name": "Nuevo tutor",
                "rut": "13.456.789-9",
                "email": "new-tutor@example.com",
            },
            format="json",
        )
        self.assertEqual(tutor_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(tutor_response.data["rut"], "13456789-9")

        pet_response = self.client.post(
            "/api/pets/",
            {
                "tutor": tutor_response.data["id"],
                "name": "Luna",
                "species": "Gato",
                "age": 2,
            },
            format="json",
        )
        self.assertEqual(pet_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(pet_response.data["record_number"].startswith("PC-"))

        update = self.client.patch(
            f"/api/pets/{pet_response.data['id']}/",
            {"name": "Luna actualizada"},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["name"], "Luna actualizada")

    def test_registration_creates_or_reuses_tutor_and_creates_pet_atomically(self):
        self.client.force_authenticate(self.reception)
        payload = {
            "tutor": {
                "name": "Tutor actualizado",
                "rut": "12.345.678-5",
                "phone": "+56 9 8765 4321",
                "email": "TUTOR@example.com",
            },
            "pet": {
                "name": "Luna",
                "species": "Gato",
                "age": 2,
                "sex": "Hembra",
                "reproductive_status": "Esterilizada",
            },
        }
        response = self.client.post(
            "/api/pets/register/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Tutor.objects.count(), 1)
        self.assertEqual(Pet.objects.count(), 2)
        self.assertEqual(response.data["pet"]["tutor"], self.tutor.id)
        self.tutor.refresh_from_db()
        self.assertEqual(self.tutor.name, "Tutor actualizado")
        self.assertEqual(self.tutor.email, "tutor@example.com")

        invalid_photo = {
            **payload,
            "tutor": {
                **payload["tutor"],
                "email": "another@example.com",
                "rut": "13.456.789-9",
            },
            "pet": {
                **payload["pet"],
                "photo": "data:image/png;base64,aGVsbG8=",
            },
        }
        rejected = self.client.post(
            "/api/pets/register/", invalid_photo, format="json"
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Tutor.objects.filter(email="another@example.com").exists())

    def test_appointment_rejects_conflicts_and_lunch(self):
        self.client.force_authenticate(self.reception)
        appointment_date = date.today() + timedelta(days=1)
        payload = {
            "pet": str(self.pet.id),
            "veterinarian": str(self.veterinarian.id),
            "service": "Consulta general",
            "date": appointment_date.isoformat(),
            "time": "09:30",
            "status": "confirmada",
        }
        first = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        conflict = self.client.post("/api/appointments/", payload, format="json")
        self.assertEqual(conflict.status_code, status.HTTP_400_BAD_REQUEST)

        lunch = {**payload, "time": "13:00"}
        invalid = self.client.post("/api/appointments/", lunch, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_clinical_writes_require_veterinarian_or_administrator(self):
        self.client.force_authenticate(self.reception)
        payload = {
            "pet": str(self.pet.id),
            "record_type": "diagnostico",
            "title": "Control",
            "date": date.today().isoformat(),
        }
        self.assertEqual(
            self.client.post(
                "/api/medical-records/", payload, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.veterinarian)
        response = self.client.post(
            "/api/medical-records/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["veterinarian"], self.veterinarian.id)
        protected = self.client.delete(f"/api/pets/{self.pet.id}/")
        self.assertEqual(protected.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reminder_crud(self):
        self.client.force_authenticate(self.reception)
        response = self.client.post(
            "/api/reminders/",
            {
                "pet": str(self.pet.id),
                "title": "Vacuna anual",
                "date": (date.today() + timedelta(days=10)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reminder = Reminder.objects.get(pk=response.data["id"])
        self.assertEqual(reminder.status, Reminder.Status.PENDING)

    def test_debt_creation_validates_tutor_and_pet_relationship(self):
        self.client.force_authenticate(self.reception)
        other_tutor = Tutor.objects.create(
            name="Otro tutor",
            rut="13456789-9",
            email="other@example.com",
        )
        response = self.client.post(
            "/api/debts/",
            {
                "tutor": str(other_tutor.id),
                "pet": str(self.pet.id),
                "concept": "Consulta",
                "amount": "25000.00",
                "issued_at": date.today().isoformat(),
                "due_date": (date.today() + timedelta(days=7)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(DEBUG=True)
    def test_payment_simulation_is_atomic_and_never_uses_a_gateway(self):
        self.client.force_authenticate(self.reception)
        debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Consulta",
            amount="25000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )
        response = self.client.post(
            "/api/payments/simulate/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )
        self.assertEqual(
            response.status_code, status.HTTP_201_CREATED, response.data
        )
        self.assertTrue(response.data["simulated"])
        self.assertEqual(response.data["amount"], "25000.00")
        debt.refresh_from_db()
        self.assertEqual(debt.status, Debt.Status.PAID)
        self.assertIsNotNone(debt.paid_at)

        repeated = self.client.post(
            "/api/payments/simulate/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )
        self.assertEqual(repeated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Debt.objects.filter(status=Debt.Status.PAID).count(), 1)

    @patch("apps.billing.views.create_transbank_transaction")
    def test_transbank_checkout_and_authorized_return_settle_debt(self, create_transaction):
        self.client.force_authenticate(self.reception)
        debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Consulta",
            amount="25000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )
        create_transaction.return_value = {
            "token": "test-transbank-token",
            "url": "https://webpay3gint.transbank.cl/webpayserver/initTransaction",
        }

        checkout = self.client.post(
            "/api/payments/transbank/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )

        self.assertEqual(checkout.status_code, status.HTTP_201_CREATED)
        self.assertEqual(checkout.data["token"], "test-transbank-token")
        self.assertEqual(checkout.data["amount"], "25000.00")
        payment = Payment.objects.get(pk=checkout.data["payment_id"])
        self.assertFalse(payment.simulated)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.debts.get(), debt)

        gateway = Mock()
        gateway.commit.return_value = {
            "response_code": 0,
            "status": "AUTHORIZED",
            "buy_order": payment.buy_order,
            "amount": 25000,
            "authorization_code": "123456",
        }
        with patch("apps.billing.views.get_transbank_transaction", return_value=gateway):
            callback = self.client.get(
                "/api/payments/transbank/return/",
                {"token_ws": "test-transbank-token"},
            )

        self.assertEqual(callback.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        debt.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.AUTHORIZED)
        self.assertEqual(payment.authorization_code, "123456")
        self.assertEqual(debt.status, Debt.Status.PAID)

    @patch("apps.billing.views.create_transbank_transaction")
    def test_transbank_rejects_fractional_clp_and_pending_duplicate(self, create_transaction):
        self.client.force_authenticate(self.reception)
        debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Consulta",
            amount="25000.50",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )

        fractional = self.client.post(
            "/api/payments/transbank/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )
        self.assertEqual(fractional.status_code, status.HTTP_400_BAD_REQUEST)
        create_transaction.assert_not_called()

        debt.amount = "25000.00"
        debt.save(update_fields=["amount"])
        create_transaction.return_value = {
            "token": "pending-transbank-token",
            "url": "https://webpay3gint.transbank.cl/",
        }
        first = self.client.post(
            "/api/payments/transbank/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )
        repeated = self.client.post(
            "/api/payments/transbank/",
            {"debt_ids": [str(debt.id)]},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(repeated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Payment.objects.filter(status=Payment.Status.PENDING).count(), 1)

    def test_transbank_rejected_return_does_not_settle_debt(self):
        self.client.force_authenticate(self.reception)
        debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Consulta",
            amount="25000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )
        payment = Payment.objects.create(
            tutor=self.tutor,
            created_by=self.reception,
            amount=debt.amount,
            simulated=False,
            status=Payment.Status.PENDING,
            transbank_token="rejected-transbank-token",
            authorization_code="",
        )
        payment.debts.add(debt)
        gateway = Mock()
        gateway.commit.return_value = {
            "response_code": -1,
            "status": "FAILED",
            "buy_order": payment.buy_order,
            "amount": 25000,
            "authorization_code": "",
        }
        with patch("apps.billing.views.get_transbank_transaction", return_value=gateway):
            callback = self.client.get(
                "/api/payments/transbank/return/",
                {"token_ws": "rejected-transbank-token"},
            )

        self.assertEqual(callback.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        debt.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REJECTED)
        self.assertEqual(debt.status, Debt.Status.PENDING)

    def test_transbank_abort_and_timeout_resolve_pending_attempts(self):
        debts = [
            Debt.objects.create(
                tutor=self.tutor,
                pet=self.pet,
                concept=f"Consulta {index}",
                amount="25000.00",
                issued_at=date.today(),
                due_date=date.today() + timedelta(days=7),
            )
            for index in range(2)
        ]
        payments = []
        for index, debt in enumerate(debts):
            payment = Payment.objects.create(
                tutor=self.tutor,
                amount=debt.amount,
                simulated=False,
                status=Payment.Status.PENDING,
                transbank_token=f"transbank-return-token-{index}",
                authorization_code="",
            )
            payment.debts.add(debt)
            payments.append(payment)

        gateway = Mock()
        gateway.status.return_value = {"status": "INITIALIZED"}
        with patch("apps.billing.views.get_transbank_transaction", return_value=gateway):
            aborted = self.client.post(
                "/api/payments/transbank/return/",
                {
                    "TBK_TOKEN": payments[0].transbank_token,
                    "TBK_ORDEN_COMPRA": payments[0].buy_order,
                    "TBK_ID_SESION": str(payments[0].id),
                },
                format="json",
            )
        timed_out = self.client.post(
            "/api/payments/transbank/return/",
            {
                "TBK_ORDEN_COMPRA": payments[1].buy_order,
                "TBK_ID_SESION": str(payments[1].id),
            },
            format="json",
        )

        self.assertEqual(aborted.status_code, status.HTTP_200_OK)
        self.assertEqual(timed_out.status_code, status.HTTP_200_OK)
        payments[0].refresh_from_db()
        payments[1].refresh_from_db()
        self.assertEqual(payments[0].status, Payment.Status.CANCELED)
        self.assertEqual(payments[1].status, Payment.Status.CANCELED)


    def test_schedule_is_readable_but_admin_only_to_change(self):
        self.client.force_authenticate(self.reception)
        self.assertEqual(self.client.get("/api/schedule/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.put(
                "/api/schedule/",
                {"clinic_name": "No autorizado"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_availability_returns_open_slots(self):
        self.client.force_authenticate(self.reception)
        appointment_date = date.today() + timedelta(days=1)
        response = self.client.get(
            "/api/availability/", {"date": appointment_date.isoformat()}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["slots"])
        self.assertNotIn("13:00", [slot["time"] for slot in response.data["slots"]])


class InitialAccountsCommandTests(TestCase):
    def run_command_with(self, emails, passwords):
        with (
            patch("builtins.input", side_effect=emails),
            patch(
                "apps.accounts.management.commands.create_initial_accounts.getpass",
                side_effect=passwords,
            ),
        ):
            call_command("create_initial_accounts", stdout=Mock())

    def test_creates_admin_and_two_veterinarians(self):
        self.run_command_with(
            ["admin@example.com", "vet1@example.com", "vet2@example.com"],
            [
                "Violet!Sky7394",
                "Violet!Sky7394",
                "Mango!River583",
                "Mango!River583",
                "Ocean!Stone471",
                "Ocean!Stone471",
            ],
        )

        self.assertEqual(User.objects.count(), 3)
        admin = User.objects.get(email="admin@example.com")
        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.check_password("Violet!Sky7394"))
        self.assertEqual(
            User.objects.filter(role=User.Role.VETERINARIAN).count(), 2
        )

    def test_completes_missing_accounts_without_duplicating_existing_admin(self):
        admin = User.objects.create_superuser(
            email="existing-admin@example.com",
            password="ExistingAdmin!247",
            name="Admin existente",
        )
        self.run_command_with(
            ["vet1@example.com", "vet2@example.com"],
            [
                "Mango!River583",
                "Mango!River583",
                "Ocean!Stone471",
                "Ocean!Stone471",
            ],
        )

        self.assertEqual(User.objects.count(), 3)
        admin.refresh_from_db()
        self.assertTrue(admin.is_superuser)
        self.assertEqual(
            User.objects.filter(role=User.Role.VETERINARIAN).count(), 2
        )

    def test_running_when_accounts_complete_does_not_prompt_or_duplicate(self):
        User.objects.create_superuser(
            email="admin@example.com",
            password="ExistingAdmin!247",
            name="Admin existente",
        )
        for index in range(2):
            User.objects.create_user(
                email=f"vet{index}@example.com",
                password="ExistingVet!248",
                name=f"Veterinario {index}",
                role=User.Role.VETERINARIAN,
            )

        with patch("builtins.input", side_effect=AssertionError), patch(
            "apps.accounts.management.commands.create_initial_accounts.getpass",
            side_effect=AssertionError,
        ):
            call_command("create_initial_accounts", stdout=Mock())

        self.assertEqual(User.objects.count(), 3)

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.core.management import call_command, CommandError
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.billing.models import Debt, Payment
from apps.patients.models import Pet, Tutor


class AppointmentDebtLinkTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-appointments@example.com",
            name="Admin de prueba",
            password="test-password-123",
            role=User.Role.ADMIN,
        )
        self.tutor = Tutor.objects.create(
            name="Tutor de prueba",
            rut="12.345.678-5",
            email="tutor-appointments@example.com",
        )
        self.pet = Pet.objects.create(
            tutor=self.tutor,
            name="Milo",
            species=Pet.Species.DOG,
        )
        self.appointment = Appointment.objects.create(
            pet=self.pet,
            service="Consulta general",
            date=date.today() + timedelta(days=1),
            time="10:00",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def debt_payload(self, **overrides):
        payload = {
            "tutor": str(self.tutor.id),
            "pet": str(self.pet.id),
            "appointment": str(self.appointment.id),
            "concept": "Cita veterinaria · Consulta general",
            "amount": "25000.00",
            "issued_at": date.today().isoformat(),
            "due_date": (date.today() + timedelta(days=7)).isoformat(),
        }
        payload.update(overrides)
        return payload

    def test_debt_is_linked_to_appointment_and_reported_by_api(self):
        response = self.client.post(
            reverse("debt-list"), self.debt_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201)
        debt = Debt.objects.get()
        self.assertEqual(debt.appointment_id, self.appointment.id)

        appointment_response = self.client.get(
            reverse("appointment-detail", args=[self.appointment.id])
        )
        self.assertEqual(appointment_response.status_code, 200)
        self.assertTrue(appointment_response.data["has_debt"])

    def test_second_debt_cannot_be_linked_to_same_appointment(self):
        Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            appointment=self.appointment,
            concept="Cobro existente",
            amount="10000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )

        response = self.client.post(
            reverse("debt-list"), self.debt_payload(), format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("appointment", response.data)

    def test_cancelled_appointment_cannot_receive_a_debt(self):
        self.appointment.status = Appointment.Status.CANCELLED
        self.appointment.save()

        response = self.client.post(
            reverse("debt-list"), self.debt_payload(), format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("appointment", response.data)

    def test_linked_appointment_cannot_change_pet_or_be_deleted(self):
        debt_response = self.client.post(
            reverse("debt-list"), self.debt_payload(), format="json"
        )
        self.assertEqual(debt_response.status_code, 201)
        other_pet = Pet.objects.create(
            tutor=self.tutor,
            name="Luna",
            species=Pet.Species.CAT,
        )

        update_response = self.client.patch(
            reverse("appointment-detail", args=[self.appointment.id]),
            {"pet": str(other_pet.id)},
            format="json",
        )
        delete_response = self.client.delete(
            reverse("appointment-detail", args=[self.appointment.id])
        )

        self.assertEqual(update_response.status_code, 400)
        self.assertIn("pet", update_response.data)
        self.assertEqual(delete_response.status_code, 400)
        self.assertTrue(Appointment.objects.filter(pk=self.appointment.pk).exists())


@override_settings(DEBUG=True, TRANSBANK_ENVIRONMENT="INTEGRATION")
class DemoPaymentCommandTests(TestCase):
    def test_command_creates_multiple_rut_searchable_demo_debts_idempotently(self):
        call_command("create_demo_payment")
        call_command("create_demo_payment")

        self.assertEqual(Tutor.objects.count(), 1)
        tutor = Tutor.objects.get()
        self.assertEqual(tutor.rut, "11111111-1")
        pet = Pet.objects.get(tutor=tutor)
        self.assertEqual(pet.name, "Milo de prueba")
        debts = Debt.objects.filter(tutor=tutor, pet=pet)
        self.assertEqual(debts.count(), 3)
        self.assertEqual(
            sum((debt.amount for debt in debts), Decimal("0.00")),
            Decimal("24500.00"),
        )
        self.assertTrue(all(debt.status == Debt.Status.PENDING for debt in debts))

        response = self.client.post(
            reverse("public-payment-portal"),
            {"rut": "11.111.111-1"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_due"], Decimal("24500.00"))

    @override_settings(TRANSBANK_ENVIRONMENT="PRODUCTION")
    def test_command_is_disabled_outside_integration(self):
        with self.assertRaises(CommandError):
            call_command("create_demo_payment")

        self.assertEqual(Tutor.objects.count(), 0)
        self.assertEqual(Debt.objects.count(), 0)


@override_settings(DEBUG=True, PUBLIC_BASE_URL="", TRANSBANK_ENVIRONMENT="INTEGRATION")
class PublicPaymentTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tutor = Tutor.objects.create(
            name="Tutor de prueba",
            rut="12.345.678-5",
            email="tutor-public@example.com",
        )
        self.pet = Pet.objects.create(
            tutor=self.tutor,
            name="Milo",
            species=Pet.Species.DOG,
        )
        self.debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Consulta veterinaria",
            amount="25000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
        )
        self.url = reverse(
            "public-payment", kwargs={"token": self.debt.payment_token}
        )

    def test_public_page_requires_the_random_payment_token(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Consulta veterinaria")
        self.assertContains(response, "Continuar a Webpay Plus")

        invalid = self.client.get("/pagar/token-invalido/")
        self.assertEqual(invalid.status_code, 404)

    def test_rut_lookup_displays_only_pending_debts_and_total(self):
        paid_debt = Debt.objects.create(
            tutor=self.tutor,
            pet=self.pet,
            concept="Cuenta ya pagada",
            amount="10000.00",
            issued_at=date.today(),
            due_date=date.today() + timedelta(days=7),
            status=Debt.Status.PAID,
        )
        response = self.client.post(
            reverse("public-payment-portal"),
            {"rut": "12.345.678-5"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Consulta veterinaria")
        self.assertEqual(response.context["total_due"], Decimal("25000.00"))
        self.assertContains(response, "Pagar esta cuenta con Transbank")
        self.assertNotContains(response, "Cuenta ya pagada")
        self.assertNotContains(response, self.tutor.name)
        self.assertNotContains(response, str(paid_debt.id))

    def test_rut_lookup_rejects_invalid_rut(self):
        response = self.client.post(
            reverse("public-payment-portal"),
            {"rut": "12.345.678-9"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertContains(
            response, "Ingresa un RUT chileno válido.", status_code=400
        )

    def test_public_rut_lookup_requires_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)

        response = client.post(
            reverse("public-payment-portal"),
            {"rut": "12.345.678-5"},
        )

        self.assertEqual(response.status_code, 403)

    @override_settings(TRANSBANK_ENVIRONMENT="PRODUCTION")
    def test_public_rut_lookup_is_disabled_outside_integration(self):
        response = self.client.post(
            reverse("public-payment-portal"),
            {"rut": "12345678-5"},
        )

        self.assertEqual(response.status_code, 503)
        self.assertContains(
            response,
            "solo está habilitada en el ambiente de integración",
            status_code=503,
        )

    def test_rut_lookup_does_not_disclose_whether_rut_is_registered(self):
        response = self.client.post(
            reverse("public-payment-portal"),
            {"rut": "11111111-1"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "No encontramos cuentas pendientes")
        self.assertNotContains(response, self.tutor.name)

    def test_rut_lookup_rate_limits_repeated_attempts(self):
        url = reverse("public-payment-portal")
        for _ in range(10):
            response = self.client.post(url, {"rut": "11111111-1"})
            self.assertEqual(response.status_code, 200)

        limited = self.client.post(url, {"rut": "11111111-1"})
        self.assertEqual(limited.status_code, 429)

    def test_checkout_post_requires_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)

        response = client.post(self.url, {"action": "checkout"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Payment.objects.count(), 0)

    @patch("apps.billing.public_views.get_transbank_transaction")
    def test_checkout_redirects_to_the_official_transbank_form(self, get_gateway):
        gateway = Mock()
        gateway.create.return_value = {
            "token": "public-checkout-token",
            "url": "https://webpay3gint.transbank.cl/webpayserver/initTransaction",
        }
        get_gateway.return_value = gateway

        response = self.client.post(self.url, {"action": "checkout"})

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'action="https://webpay3gint.transbank.cl/')
        self.assertContains(response, 'name="token_ws" value="public-checkout-token"')
        payment = Payment.objects.get(transbank_token="public-checkout-token")
        self.assertFalse(payment.simulated)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.debts.get(), self.debt)
        return_path = reverse(
            "public-payment-return",
            kwargs={"token": self.debt.payment_token},
        )
        gateway.create.assert_called_once_with(
            buy_order=payment.buy_order,
            session_id=str(payment.id),
            amount=25000,
            return_url=f"http://testserver{return_path}",
        )

    @patch("apps.billing.public_views.get_transbank_transaction")
    def test_second_checkout_is_blocked_while_first_is_pending(self, get_gateway):
        gateway = Mock()
        gateway.create.return_value = {
            "token": "public-checkout-token",
            "url": "https://webpay3gint.transbank.cl/init",
        }
        get_gateway.return_value = gateway

        first = self.client.post(self.url, {"action": "checkout"})
        second = self.client.post(self.url, {"action": "checkout"})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Payment.objects.count(), 1)
        gateway.create.assert_called_once()

    @patch("apps.billing.views.get_transbank_transaction")
    def test_transbank_authorization_return_marks_the_debt_paid(self, get_gateway):
        payment = Payment.objects.create(
            tutor=self.tutor,
            amount=self.debt.amount,
            simulated=False,
            status=Payment.Status.PENDING,
            transbank_token="public-return-token",
            authorization_code="",
        )
        payment.debts.add(self.debt)
        gateway = Mock()
        gateway.commit.return_value = {
            "response_code": 0,
            "status": "AUTHORIZED",
            "buy_order": payment.buy_order,
            "amount": 25000,
            "authorization_code": "123456",
        }
        get_gateway.return_value = gateway

        response = self.client.get(
            reverse(
                "public-payment-return",
                kwargs={"token": self.debt.payment_token},
            ),
            {"token_ws": "public-return-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Pago autorizado")
        payment.refresh_from_db()
        self.debt.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.AUTHORIZED)
        self.assertEqual(self.debt.status, Debt.Status.PAID)

    def test_public_transbank_return_rejects_an_unknown_token(self):
        response = self.client.get(
            reverse(
                "public-payment-return",
                kwargs={"token": self.debt.payment_token},
            ),
            {"token_ws": "not-a-payment-token"},
        )

        self.assertEqual(response.status_code, 400)

    @patch("apps.billing.views.get_transbank_transaction")
    def test_transbank_post_return_is_exempt_from_csrf(self, get_gateway):
        payment = Payment.objects.create(
            tutor=self.tutor,
            amount=self.debt.amount,
            simulated=False,
            status=Payment.Status.PENDING,
            transbank_token="public-cancel-token",
            authorization_code="",
        )
        payment.debts.add(self.debt)
        gateway = Mock()
        gateway.status.return_value = {"status": "INITIALIZED"}
        get_gateway.return_value = gateway
        client = Client(enforce_csrf_checks=True)

        response = client.post(
            reverse(
                "public-payment-return",
                kwargs={"token": self.debt.payment_token},
            ),
            {
                "TBK_TOKEN": payment.transbank_token,
                "TBK_ORDEN_COMPRA": payment.buy_order,
                "TBK_ID_SESION": str(payment.id),
            },
        )

        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CANCELED)

    @patch("apps.billing.public_views.get_transbank_transaction")
    def test_invalid_checkout_response_is_held_for_manual_review(self, get_gateway):
        gateway = Mock()
        gateway.create.return_value = {
            "token": "public-checkout-token",
            "url": "https://attacker.example/collect",
        }
        get_gateway.return_value = gateway

        response = self.client.post(self.url, {"action": "checkout"})

        self.assertEqual(response.status_code, 502)
        payment = Payment.objects.get()
        self.assertEqual(payment.status, Payment.Status.REVIEW)
        self.assertEqual(
            self.client.post(self.url, {"action": "checkout"}).status_code,
            409,
        )

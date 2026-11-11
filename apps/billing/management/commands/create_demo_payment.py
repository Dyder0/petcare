from datetime import date, timedelta
from decimal import Decimal
from urllib.parse import urljoin

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.urls import reverse

from apps.billing.models import Debt, Payment
from apps.patients.models import Pet, Tutor
from apps.patients.validators import normalize_rut


DEMO_RUT = "11.111.111-1"
DEMO_TUTOR_NAME = "Cliente de prueba"
DEMO_TUTOR_EMAIL = "cliente-demo@petcare.test"
DEMO_PET_NAME = "Milo de prueba"
DEMO_DEBTS = (
    ("Cuenta de prueba Webpay Plus", Decimal("1000.00"), 7),
    ("Consulta veterinaria de prueba", Decimal("15000.00"), 14),
    ("Vacuna de prueba", Decimal("8500.00"), 21),
)


class Command(BaseCommand):
    help = "Crea un tutor, una mascota y deudas de prueba para pagar por RUT."

    def handle(self, *args, **options):
        if not settings.DEBUG or settings.TRANSBANK_ENVIRONMENT != "INTEGRATION":
            raise CommandError(
                "Este comando solo funciona con DEBUG=True y Transbank INTEGRATION."
            )

        rut = normalize_rut(DEMO_RUT)
        rut_body, rut_verifier = rut.split("-")
        formatted_body = f"{int(rut_body):,}".replace(",", ".")
        rut_variants = (
            rut,
            f"{formatted_body}-{rut_verifier}",
            f"{rut_body}{rut_verifier}",
        )

        with transaction.atomic():
            tutor = Tutor.objects.filter(rut__in=rut_variants).first()
            if tutor is None:
                if Tutor.objects.filter(email__iexact=DEMO_TUTOR_EMAIL).exists():
                    raise CommandError(
                        f"El correo {DEMO_TUTOR_EMAIL} ya pertenece a otro RUT."
                    )
                tutor = Tutor.objects.create(
                    name=DEMO_TUTOR_NAME,
                    rut=rut,
                    email=DEMO_TUTOR_EMAIL,
                    phone="",
                )

            pet, _ = Pet.objects.get_or_create(
                tutor=tutor,
                name=DEMO_PET_NAME,
                defaults={"species": Pet.Species.DOG},
            )
            debts = []
            created_count = 0
            today = date.today()
            for concept, amount, due_days in DEMO_DEBTS:
                debt, created = Debt.objects.get_or_create(
                    tutor=tutor,
                    pet=pet,
                    concept=concept,
                    defaults={
                        "amount": amount,
                        "issued_at": today,
                        "due_date": today + timedelta(days=due_days),
                        "status": Debt.Status.PENDING,
                    },
                )
                if created:
                    created_count += 1
                if debt.status == Debt.Status.PENDING and debt.payments.filter(
                    status__in=[Payment.Status.PENDING, Payment.Status.REVIEW]
                ).exists():
                    raise CommandError(
                        f"La cuenta '{debt.concept}' ya tiene un pago pendiente "
                        "de confirmación."
                    )
                debts.append(debt)

        path = reverse(
            "public-payment-portal"
        )
        base_url = settings.PUBLIC_BASE_URL or "http://127.0.0.1:8000"
        portal_url = urljoin(f"{base_url.rstrip('/')}/", path.lstrip("/"))
        message = (
            f"Se crearon {created_count} de {len(DEMO_DEBTS)} deudas de prueba."
            if created_count
            else "Las deudas de prueba ya existen."
        )
        self.stdout.write(self.style.SUCCESS(message))
        self.stdout.write(f"Cliente: {tutor.name}")
        self.stdout.write(f"RUT para consultar: {DEMO_RUT}")
        self.stdout.write(f"Mascota: {pet.name}")
        for debt in debts:
            status_label = "pendiente" if debt.status == Debt.Status.PENDING else "pagada"
            self.stdout.write(f"- {debt.concept}: ${debt.amount:.0f} CLP ({status_label})")
        self.stdout.write("Total de las cuentas de prueba: $24.500 CLP")
        self.stdout.write(f"Portal de pago: {portal_url}")

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from apps.common.models import TimestampedUUIDModel
from apps.patients.models import Pet, Tutor


def new_buy_order():
    return f"PC-{uuid.uuid4().hex[:12]}"


def new_authorization_code():
    return f"SIM-{uuid.uuid4().hex[:8].upper()}"


def new_payment_token():
    return uuid.uuid4().hex


class Debt(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "pendiente", "Pendiente"
        PAID = "pagada", "Pagada"

    tutor = models.ForeignKey(Tutor, on_delete=models.PROTECT, related_name="debts")
    pet = models.ForeignKey(Pet, on_delete=models.PROTECT, related_name="debts")
    appointment = models.OneToOneField(
        "appointments.Appointment",
        on_delete=models.PROTECT,
        related_name="debt",
        blank=True,
        null=True,
    )
    concept = models.CharField(max_length=180)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    issued_at = models.DateField()
    due_date = models.DateField()
    payment_token = models.CharField(
        max_length=32, unique=True, default=new_payment_token, editable=False
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    paid_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["status", "due_date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="debt_amount_positive"
            )
        ]

    def clean(self):
        super().clean()
        errors = {}
        if self.pet_id and self.tutor_id and self.pet.tutor_id != self.tutor_id:
            errors["pet"] = "El tutor seleccionado no es responsable de esta mascota."
        if self.issued_at and self.due_date and self.due_date < self.issued_at:
            errors["due_date"] = "El vencimiento no puede ser anterior a la emisión."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.concept} — {self.amount}"


class Payment(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        AUTHORIZED = "authorized", "Autorizado"
        REJECTED = "rejected", "Rechazado"
        CANCELED = "canceled", "Cancelado"
        REVIEW = "review", "Revisión manual"

    tutor = models.ForeignKey(Tutor, on_delete=models.PROTECT, related_name="payments")
    debts = models.ManyToManyField(Debt, related_name="payments")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="payments",
        null=True,
        blank=True,
    )
    buy_order = models.CharField(
        max_length=40, unique=True, default=new_buy_order
    )
    authorization_code = models.CharField(
        max_length=20, blank=True, default=new_authorization_code
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    simulated = models.BooleanField(default=True, editable=False)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    transbank_token = models.CharField(
        max_length=64, unique=True, blank=True, null=True
    )
    response_code = models.SmallIntegerField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.buy_order} — {self.amount}"

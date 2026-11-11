from django.conf import settings
from django.db import models

from apps.common.models import TimestampedUUIDModel
from apps.patients.models import Pet


class MedicalRecord(TimestampedUUIDModel):
    class RecordType(models.TextChoices):
        DIAGNOSIS = "diagnostico", "Diagnóstico"
        TREATMENT = "tratamiento", "Tratamiento"
        PRESCRIPTION = "receta", "Receta"
        EXAM = "examen", "Examen"
        VACCINE = "vacuna", "Vacuna"

    class Status(models.TextChoices):
        ACTIVE = "activo", "Activo"
        FINISHED = "finalizado", "Finalizado"

    pet = models.ForeignKey(Pet, on_delete=models.PROTECT, related_name="medical_records")
    veterinarian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="medical_records",
        null=True,
        blank=True,
    )
    record_type = models.CharField(max_length=20, choices=RecordType.choices)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    date = models.DateField()
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.ACTIVE
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.get_record_type_display()}: {self.title}"


class Reminder(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "pendiente", "Pendiente"
        SENT = "enviado", "Enviado"

    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name="reminders")
    title = models.CharField(max_length=180)
    date = models.DateField()
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )

    class Meta:
        ordering = ["date", "created_at"]

    def __str__(self):
        return f"{self.title} — {self.pet.name}"

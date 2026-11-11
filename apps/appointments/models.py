from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import TimestampedUUIDModel
from apps.patients.models import Pet


class ClinicSettings(models.Model):
    clinic_name = models.CharField(max_length=150, default="PetCare Providencia")
    slot_minutes = models.PositiveSmallIntegerField(default=30)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Clinic settings cannot be deleted.")

    def __str__(self):
        return self.clinic_name


class ScheduleDay(models.Model):
    day_of_week = models.PositiveSmallIntegerField(
        primary_key=True, choices=[(day, str(day)) for day in range(7)]
    )
    active = models.BooleanField(default=False)
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    break_start = models.TimeField(blank=True, null=True)
    break_end = models.TimeField(blank=True, null=True)

    class Meta:
        ordering = ["day_of_week"]

    def __str__(self):
        return str(self.get_day_of_week_display())


class Appointment(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "pendiente", "Pendiente"
        CONFIRMED = "confirmada", "Confirmada"
        ATTENDED = "atendida", "Atendida"
        CANCELLED = "cancelada", "Cancelada"

    pet = models.ForeignKey(Pet, on_delete=models.PROTECT, related_name="appointments")
    veterinarian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="appointments",
        blank=True,
        null=True,
    )
    service = models.CharField(max_length=120)
    date = models.DateField()
    time = models.TimeField()
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["date", "time"]
        constraints = [
            models.UniqueConstraint(
                fields=["veterinarian", "date", "time"],
                condition=~Q(status="cancelada"),
                name="unique_active_vet_appointment_slot",
            )
        ]

    def __str__(self):
        return f"{self.pet.name} — {self.date} {self.time}"

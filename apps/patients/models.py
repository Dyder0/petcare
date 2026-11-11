import uuid

from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models.functions import Lower

from apps.common.models import TimestampedUUIDModel
from apps.patients.validators import validate_rut


def new_record_number():
    return f"PC-{uuid.uuid4().hex[:8].upper()}"


class Tutor(TimestampedUUIDModel):
    name = models.CharField(max_length=150)
    rut = models.CharField(
        max_length=12, unique=True, blank=True, null=True, validators=[validate_rut]
    )
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField()

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="unique_tutor_email_ci")
        ]

    def __str__(self):
        return self.name


class Pet(TimestampedUUIDModel):
    class Species(models.TextChoices):
        DOG = "Perro", "Perro"
        CAT = "Gato", "Gato"
        OTHER = "Otro", "Otro"

    class Sex(models.TextChoices):
        MALE = "Macho", "Macho"
        FEMALE = "Hembra", "Hembra"

    tutor = models.ForeignKey(Tutor, on_delete=models.PROTECT, related_name="pets")
    name = models.CharField(max_length=120)
    species = models.CharField(max_length=20, choices=Species.choices)
    breed = models.CharField(max_length=120, blank=True)
    age = models.PositiveSmallIntegerField(
        blank=True, null=True, validators=[MaxValueValidator(100)]
    )
    sex = models.CharField(max_length=10, choices=Sex.choices, blank=True)
    reproductive_status = models.CharField(max_length=30, blank=True)
    weight = models.CharField(max_length=20, blank=True)
    microchip = models.CharField(max_length=40, unique=True, blank=True, null=True)
    record_number = models.CharField(
        max_length=11, unique=True, default=new_record_number, editable=False
    )
    photo = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} ({self.record_number})"

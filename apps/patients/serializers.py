from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.patients.models import Pet, Tutor
from apps.patients.validators import (
    normalize_rut,
    validate_pet_photo,
    validate_rut,
)


class TutorSerializer(serializers.ModelSerializer):
    rut = serializers.CharField(
        allow_blank=True, allow_null=True, required=False, max_length=12
    )

    class Meta:
        model = Tutor
        fields = ["id", "name", "rut", "phone", "email", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_rut(self, value):
        if not value:
            return None
        normalized = normalize_rut(value)
        try:
            validate_rut(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return normalized

    def validate_email(self, value):
        matches = Tutor.objects.filter(email__iexact=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError(
                "Ya existe un tutor registrado con ese correo."
            )
        return value.lower()


class PetSerializer(serializers.ModelSerializer):
    microchip = serializers.CharField(
        allow_blank=True, allow_null=True, required=False, max_length=40
    )
    photo = serializers.CharField(
        required=False, allow_blank=True, max_length=7_000_000
    )

    class Meta:
        model = Pet
        fields = [
            "id",
            "tutor",
            "name",
            "species",
            "breed",
            "age",
            "sex",
            "reproductive_status",
            "weight",
            "microchip",
            "record_number",
            "photo",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "record_number", "created_at", "updated_at"]

    def validate_microchip(self, value):
        return value.strip() or None if value else None

    def validate_photo(self, value):
        try:
            validate_pet_photo(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value


class TutorRegistrationInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    rut = serializers.CharField(max_length=12)
    phone = serializers.CharField(max_length=30)
    email = serializers.EmailField()

    def validate_rut(self, value):
        try:
            validate_rut(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return normalize_rut(value)

    def validate(self, attrs):
        attrs["email"] = attrs["email"].lower()
        conflict = Tutor.objects.filter(rut=attrs["rut"]).exclude(
            email__iexact=attrs["email"]
        )
        if conflict.exists():
            raise serializers.ValidationError(
                {"rut": "Ese RUT ya está asociado a otro correo."}
            )
        return attrs


class PetRegistrationInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    species = serializers.ChoiceField(choices=Pet.Species.choices)
    breed = serializers.CharField(max_length=120, required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=0, max_value=100)
    sex = serializers.ChoiceField(choices=Pet.Sex.choices)
    reproductive_status = serializers.CharField(
        max_length=30, required=False, allow_blank=True, default="No informado"
    )
    photo = serializers.CharField(
        required=False, allow_blank=True, max_length=7_000_000
    )

    def validate_photo(self, value):
        try:
            validate_pet_photo(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value


class PatientRegistrationSerializer(serializers.Serializer):
    tutor = TutorRegistrationInputSerializer()
    pet = PetRegistrationInputSerializer()

    def create(self, validated_data):
        tutor_data = validated_data["tutor"]
        pet_data = validated_data["pet"]
        tutor = Tutor.objects.filter(email__iexact=tutor_data["email"]).first()
        if tutor:
            tutor.name = tutor_data["name"]
            tutor.rut = tutor_data["rut"]
            tutor.phone = tutor_data["phone"]
            tutor.email = tutor_data["email"]
            tutor.save()
        else:
            tutor = Tutor.objects.create(**tutor_data)
        return Pet.objects.create(tutor=tutor, **pet_data)

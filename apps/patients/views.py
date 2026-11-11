from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.patients.models import Pet, Tutor
from apps.patients.serializers import (
    PatientRegistrationSerializer,
    PetSerializer,
    TutorSerializer,
)


class TutorViewSet(ModelViewSet):
    queryset = Tutor.objects.all()
    serializer_class = TutorSerializer
    filterset_fields = ["email"]
    search_fields = ["name", "rut", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as exc:
            raise ValidationError(
                "No se puede eliminar el tutor porque aún tiene mascotas o cuentas asociadas."
            ) from exc


class PetViewSet(ModelViewSet):
    queryset = Pet.objects.select_related("tutor").all()
    serializer_class = PetSerializer
    filterset_fields = ["tutor", "species", "sex"]
    search_fields = ["name", "record_number", "breed", "microchip", "tutor__name"]
    ordering_fields = ["name", "species", "age", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["post"], url_path="register")
    def register(self, request):
        serializer = PatientRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            # Keep tutor reuse/update and the first pet creation as one operation.
            with transaction.atomic():
                pet = serializer.save()
        except IntegrityError as exc:
            raise ValidationError(
                "El tutor o la mascota ya existen; verifica el correo, RUT y microchip."
            ) from exc
        return Response(
            {"tutor": TutorSerializer(pet.tutor).data, "pet": PetSerializer(pet).data},
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as exc:
            raise ValidationError(
                "No se puede eliminar la mascota porque conserva citas, fichas clínicas o cuentas."
            ) from exc

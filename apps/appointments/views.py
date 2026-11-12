from datetime import datetime, timedelta

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from drf_spectacular.utils import extend_schema

from apps.accounts.models import User
from apps.appointments.models import Appointment, ClinicSettings, ScheduleDay
from apps.appointments.serializers import (
    AppointmentSerializer,
    ClinicScheduleSerializer,
)
from apps.common.permissions import IsAdministrator


class AppointmentViewSet(ModelViewSet):
    queryset = Appointment.objects.select_related(
        "pet", "pet__tutor", "veterinarian", "debt"
    ).all()
    serializer_class = AppointmentSerializer
    filterset_fields = ["pet", "veterinarian", "status", "date"]
    search_fields = ["pet__name", "pet__tutor__name", "service", "notes"]
    ordering_fields = ["date", "time", "created_at"]
    ordering = ["date", "time"]

    @action(detail=False, methods=["get"], url_path="veterinarians")
    def veterinarians(self, request):
        veterinarians = User.objects.filter(
            role=User.Role.VETERINARIAN,
            is_active=True,
        ).order_by("name").values("id", "name", "email", "specialty")
        return Response(list(veterinarians))

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            raise ValidationError(
                {"time": "El profesional ya tiene una cita en ese horario."}
            ) from exc

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            raise ValidationError(
                {"time": "El profesional ya tiene una cita en ese horario."}
            ) from exc

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as exc:
            raise ValidationError(
                "No se puede eliminar una cita que tiene un cobro asociado."
            ) from exc


class ScheduleView(APIView):
    def get_permissions(self):
        permission = IsAdministrator if self.request.method != "GET" else IsAuthenticated
        return [permission()]

    @extend_schema(responses=ClinicScheduleSerializer)
    def get(self, request):
        settings, _ = ClinicSettings.objects.get_or_create(pk=1)
        days = ScheduleDay.objects.all().values(
            "day_of_week",
            "active",
            "opening_time",
            "closing_time",
            "break_start",
            "break_end",
        )
        return Response(
            {
                "clinic_name": settings.clinic_name,
                "slot_minutes": settings.slot_minutes,
                "days": list(days),
            }
        )

    @extend_schema(request=ClinicScheduleSerializer, responses=ClinicScheduleSerializer)
    def put(self, request):
        serializer = ClinicScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            settings, _ = ClinicSettings.objects.get_or_create(pk=1)
            settings.clinic_name = serializer.validated_data["clinic_name"]
            settings.slot_minutes = serializer.validated_data["slot_minutes"]
            settings.save()
            for day in serializer.validated_data["days"]:
                day_of_week = day.pop("day_of_week")
                ScheduleDay.objects.update_or_create(
                    day_of_week=day_of_week, defaults=day
                )
        return self.get(request)


class AvailabilityQuerySerializer(serializers.Serializer):
    date = serializers.DateField()
    veterinarian = serializers.UUIDField(required=False)


class AvailabilitySlotSerializer(serializers.Serializer):
    time = serializers.TimeField()
    available = serializers.BooleanField()
    veterinarian_ids = serializers.ListField(child=serializers.UUIDField())


class AvailabilityResponseSerializer(serializers.Serializer):
    date = serializers.DateField()
    slots = AvailabilitySlotSerializer(many=True)


class AvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[AvailabilityQuerySerializer],
        responses=AvailabilityResponseSerializer,
    )
    def get(self, request):
        date_serializer = AvailabilityQuerySerializer(data=request.query_params)
        date_serializer.is_valid(raise_exception=True)
        selected_date = date_serializer.validated_data["date"]
        schedule = ScheduleDay.objects.filter(
            day_of_week=selected_date.weekday(), active=True
        ).first()
        if not schedule:
            return Response({"date": selected_date, "slots": []})

        settings, _ = ClinicSettings.objects.get_or_create(pk=1)
        slot_minutes = settings.slot_minutes
        start = datetime.combine(selected_date, schedule.opening_time)
        closing = datetime.combine(selected_date, schedule.closing_time)
        active_vets = User.objects.filter(
            role=User.Role.VETERINARIAN, is_active=True
        )
        veterinarian_id = request.query_params.get("veterinarian")
        if veterinarian_id:
            active_vets = active_vets.filter(pk=veterinarian_id)
        vets = list(active_vets)
        appointments = Appointment.objects.filter(
            date=selected_date,
            veterinarian__in=[vet.pk for vet in vets],
        ).exclude(status=Appointment.Status.CANCELLED)
        booked = {(item.veterinarian_id, item.time) for item in appointments}

        slots = []
        while start + timedelta(minutes=slot_minutes) <= closing:
            end = start + timedelta(minutes=slot_minutes)
            if not (
                schedule.break_start
                and start.time() < schedule.break_end
                and end.time() > schedule.break_start
            ):
                time_value = start.time().replace(second=0, microsecond=0)
                free_vets = [
                    str(vet.pk)
                    for vet in vets
                    if (vet.pk, time_value) not in booked
                ]
                slots.append(
                    {
                        "time": time_value.isoformat(timespec="minutes"),
                        "available": bool(free_vets),
                        "veterinarian_ids": free_vets,
                    }
                )
            start = end
        return Response({"date": selected_date, "slots": slots})

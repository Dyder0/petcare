from datetime import datetime, timedelta

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from apps.accounts.models import User
from apps.appointments.models import Appointment, ClinicSettings, ScheduleDay


class AppointmentSerializer(serializers.ModelSerializer):
    has_debt = serializers.SerializerMethodField()
    veterinarian = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.VETERINARIAN),
        allow_null=False,
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "pet",
            "veterinarian",
            "service",
            "date",
            "time",
            "status",
            "notes",
            "has_debt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    @extend_schema_field(serializers.BooleanField)
    def get_has_debt(self, obj):
        return hasattr(obj, "debt")

    def validate(self, attrs):
        appointment_date = attrs.get("date", getattr(self.instance, "date", None))
        appointment_time = attrs.get("time", getattr(self.instance, "time", None))
        status_value = attrs.get("status", getattr(self.instance, "status", None))
        veterinarian = attrs.get(
            "veterinarian", getattr(self.instance, "veterinarian", None)
        )
        pet = attrs.get("pet", getattr(self.instance, "pet", None))
        if (
            self.instance
            and hasattr(self.instance, "debt")
            and pet
            and pet.pk != self.instance.pet_id
        ):
            raise serializers.ValidationError(
                {"pet": "No se puede cambiar la mascota de una cita con un cobro asociado."}
            )
        if (
            self.instance
            and status_value == Appointment.Status.CANCELLED
            and hasattr(self.instance, "debt")
        ):
            raise serializers.ValidationError(
                {"status": "No se puede cancelar una cita que tiene un cobro asociado."}
            )

        if status_value != Appointment.Status.CANCELLED:
            schedule = ScheduleDay.objects.filter(
                day_of_week=appointment_date.weekday(), active=True
            ).first()
            if not schedule:
                raise serializers.ValidationError(
                    {"date": "La clínica no atiende ese día."}
                )

            settings = ClinicSettings.objects.filter(pk=1).first()
            slot_minutes = settings.slot_minutes if settings else 30
            start = datetime.combine(appointment_date, appointment_time)
            end = start + timedelta(minutes=slot_minutes)
            if (
                appointment_time < schedule.opening_time
                or end.time() > schedule.closing_time
            ):
                raise serializers.ValidationError(
                    {"time": "La hora está fuera del horario de atención."}
                )
            if (
                schedule.break_start
                and appointment_time < schedule.break_end
                and end.time() > schedule.break_start
            ):
                raise serializers.ValidationError(
                    {"time": "La hora coincide con el bloque de colación."}
                )
            minutes = appointment_time.hour * 60 + appointment_time.minute
            opening_minutes = (
                schedule.opening_time.hour * 60 + schedule.opening_time.minute
            )
            if (minutes - opening_minutes) % slot_minutes:
                raise serializers.ValidationError(
                    {"time": "La hora no corresponde a un bloque disponible."}
                )

            if veterinarian:
                conflicts = Appointment.objects.filter(
                    veterinarian=veterinarian,
                    date=appointment_date,
                    time=appointment_time,
                ).exclude(status=Appointment.Status.CANCELLED)
                if self.instance:
                    conflicts = conflicts.exclude(pk=self.instance.pk)
                if conflicts.exists():
                    raise serializers.ValidationError(
                        {"time": "El profesional ya tiene una cita en ese horario."}
                    )

        return attrs


class ScheduleDayInputSerializer(serializers.Serializer):
    day_of_week = serializers.IntegerField(min_value=0, max_value=6)
    active = serializers.BooleanField()
    opening_time = serializers.TimeField()
    closing_time = serializers.TimeField()
    break_start = serializers.TimeField(required=False, allow_null=True)
    break_end = serializers.TimeField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["active"] and attrs["opening_time"] >= attrs["closing_time"]:
            raise serializers.ValidationError(
                "El cierre debe ser posterior a la apertura."
            )
        start = attrs.get("break_start")
        end = attrs.get("break_end")
        if bool(start) != bool(end):
            raise serializers.ValidationError(
                "Debes indicar el inicio y fin de colación."
            )
        if start and end and not (
            attrs["opening_time"] <= start < end <= attrs["closing_time"]
        ):
            raise serializers.ValidationError(
                "La colación debe quedar dentro del horario de atención."
            )
        return attrs


class ClinicScheduleSerializer(serializers.Serializer):
    clinic_name = serializers.CharField(max_length=150)
    slot_minutes = serializers.IntegerField(min_value=5, max_value=120)
    days = ScheduleDayInputSerializer(many=True)

    def validate_days(self, days):
        numbers = [day["day_of_week"] for day in days]
        if sorted(numbers) != list(range(7)):
            raise serializers.ValidationError(
                "Debe incluir exactamente una configuración para cada día de la semana."
            )
        return days

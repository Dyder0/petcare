from rest_framework import serializers

from apps.accounts.models import User
from apps.medical.models import MedicalRecord, Reminder


class MedicalRecordSerializer(serializers.ModelSerializer):
    veterinarian = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(
            role__in=[User.Role.ADMIN, User.Role.VETERINARIAN]
        ),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = MedicalRecord
        fields = [
            "id",
            "pet",
            "veterinarian",
            "record_type",
            "title",
            "description",
            "date",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = [
            "id",
            "pet",
            "title",
            "date",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

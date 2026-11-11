from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from apps.common.permissions import IsAdministratorOrVeterinarian
from apps.medical.models import MedicalRecord, Reminder
from apps.medical.serializers import MedicalRecordSerializer, ReminderSerializer


class MedicalRecordViewSet(ModelViewSet):
    queryset = MedicalRecord.objects.select_related(
        "pet", "pet__tutor", "veterinarian"
    ).all()
    serializer_class = MedicalRecordSerializer
    filterset_fields = ["pet", "veterinarian", "record_type", "status", "date"]
    search_fields = ["pet__name", "pet__record_number", "title", "description"]
    ordering_fields = ["date", "created_at", "title"]
    ordering = ["-date", "-created_at"]

    def get_permissions(self):
        permission = (
            IsAuthenticated
            if self.action in ("list", "retrieve")
            else IsAdministratorOrVeterinarian
        )
        return [permission()]

    def perform_create(self, serializer):
        veterinarian = self.request.user
        if veterinarian.role == veterinarian.Role.VETERINARIAN:
            serializer.save(veterinarian=veterinarian)
        else:
            serializer.save()


class ReminderViewSet(ModelViewSet):
    queryset = Reminder.objects.select_related(
        "pet", "pet__tutor"
    ).all()
    serializer_class = ReminderSerializer
    filterset_fields = ["pet", "status", "date"]
    search_fields = ["title", "pet__name", "pet__tutor__name"]
    ordering_fields = ["date", "created_at", "title"]
    ordering = ["date"]

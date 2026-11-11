from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import User
from apps.accounts.serializers import ProfileSerializer, UserSerializer
from apps.common.permissions import IsAdministrator


class UserViewSet(ModelViewSet):
    queryset = User.objects.all().order_by("name")
    serializer_class = UserSerializer
    permission_classes = [IsAdministrator]
    search_fields = ["email", "name", "specialty"]
    filterset_fields = ["role", "is_active"]
    ordering_fields = ["name", "email", "date_joined"]

    def perform_update(self, serializer):
        instance = serializer.instance
        values = serializer.validated_data
        if instance == self.request.user and values.get("is_active") is False:
            raise ValidationError("No puedes desactivar tu propia cuenta.")
        is_admin = instance.role == User.Role.ADMIN and instance.is_active
        remains_admin = (
            values.get("role", instance.role) == User.Role.ADMIN
            and values.get("is_active", instance.is_active)
        )
        if is_admin and not remains_admin:
            other_admins = User.objects.filter(
                role=User.Role.ADMIN, is_active=True
            ).exclude(pk=instance.pk)
            if not other_admins.exists():
                raise ValidationError("Debe quedar al menos un administrador activo.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError("No puedes eliminar tu propia cuenta.")
        if (
            instance.role == User.Role.ADMIN
            and instance.is_active
            and not User.objects.filter(
                role=User.Role.ADMIN, is_active=True
            ).exclude(pk=instance.pk).exists()
        ):
            raise ValidationError("Debe quedar al menos un administrador activo.")
        instance.delete()


class ProfileView(RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user

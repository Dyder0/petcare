from urllib.parse import urljoin

from django.conf import settings
from django.urls import reverse
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from apps.appointments.models import Appointment
from apps.billing.models import Debt, Payment


class DebtSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    paid_at = serializers.DateTimeField(read_only=True)
    payment_url = serializers.SerializerMethodField()

    class Meta:
        model = Debt
        fields = [
            "id",
            "tutor",
            "pet",
            "appointment",
            "concept",
            "amount",
            "issued_at",
            "due_date",
            "payment_url",
            "status",
            "paid_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "status",
            "paid_at",
        ]

    @extend_schema_field(serializers.CharField)
    def get_payment_url(self, obj):
        path = reverse("public-payment", kwargs={"token": obj.payment_token})
        if settings.PUBLIC_BASE_URL:
            return urljoin(
                f"{settings.PUBLIC_BASE_URL}/", path.lstrip("/")
            )
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(path)
        return path

    def validate(self, attrs):
        pet = attrs.get("pet", getattr(self.instance, "pet", None))
        tutor = attrs.get("tutor", getattr(self.instance, "tutor", None))
        if pet and tutor and pet.tutor_id != tutor.id:
            raise serializers.ValidationError(
                {"tutor": "El tutor seleccionado no es responsable de esta mascota."}
            )
        appointment = attrs.get(
            "appointment", getattr(self.instance, "appointment", None)
        )
        if appointment and pet and appointment.pet_id != pet.id:
            raise serializers.ValidationError(
                {"appointment": "La cita seleccionada corresponde a otra mascota."}
            )
        if appointment and tutor and appointment.pet.tutor_id != tutor.id:
            raise serializers.ValidationError(
                {"appointment": "La cita seleccionada corresponde a otro tutor."}
            )
        if appointment:
            if appointment.status == Appointment.Status.CANCELLED:
                raise serializers.ValidationError(
                    {"appointment": "No se puede cobrar una cita cancelada."}
                )
            existing_debt = Debt.objects.filter(appointment=appointment)
            if self.instance:
                existing_debt = existing_debt.exclude(pk=self.instance.pk)
            if existing_debt.exists():
                raise serializers.ValidationError(
                    {"appointment": "La cita ya tiene una cuenta por cobrar asociada."}
                )
        issued_at = attrs.get("issued_at", getattr(self.instance, "issued_at", None))
        due_date = attrs.get("due_date", getattr(self.instance, "due_date", None))
        if issued_at and due_date and due_date < issued_at:
            raise serializers.ValidationError(
                {"due_date": "El vencimiento no puede ser anterior a la emisión."}
            )
        return attrs


class PaymentSerializer(serializers.ModelSerializer):
    debt_ids = serializers.PrimaryKeyRelatedField(
        source="debts", many=True, read_only=True
    )

    class Meta:
        model = Payment
        fields = [
            "id",
            "tutor",
            "debt_ids",
            "buy_order",
            "authorization_code",
            "amount",
            "simulated",
            "status",
            "response_code",
            "created_at",
        ]


class PaymentSimulationInputSerializer(serializers.Serializer):
    debt_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=50
    )

    def validate_debt_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("No repitas cuentas en el pago.")
        return value


class TransbankPaymentInputSerializer(PaymentSimulationInputSerializer):
    pass


class TransbankReturnInputSerializer(serializers.Serializer):
    token_ws = serializers.CharField(required=False, allow_blank=False)
    TBK_ORDEN_COMPRA = serializers.CharField(required=False, max_length=40)
    TBK_ID_SESION = serializers.CharField(required=False, max_length=36)
    TBK_TOKEN = serializers.CharField(required=False, max_length=64)

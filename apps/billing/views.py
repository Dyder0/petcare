import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from drf_spectacular.utils import extend_schema

from apps.billing.models import Debt, Payment
from apps.billing.serializers import (
    DebtSerializer,
    PaymentSerializer,
    PaymentSimulationInputSerializer,
    TransbankPaymentInputSerializer,
    TransbankReturnInputSerializer,
)
from apps.common.permissions import IsBillingStaff
from apps.billing.transbank import (
    create_transbank_transaction,
    get_transbank_transaction,
)
from apps.appointments.models import Appointment
from transbank.error.transbank_error import TransbankError


logger = logging.getLogger(__name__)


class TransbankUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "No fue posible comunicarse con Transbank. Intenta nuevamente."
    default_code = "transbank_unavailable"


class DebtViewSet(ModelViewSet):
    queryset = Debt.objects.select_related("tutor", "pet").all()
    serializer_class = DebtSerializer
    permission_classes = [IsBillingStaff]
    filterset_fields = ["tutor", "pet", "status", "due_date"]
    search_fields = ["concept", "tutor__name", "tutor__rut", "pet__name"]
    ordering_fields = ["issued_at", "due_date", "amount", "created_at"]
    ordering = ["status", "due_date"]

    def perform_create(self, serializer):
        appointment = serializer.validated_data.get("appointment")
        try:
            with transaction.atomic():
                if appointment:
                    Appointment.objects.select_for_update().get(pk=appointment.pk)
                serializer.save()
        except IntegrityError as exc:
            if appointment:
                raise ValidationError(
                    {"appointment": "La cita ya tiene una cuenta por cobrar asociada."}
                ) from exc
            raise

    def perform_update(self, serializer):
        with transaction.atomic():
            debt = Debt.objects.select_for_update().get(pk=serializer.instance.pk)
            if debt.status == Debt.Status.PAID:
                raise ValidationError("No se puede modificar una cuenta ya pagada.")
            if debt.payments.filter(
                status__in=[Payment.Status.PENDING, Payment.Status.REVIEW]
            ).exists():
                raise ValidationError(
                    "No se puede modificar una cuenta con un intento de pago pendiente o en revisión."
                )
            serializer.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            debt = Debt.objects.select_for_update().get(pk=instance.pk)
            if debt.status == Debt.Status.PAID or debt.payments.exists():
                raise ValidationError(
                    "No se puede eliminar una cuenta que ya tiene un pago registrado."
                )
            debt.delete()


class PaymentViewSet(ReadOnlyModelViewSet):
    queryset = Payment.objects.select_related("tutor", "created_by").prefetch_related(
        "debts"
    )
    serializer_class = PaymentSerializer
    permission_classes = [IsBillingStaff]
    filterset_fields = ["tutor", "created_by", "simulated", "status"]
    search_fields = ["buy_order", "authorization_code", "tutor__name"]
    ordering_fields = ["created_at", "amount"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["post"], url_path="simulate")
    def simulate(self, request):
        if not settings.DEBUG:
            raise ValidationError(
                "Los pagos simulados están deshabilitados fuera del entorno local."
            )
        input_serializer = PaymentSimulationInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        debt_ids = input_serializer.validated_data["debt_ids"]

        with transaction.atomic():
            # Lock pending debts so concurrent requests cannot mark the same bill paid twice.
            debts = list(
                Debt.objects.select_for_update()
                .filter(id__in=debt_ids, status=Debt.Status.PENDING)
                .order_by("id")
            )
            if len(debts) != len(debt_ids):
                raise ValidationError(
                    {"debt_ids": "Una o más cuentas no existen o ya fueron pagadas."}
                )
            if Payment.objects.filter(
                debts__in=debts,
                status__in=[Payment.Status.PENDING, Payment.Status.REVIEW],
            ).exists():
                raise ValidationError(
                    {"debt_ids": "Una o más cuentas tienen un pago pendiente de resolver."}
                )

            tutor_ids = {debt.tutor_id for debt in debts}
            if len(tutor_ids) != 1:
                raise ValidationError(
                    {"debt_ids": "Todas las cuentas deben pertenecer al mismo tutor."}
                )

            payment = Payment.objects.create(
                tutor=debts[0].tutor,
                created_by=request.user,
                amount=sum((debt.amount for debt in debts), Decimal("0.00")),
                status=Payment.Status.AUTHORIZED,
            )
            payment.debts.set(debts)
            paid_at = timezone.now()
            Debt.objects.filter(id__in=debt_ids).update(
                status=Debt.Status.PAID,
                paid_at=paid_at,
                updated_at=paid_at,
            )

        return Response(
            PaymentSerializer(payment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="transbank")
    def transbank(self, request):
        input_serializer = TransbankPaymentInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        debt_ids = input_serializer.validated_data["debt_ids"]
        return_url = settings.TRANSBANK_RETURN_URL or request.build_absolute_uri(
            reverse("transbank-return")
        )
        if settings.TRANSBANK_ENVIRONMENT == "PRODUCTION" and not return_url.startswith(
            "https://"
        ):
            raise ValidationError(
                "Configura TRANSBANK_RETURN_URL como una URL HTTPS pública."
            )
        get_transbank_transaction()

        with transaction.atomic():
            debts = list(
                Debt.objects.select_for_update()
                .filter(id__in=debt_ids, status=Debt.Status.PENDING)
                .order_by("id")
            )
            if len(debts) != len(debt_ids):
                raise ValidationError(
                    {"debt_ids": "Una o más cuentas no existen o ya fueron pagadas."}
                )

            if len({debt.tutor_id for debt in debts}) != 1:
                raise ValidationError(
                    {"debt_ids": "Todas las cuentas deben pertenecer al mismo tutor."}
                )

            amount = sum((debt.amount for debt in debts), Decimal("0.00"))
            if amount != amount.to_integral_value():
                raise ValidationError(
                    {"debt_ids": "Webpay Plus requiere montos enteros en pesos chilenos."}
                )

            if Payment.objects.filter(
                debts__in=debts,
                status__in=[Payment.Status.PENDING, Payment.Status.REVIEW],
            ).exists():
                raise ValidationError(
                    {"debt_ids": "Ya existe un intento de pago pendiente para una cuenta."}
                )

            payment = Payment.objects.create(
                tutor=debts[0].tutor,
                created_by=request.user,
                amount=amount,
                simulated=False,
                status=Payment.Status.PENDING,
                authorization_code="",
            )
            payment.debts.set(debts)

        try:
            response = create_transbank_transaction(
                buy_order=payment.buy_order,
                session_id=str(payment.id),
                amount=int(amount),
                return_url=return_url,
            )
        except (TransbankError, requests.RequestException) as exc:
            logger.exception("Transbank transaction creation failed.")
            payment.status = Payment.Status.REJECTED
            payment.save(update_fields=["status", "updated_at"])
            raise TransbankUnavailable() from exc

        payment.transbank_token = response["token"]
        payment.save(update_fields=["transbank_token", "updated_at"])
        return Response(
            {
                "payment_id": str(payment.id),
                "url": response["url"],
                "token": response["token"],
                "amount": str(payment.amount),
            },
            status=status.HTTP_201_CREATED,
        )


class TransbankReturnView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[TransbankReturnInputSerializer],
        responses=PaymentSerializer,
    )
    def get(self, request):
        return self._handle_return(request.query_params)

    @extend_schema(
        request=TransbankReturnInputSerializer,
        responses=PaymentSerializer,
    )
    def post(self, request):
        return self._handle_return(request.data)

    def _handle_return(self, data):
        token = data.get("token_ws")
        if token:
            if not isinstance(token, str) or len(token) > 64:
                raise ValidationError("Token de Transbank inválido.")
            return self._commit_transaction(token)

        buy_order = data.get("TBK_ORDEN_COMPRA")
        session_id = data.get("TBK_ID_SESION")
        tbk_token = data.get("TBK_TOKEN")
        if buy_order and session_id:
            if (
                not isinstance(buy_order, str)
                or len(buy_order) > 40
                or not isinstance(session_id, str)
                or len(session_id) > 36
                or (tbk_token and (
                    not isinstance(tbk_token, str) or len(tbk_token) > 64
                ))
            ):
                raise ValidationError("Datos de cancelación de Transbank inválidos.")
            with transaction.atomic():
                payment = Payment.objects.select_for_update().filter(
                    buy_order=buy_order, status=Payment.Status.PENDING
                ).first()
                if payment is None or str(payment.id) != session_id:
                    raise ValidationError("No se encontró el intento de pago.")

                if tbk_token:
                    if tbk_token != payment.transbank_token:
                        raise ValidationError("El token de Transbank no coincide.")
                    try:
                        result = get_transbank_transaction().status(tbk_token)
                    except (TransbankError, requests.RequestException) as exc:
                        logger.exception("Transbank transaction status check failed.")
                        raise TransbankUnavailable() from exc

                    if result["status"] == "INITIALIZED":
                        payment.status = Payment.Status.CANCELED
                    elif result["status"] == "FAILED":
                        payment.status = Payment.Status.REJECTED
                    else:
                        logger.error(
                            "Transbank returned an unresolved status for payment %s.",
                            payment.buy_order,
                        )
                        payment.status = Payment.Status.REVIEW
                    payment.response_code = result.get("response_code")
                    payment.save(
                        update_fields=["status", "response_code", "updated_at"]
                    )
                    return Response(PaymentSerializer(payment).data)

                payment.status = Payment.Status.CANCELED
                payment.save(update_fields=["status", "updated_at"])
                return Response(PaymentSerializer(payment).data)

        raise ValidationError("Transbank no devolvió un token de transacción.")

    def _commit_transaction(self, token):
        try:
            with transaction.atomic():
                payment = Payment.objects.select_for_update().get(
                    transbank_token=token
                )
                if payment.status == Payment.Status.AUTHORIZED:
                    return Response(PaymentSerializer(payment).data)
                if payment.status != Payment.Status.PENDING:
                    raise ValidationError("Este intento de pago ya fue resuelto.")

                result = get_transbank_transaction().commit(token)
                response_code = int(result["response_code"])
                authorized = (
                    result["status"] == "AUTHORIZED"
                    and response_code == 0
                    and result["buy_order"] == payment.buy_order
                    and Decimal(str(result["amount"])) == payment.amount
                )
                payment.response_code = response_code
                if (
                    result["status"] == "AUTHORIZED"
                    and response_code == 0
                    and not authorized
                ):
                    logger.error(
                        "Transbank authorized payment %s has a mismatched order or amount.",
                        payment.buy_order,
                    )
                    payment.status = Payment.Status.REVIEW
                    payment.save(
                        update_fields=["status", "response_code", "updated_at"]
                    )
                    return Response(PaymentSerializer(payment).data)
                if not authorized:
                    payment.status = Payment.Status.REJECTED
                    payment.save(
                        update_fields=["status", "response_code", "updated_at"]
                    )
                    return Response(PaymentSerializer(payment).data)

                debts = list(
                    Debt.objects.select_for_update()
                    .filter(payments=payment)
                    .order_by("id")
                )
                if not debts or any(
                    debt.status != Debt.Status.PENDING for debt in debts
                ):
                    logger.error(
                        "Transbank authorized payment %s has debts that are no longer pending.",
                        payment.buy_order,
                    )
                    raise ValidationError(
                        "El pago fue autorizado, pero las cuentas requieren revisión administrativa."
                    )

                payment.status = Payment.Status.AUTHORIZED
                payment.authorization_code = str(result["authorization_code"])
                payment.save(
                    update_fields=[
                        "status",
                        "response_code",
                        "authorization_code",
                        "updated_at",
                    ]
                )
                paid_at = timezone.now()
                Debt.objects.filter(pk__in=[debt.pk for debt in debts]).update(
                    status=Debt.Status.PAID,
                    paid_at=paid_at,
                    updated_at=paid_at,
                )
                return Response(PaymentSerializer(payment).data)
        except Payment.DoesNotExist as exc:
            raise ValidationError("No se encontró la transacción de pago.") from exc
        except (TransbankError, requests.RequestException) as exc:
            logger.exception("Transbank transaction commit failed.")
            raise TransbankUnavailable() from exc

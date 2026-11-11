import logging
import re
from decimal import Decimal
from hashlib import sha256
from urllib.parse import urljoin, urlparse

import requests
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import (
    ImproperlyConfigured,
    ValidationError as DjangoValidationError,
)
from django.db import transaction
from django.http import Http404, HttpResponseBadRequest
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.exceptions import APIException, ValidationError
from transbank.error.transbank_error import TransbankError

from apps.billing.models import Debt, Payment
from apps.billing.transbank import get_transbank_transaction
from apps.billing.views import TransbankReturnView, TransbankUnavailable
from apps.patients.models import Tutor
from apps.patients.validators import normalize_rut, validate_rut


logger = logging.getLogger(__name__)


@require_http_methods(["GET", "POST"])
def public_payment_portal(request):
    context = {
        "rut": "",
        "debt_rows": [],
        "total_due": Decimal("0.00"),
    }
    if request.method == "POST":
        if settings.TRANSBANK_ENVIRONMENT != "INTEGRATION":
            return render(
                request,
                "payments/payment_link_required.html",
                {
                    **context,
                    "error": "La consulta pública por RUT solo está habilitada en el ambiente de integración.",
                },
                status=503,
            )
        if _is_rut_lookup_limited(request):
            return render(
                request,
                "payments/payment_link_required.html",
                {
                    **context,
                    "error": "Demasiados intentos. Espera un minuto e inténtalo nuevamente.",
                },
                status=429,
            )

        entered_rut = request.POST.get("rut", "").strip()
        try:
            validate_rut(entered_rut)
        except DjangoValidationError:
            return render(
                request,
                "payments/payment_link_required.html",
                {
                    **context,
                    "rut": entered_rut,
                    "error": "Ingresa un RUT chileno válido.",
                },
                status=400,
            )

        rut = normalize_rut(entered_rut)
        body, verifier = rut.split("-")
        formatted_body = f"{int(body):,}".replace(",", ".")
        rut_variants = (rut, f"{formatted_body}-{verifier}", f"{body}{verifier}")
        tutor = Tutor.objects.filter(rut__in=rut_variants).first()
        if tutor:
            debts = list(
                Debt.objects.select_related("pet")
                .filter(tutor=tutor, status=Debt.Status.PENDING)
                .order_by("due_date", "created_at")
            )
            if debts:
                active_debt_ids = set(
                    Payment.objects.filter(
                        debts__in=debts,
                        status__in=[Payment.Status.PENDING, Payment.Status.REVIEW],
                    ).values_list("debts__id", flat=True)
                )
                context.update(
                    {
                        "rut": rut,
                        "debt_rows": [
                            {
                                "debt": debt,
                                "payment_in_progress": debt.id in active_debt_ids,
                            }
                            for debt in debts
                        ],
                        "total_due": sum(
                            (debt.amount for debt in debts), Decimal("0.00")
                        ),
                        "has_debts": True,
                    }
                )

        if not context.get("has_debts"):
            context.update(
                {
                    "rut": rut,
                    "message": "No encontramos cuentas pendientes asociadas a ese RUT.",
                }
            )
    return render(request, "payments/payment_link_required.html", context)


def _is_rut_lookup_limited(request):
    ip_address = request.META.get("REMOTE_ADDR", "unknown")
    cache_key = f"public-payment-rut:{sha256(ip_address.encode()).hexdigest()}"
    if cache.add(cache_key, 1, timeout=60):
        return False
    return cache.incr(cache_key) > 10


@require_http_methods(["GET", "POST"])
def public_payment_page(request, token):
    debt = _get_public_debt(token)

    if request.method == "POST":
        if request.POST.get("action") != "checkout":
            return HttpResponseBadRequest("Solicitud de pago inválida.")
        return _start_checkout(request, debt)

    latest_payment = debt.payments.order_by("-created_at").first()
    return render(
        request,
        "payments/public_payment.html",
        {"debt": debt, "payment": latest_payment},
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def public_payment_return(request, token):
    debt = _get_public_debt(token)
    callback_data = request.GET if request.method == "GET" else request.POST
    if not (
        callback_data.get("token_ws")
        or callback_data.get("TBK_TOKEN")
        or callback_data.get("TBK_ORDEN_COMPRA")
    ):
        return HttpResponseBadRequest("Retorno de Transbank inválido.")
    return _handle_transbank_return(request, debt, callback_data)


def _get_public_debt(token):
    # El token aleatorio es la credencial del enlace; no se consultan deudas por RUT.
    if not re.fullmatch(r"[a-f0-9]{32}", token):
        raise Http404("El enlace de pago no existe o ya no está disponible.")
    debt = Debt.objects.select_related("pet").filter(payment_token=token).first()
    if debt is None:
        raise Http404("El enlace de pago no existe o ya no está disponible.")
    return debt


def _handle_transbank_return(request, debt, callback_data):
    transbank_return = TransbankReturnView()
    payment = None
    try:
        token_ws = callback_data.get("token_ws")
        if token_ws:
            if not isinstance(token_ws, str) or len(token_ws) > 64:
                raise ValidationError("Token de Transbank inválido.")
            payment = Payment.objects.filter(
                transbank_token=token_ws, debts=debt
            ).first()
            if payment is None:
                raise ValidationError("No se encontró el intento de pago.")
            transbank_return._commit_transaction(token_ws)
        else:
            buy_order = callback_data.get("TBK_ORDEN_COMPRA")
            if not isinstance(buy_order, str) or len(buy_order) > 40:
                raise ValidationError("Datos de cancelación de Transbank inválidos.")
            payment = Payment.objects.filter(
                buy_order=buy_order,
                debts=debt,
            ).first()
            if payment is None:
                raise ValidationError("No se encontró el intento de pago.")
            transbank_return._handle_return(callback_data)
    except TransbankUnavailable:
        logger.exception("Unable to resolve public Transbank return.")
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "payment": payment,
                "error": "No pudimos confirmar el resultado con Transbank. Contacta a la clínica antes de volver a pagar.",
            },
            status=502,
        )
    except APIException as exc:
        logger.warning("Public Transbank return could not be resolved.")
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "payment": payment,
                "error": (
                    "No pudimos confirmar el resultado con Transbank. Contacta a la clínica antes de volver a pagar."
                    if exc.status_code >= 500
                    else str(exc.detail)
                ),
            },
            status=exc.status_code,
        )
    except (TransbankError, requests.RequestException) as exc:
        logger.exception("Unable to resolve public Transbank return.")
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "payment": payment,
                "error": "No pudimos confirmar el resultado con Transbank. Contacta a la clínica antes de volver a pagar.",
            },
            status=502,
        )

    payment.refresh_from_db()
    return render(
        request,
        "payments/public_payment.html",
        {"debt": debt, "payment": payment},
    )


def _start_checkout(request, debt):
    if debt.status != Debt.Status.PENDING:
        return render(
            request,
            "payments/public_payment.html",
            {"debt": debt, "error": "Esta cuenta ya no está pendiente de pago."},
            status=409,
        )
    if debt.amount != debt.amount.to_integral_value():
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "El monto no se puede cobrar con Webpay Plus en pesos chilenos.",
            },
            status=400,
        )

    return_path = reverse(
        "public-payment-return", kwargs={"token": debt.payment_token}
    )
    try:
        return_url = _public_absolute_url(request, return_path)
        gateway = get_transbank_transaction()
    except ImproperlyConfigured:
        logger.exception("Transbank or public URL configuration is invalid.")
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "El servicio de pago no está configurado correctamente. Contacta a la clínica.",
            },
            status=503,
        )
    if settings.TRANSBANK_ENVIRONMENT == "PRODUCTION" and not return_url.startswith(
        "https://"
    ):
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "El portal de pago debe estar publicado con HTTPS para usar Transbank.",
            },
            status=503,
        )

    try:
        with transaction.atomic():
            # Serializa los intentos para impedir dos checkouts simultáneos para una deuda.
            debt = Debt.objects.select_for_update().get(pk=debt.pk)
            if debt.status != Debt.Status.PENDING:
                return render(
                    request,
                    "payments/public_payment.html",
                    {"debt": debt, "error": "Esta cuenta ya no está pendiente de pago."},
                    status=409,
                )
            if debt.payments.filter(
                status__in=[Payment.Status.PENDING, Payment.Status.REVIEW]
            ).exists():
                return render(
                    request,
                    "payments/public_payment.html",
                    {
                        "debt": debt,
                        "error": "Ya hay un intento de pago en curso. Actualiza esta página en un momento.",
                    },
                    status=409,
                )
            payment = Payment.objects.create(
                tutor=debt.tutor,
                amount=debt.amount,
                simulated=False,
                status=Payment.Status.PENDING,
                authorization_code="",
            )
            payment.debts.add(debt)
    except Debt.DoesNotExist as exc:
        raise Http404("La cuenta ya no está disponible.") from exc

    try:
        response = gateway.create(
            buy_order=payment.buy_order,
            session_id=str(payment.id),
            amount=int(debt.amount),
            return_url=return_url,
        )
    except TransbankError as exc:
        logger.exception("Transbank rejected public checkout creation.")
        payment.status = Payment.Status.REJECTED
        payment.save(update_fields=["status", "updated_at"])
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "Transbank no pudo iniciar el pago. Intenta nuevamente más tarde.",
            },
            status=502,
        )
    except requests.RequestException as exc:
        logger.exception("Transbank public checkout result is unknown.")
        payment.status = Payment.Status.REVIEW
        payment.save(update_fields=["status", "updated_at"])
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "No pudimos confirmar el inicio del pago con Transbank. Contacta a la clínica antes de volver a intentarlo.",
            },
            status=502,
        )

    token_ws = response.get("token") if isinstance(response, dict) else None
    checkout_url = response.get("url") if isinstance(response, dict) else None
    if (
        not isinstance(token_ws, str)
        or not token_ws
        or len(token_ws) > 64
        or not _is_transbank_checkout_url(checkout_url)
    ):
        logger.error("Transbank returned an invalid checkout URL.")
        payment.status = Payment.Status.REVIEW
        payment.save(update_fields=["status", "updated_at"])
        return render(
            request,
            "payments/public_payment.html",
            {
                "debt": debt,
                "error": "Transbank devolvió una dirección de pago inválida. Contacta a la clínica.",
            },
            status=502,
        )
    payment.transbank_token = token_ws
    payment.save(update_fields=["transbank_token", "updated_at"])
    return render(
        request,
        "payments/transbank_redirect.html",
        {"checkout_url": checkout_url, "token": token_ws},
    )


def _public_absolute_url(request, path):
    if settings.PUBLIC_BASE_URL:
        base_url = settings.PUBLIC_BASE_URL
        parsed = urlparse(base_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ImproperlyConfigured("PUBLIC_BASE_URL must be an HTTP(S) origin.")
        if not settings.DEBUG and parsed.scheme != "https":
            raise ImproperlyConfigured("PUBLIC_BASE_URL must use HTTPS in production.")
        return urljoin(f"{base_url}/", path.lstrip("/"))
    if not settings.DEBUG:
        raise ImproperlyConfigured("PUBLIC_BASE_URL is required in production.")
    return request.build_absolute_uri(path)


def _is_transbank_checkout_url(url):
    if not isinstance(url, str):
        return False
    allowed_host = (
        "webpay3gint.transbank.cl"
        if settings.TRANSBANK_ENVIRONMENT == "INTEGRATION"
        else "webpay3g.transbank.cl"
    )
    try:
        parsed = urlparse(url)
        return (
            parsed.scheme == "https"
            and parsed.hostname == allowed_host
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
        )
    except ValueError:
        return False

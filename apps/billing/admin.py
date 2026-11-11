from urllib.parse import urljoin

from django.conf import settings
from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from apps.billing.models import Debt, Payment


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = (
        "concept",
        "tutor",
        "pet",
        "amount",
        "status",
        "due_date",
        "payment_link",
    )
    list_filter = ("status", "due_date")
    search_fields = ("concept", "tutor__name", "tutor__rut", "pet__name")
    readonly_fields = ("payment_link", "status", "paid_at")

    @admin.display(description="Enlace público de pago")
    def payment_link(self, obj):
        path = reverse(
            "public-payment", kwargs={"token": obj.payment_token}
        )
        base_url = settings.PUBLIC_BASE_URL or (
            "http://127.0.0.1:8000" if settings.DEBUG else ""
        )
        if not base_url:
            return "Configura PUBLIC_BASE_URL para compartir enlaces de pago."
        url = urljoin(f"{base_url}/", path.lstrip("/"))
        return format_html('<a href="{}">{}</a>', url, url)

    def has_change_permission(self, request, obj=None):
        if obj and (obj.status == Debt.Status.PAID or obj.payments.exists()):
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and (obj.status == Debt.Status.PAID or obj.payments.exists()):
            return False
        return super().has_delete_permission(request, obj)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "buy_order",
        "tutor",
        "amount",
        "status",
        "simulated",
        "created_at",
    )
    list_filter = ("status", "simulated", "created_at")
    search_fields = ("buy_order", "authorization_code", "tutor__name")
    readonly_fields = (
        "tutor",
        "debts",
        "created_by",
        "buy_order",
        "authorization_code",
        "amount",
        "simulated",
        "status",
        "transbank_token",
        "response_code",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
